import { randomUUID } from "node:crypto";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { attachmentAbsolutePath } from "../lib/eventAttachment.js";
import { TEMP_DIR } from "../lib/uploads.js";
import {
  TRANSCODE_STATUS,
  probeVideo,
  shouldSkipVideoTranscode,
  transcodeTimeoutMs,
  transcodeVideoTo720p,
  unlinkQuiet,
} from "../lib/videoTranscode.js";

/** kick가 업로드 완료에서 불리므로 폴링은 유휴 재개용이다. 5초는 DB를 과하게 두드린다. */
const TICK_MS = 60_000;
/** 출력이 원본의 이 비율 이상이면 바꿔 끼우지 않는다 — 디스크만 두 배가 된다 */
const MIN_SHRINK_RATIO = 0.95;

let drain: Promise<void> | null = null;
let rerun = false;

export function kickVideoTranscode(): void {
  if (drain) {
    rerun = true;
    return;
  }
  drain = drainQueue()
    .catch((err) => console.error("[video-transcode] drain failed", err))
    .finally(() => {
      drain = null;
      if (rerun) {
        rerun = false;
        kickVideoTranscode();
      }
    });
}

export function startVideoTranscodeJob(): void {
  recoverStuckProcessing()
    .then(() => kickVideoTranscode())
    .catch((err) => console.error("[video-transcode] recover failed", err));
  setInterval(() => kickVideoTranscode(), TICK_MS).unref();
}

/** API가 변환 중에 죽으면 processing에 남는다. 기동 시 한 번만 pending으로 되돌린다. */
export async function recoverStuckProcessing(): Promise<number> {
  const result = await prisma.attachment.updateMany({
    where: { transcodeStatus: TRANSCODE_STATUS.PROCESSING },
    data: { transcodeStatus: TRANSCODE_STATUS.PENDING },
  });
  return result.count;
}

async function drainQueue(): Promise<void> {
  while (await processNext()) {
    // 하나 끝나면 다음 pending을 바로 집어 동시 ffmpeg는 항상 1개
  }
}

async function processNext(): Promise<boolean> {
  let claimed: Claimed | null;
  try {
    claimed = await claimNextPending();
  } catch (err) {
    console.error("[video-transcode] claim failed", err);
    return false;
  }
  if (!claimed) return false;
  try {
    await transcodeClaimedAttachment(claimed);
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 300) : String(err);
    console.warn(`[video-transcode] failed ${claimed.id}: ${detail}`);
    await prisma.attachment
      .updateMany({
        where: { id: claimed.id, transcodeStatus: TRANSCODE_STATUS.PROCESSING },
        data: { transcodeStatus: TRANSCODE_STATUS.FAILED },
      })
      .catch(() => {});
  }
  return true;
}

type Claimed = { id: string; path: string; size: number };

async function claimNextPending(): Promise<Claimed | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Claimed[]>`
      SELECT a.id, a.path, a.size
      FROM "Attachment" a
      INNER JOIN "Event" e ON e.id = a."eventId"
      WHERE a."transcodeStatus" = ${TRANSCODE_STATUS.PENDING}
        AND e."deletedAt" IS NULL
      ORDER BY a."createdAt" ASC
      LIMIT 1
      FOR UPDATE OF a SKIP LOCKED
    `;
    const row = rows[0];
    if (!row) return null;
    await tx.attachment.update({
      where: { id: row.id },
      data: { transcodeStatus: TRANSCODE_STATUS.PROCESSING },
    });
    return row;
  });
}

/**
 * 업로드 응답 밖에서 돈다. 같은 path를 덮어쓴다 — 목록이 들고 있는 URL로
 * 다음 재생이 변환본을 받게. 변환 중에도 원본 Range 재생은 된다.
 */
export async function transcodeClaimedAttachment(row: Claimed): Promise<void> {
  let absPath: string;
  try {
    absPath = attachmentAbsolutePath(row.path);
  } catch {
    await mark(row.id, TRANSCODE_STATUS.FAILED);
    return;
  }

  const probe = await probeVideo(absPath);
  if (!probe || shouldSkipVideoTranscode({ ...probe, sizeBytes: row.size })) {
    await prisma.attachment.updateMany({
      where: { id: row.id, transcodeStatus: TRANSCODE_STATUS.PROCESSING },
      data: {
        transcodeStatus: TRANSCODE_STATUS.SKIPPED,
        width: probe?.width ?? undefined,
        height: probe?.height ?? undefined,
      },
    });
    return;
  }

  const outPath = path.join(TEMP_DIR, `transcode-${row.id}-${randomUUID()}.mp4`);
  try {
    await mkdir(TEMP_DIR, { recursive: true });
    await transcodeVideoTo720p(absPath, outPath, transcodeTimeoutMs(probe.durationSec));
    const outStat = await stat(outPath);
    if (outStat.size >= row.size * MIN_SHRINK_RATIO) {
      await unlinkQuiet(outPath);
      await mark(row.id, TRANSCODE_STATUS.SKIPPED, probe.width, probe.height);
      return;
    }

    const outProbe = await probeVideo(outPath);
    await rename(outPath, absPath);
    const replaced = await prisma.attachment.updateMany({
      where: { id: row.id, transcodeStatus: TRANSCODE_STATUS.PROCESSING },
      data: {
        mime: "video/mp4",
        size: outStat.size,
        width: outProbe?.width ?? probe.width ?? undefined,
        height: outProbe?.height ?? probe.height ?? undefined,
        transcodeStatus: TRANSCODE_STATUS.READY,
      },
    });
    if (replaced.count === 0) {
      const stillThere = await prisma.attachment.findUnique({
        where: { id: row.id },
        select: { id: true },
      });
      if (!stillThere) await unlinkQuiet(absPath);
    }
  } catch (err) {
    await unlinkQuiet(outPath);
    throw err;
  }
}

async function mark(
  id: string,
  status: string,
  width?: number | null,
  height?: number | null,
): Promise<void> {
  await prisma.attachment.updateMany({
    where: { id, transcodeStatus: TRANSCODE_STATUS.PROCESSING },
    data: {
      transcodeStatus: status,
      ...(width != null ? { width } : {}),
      ...(height != null ? { height } : {}),
    },
  });
}
