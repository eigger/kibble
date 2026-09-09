import { randomUUID } from "node:crypto";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { attachmentAbsolutePath, savePosterForVideo } from "../lib/eventAttachment.js";
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

/**
 * 한 첨부를 이 횟수까지만 집는다.
 *
 * 예전에는 상한이 없었다. ffmpeg가 컨테이너를 OOM으로 죽이면 실패 처리 코드가 아예
 * 돌지 않아 행이 `processing`으로 남고, 다음 기동의 `recoverStuckProcessing`이 그걸
 * 다시 `pending`으로 되돌린다 — 죽고 되살리기를 무한히 반복하는 고리였다. 그래서
 * 실패한 뒤가 아니라 **집는 순간** 센다.
 */
export const MAX_TRANSCODE_ATTEMPTS = 3;

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
    .then(() => requeueFailedTranscodes())
    .then((requeued) => {
      if (requeued > 0) console.warn(`[video-transcode] requeued ${requeued} failed attachment(s)`);
      return kickVideoTranscode();
    })
    .then(() => backfillMissingPosters())
    .catch((err) => console.error("[video-transcode] recover failed", err));
  setInterval(() => kickVideoTranscode(), TICK_MS).unref();
}

/** 한 번에 이만큼만 메운다. 못 읽는 파일이 섞여 있어도 기동이 붙잡히지 않게. */
const POSTER_BACKFILL_LIMIT = 50;

/**
 * 포스터 없이 끝난 영상을 기동 때 한 번 메운다.
 *
 * 예전에는 변환이 끝난 뒤에야 프레임을 뽑았다 — 변환이 타임아웃·OOM으로 죽으면
 * `failed`로 넘어가며 포스터도 같이 없어졌고, 다시 뽑을 경로가 없어 그 영상은
 * 영구히 썸네일이 안 나왔다. 추출은 이제 변환 앞으로 옮겼지만, 이미 그렇게 남은
 * 행들은 여기서 메운다. 주기적으로 돌리지 않는다 — 진짜로 못 읽는 파일이면
 * 매 tick마다 ffmpeg를 20초씩 태우게 된다.
 */
export async function backfillMissingPosters(): Promise<number> {
  let rows: Claimed[];
  try {
    rows = await prisma.$queryRaw<Claimed[]>`
      SELECT a.id, a.path, a.size, a."eventId"
      FROM "Attachment" a
      INNER JOIN "Event" e ON e.id = a."eventId"
      WHERE a."posterPath" IS NULL
        AND a.mime LIKE 'video/%'
        AND a."transcodeStatus" IN (${TRANSCODE_STATUS.SKIPPED}, ${TRANSCODE_STATUS.READY}, ${TRANSCODE_STATUS.FAILED})
        AND e."deletedAt" IS NULL
      ORDER BY a."createdAt" DESC
      LIMIT ${POSTER_BACKFILL_LIMIT}
    `;
  } catch (err) {
    console.error("[video-transcode] poster backfill query failed", err);
    return 0;
  }

  let filled = 0;
  for (const row of rows) {
    let absPath: string;
    try {
      absPath = attachmentAbsolutePath(row.path);
    } catch {
      continue;
    }
    await ensurePoster(row, absPath);
    filled += 1;
  }
  if (filled > 0) console.warn(`[video-transcode] poster backfill visited ${filled} video(s)`);
  return filled;
}

/** API가 변환 중에 죽으면 processing에 남는다. 기동 시 한 번만 pending으로 되돌린다. */
/**
 * `failed`로 끝난 영상에 다시 기회를 준다. 기동 때 한 번만 — 주기적으로 돌리면
 * 정말 못 읽는 파일에 ffmpeg를 계속 태우게 된다.
 *
 * 실패해도 원본은 지우지 않는다 (K-13). 변환은 용량을 줄이는 최적화지 첨부의
 * 조건이 아니므로, 상한을 다 쓰면 원본 그대로 `failed`에 머문다.
 */
export async function requeueFailedTranscodes(): Promise<number> {
  const result = await prisma.attachment.updateMany({
    where: {
      transcodeStatus: TRANSCODE_STATUS.FAILED,
      transcodeAttempts: { lt: MAX_TRANSCODE_ATTEMPTS },
    },
    data: { transcodeStatus: TRANSCODE_STATUS.PENDING },
  });
  return result.count;
}

export async function recoverStuckProcessing(): Promise<number> {
  // 상한을 다 쓴 행까지 되돌리면 무한 고리가 그대로다 — ffmpeg가 프로세스를 죽이는
  // 파일은 매 기동마다 다시 집히고 또 죽는다. 남은 기회가 없으면 여기서 굳힌다.
  await prisma.attachment.updateMany({
    where: {
      transcodeStatus: TRANSCODE_STATUS.PROCESSING,
      transcodeAttempts: { gte: MAX_TRANSCODE_ATTEMPTS },
    },
    data: { transcodeStatus: TRANSCODE_STATUS.FAILED },
  });
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

type Claimed = { id: string; path: string; size: number; eventId: string };

async function claimNextPending(): Promise<Claimed | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Claimed[]>`
      SELECT a.id, a.path, a.size, a."eventId"
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
      data: {
        transcodeStatus: TRANSCODE_STATUS.PROCESSING,
        transcodeAttempts: { increment: 1 },
      },
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

  // 변환보다 먼저, 원본에서 뽑는다. 프레임 한 장은 수백 ms고 변환은 분 단위다 —
  // 변환 뒤에 뽑으면 타임아웃·OOM으로 변환이 죽는 순간 포스터까지 같이 사라진다.
  // 길고 큰 영상만 썸네일이 안 나오던 게 이것이다. 실패해도 변환은 그대로 간다 (K-12).
  await ensurePoster(row, absPath);

  const probe = await probeVideo(absPath);
  if (!probe || shouldSkipVideoTranscode({ ...probe, sizeBytes: row.size })) {
    await mark(row.id, TRANSCODE_STATUS.SKIPPED, probe?.width, probe?.height);
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

/**
 * 대표 프레임을 뽑아 붙인다. 이미 붙어 있으면 방금 만든 파일은 주인이 없으므로 지운다.
 * 포스터는 첨부의 조건이 아니다 — 실패는 전부 삼킨다 (K-12).
 */
async function ensurePoster(row: Claimed, absPath: string): Promise<void> {
  const posterPath = await savePosterForVideo(row.eventId, absPath);
  if (!posterPath) return;
  const linked = await prisma.attachment
    .updateMany({ where: { id: row.id, posterPath: null }, data: { posterPath } })
    .catch(() => ({ count: 0 }));
  if (linked.count === 0) {
    await unlinkQuiet(attachmentAbsolutePath(posterPath)).catch(() => {});
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
