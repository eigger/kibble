import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { processImageForStorage } from "./imageProcessing.js";
import { extractVideoPoster } from "./videoPoster.js";
import { TRANSCODE_STATUS } from "./videoTranscode.js";
import { UPLOAD_DIR, deleteUploadedFile } from "./uploads.js";
import { prisma } from "./prisma.js";
import { attachmentSelect } from "./attachmentSelect.js";

export const MAX_ATTACHMENTS_PER_EVENT = 9;
const EVENT_SUBDIR = "events";

// sharp 프리빌트 바이너리는 라이선스 때문에 HEVC 디코더 없이 빌드된다 — libheif가
// 들어 있어도 .heic은 열지 못하고 .avif만 된다. 못 여는 형식을 허용 목록에 두면
// 받아놓고 "손상된 이미지"로 되돌려주게 되므로, 런타임에 물어보고 목록을 정한다.
// (libheif-full로 빌드한 환경에서는 자동으로 다시 허용된다)
const HEIC_DECODABLE = sharp.format.heif?.input?.fileSuffix?.includes(".heic") ?? false;

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  ...(HEIC_DECODABLE ? ["image/heic", "image/heif"] : []),
]);

// 안드로이드 갤러리·기본 카메라는 mp4/mov 밖의 컨테이너도 내놓는다. 업로드는
// 원본 그대로 받고, 큰 파일만 백그라운드에서 720p로 줄인다 (K-12).
const VIDEO_EXTENSIONS: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/3gpp": ".3gp",
  "video/x-matroska": ".mkv",
};
const ALLOWED_VIDEO_MIME = new Set(Object.keys(VIDEO_EXTENSIONS));

export const ALLOWED_ATTACHMENT_MIME = new Set([...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME]);

export class InvalidAttachmentError extends Error {
  constructor() {
    super("INVALID_ATTACHMENT");
    this.name = "InvalidAttachmentError";
  }
}

export function attachmentAbsolutePath(relativePath: string): string {
  const normalized = path.normalize(relativePath);
  const abs = path.resolve(UPLOAD_DIR, normalized);
  const uploadRoot = path.resolve(UPLOAD_DIR);
  if (abs !== uploadRoot && !abs.startsWith(`${uploadRoot}${path.sep}`)) {
    throw new Error("PATH_ESCAPE");
  }
  return abs;
}

function videoExtension(mime: string): string {
  return VIDEO_EXTENSIONS[mime] ?? ".mp4";
}

export type SavedEventAttachment = {
  path: string;
  mime: string;
  size: number;
  /** 저장된 바이트의 sha256. 중복 판정 근거이자 다음 업로드가 이어붙을 자리다 */
  contentHash?: string | null;
  width: number | null;
  height: number | null;
  /** 영상 목록용 대표 프레임. 추출에 실패하면 null — 첨부의 조건이 아니다 (K-12) */
  posterPath?: string | null;
  /** 영상만. pending이면 백그라운드 변환 대기. 사진은 두지 않는다 */
  transcodeStatus?: string | null;
};

/**
 * 영상의 대표 프레임을 저장하고 상대 경로를 돌려준다. 실패는 전부 삼킨다 —
 * 포스터가 없으면 클라이언트가 예전처럼 <video>로 되돌아갈 뿐이다.
 */
export async function savePosterForVideo(eventId: string, videoAbsPath: string): Promise<string | null> {
  try {
    const frame = await extractVideoPoster(videoAbsPath);
    if (!frame) return null;
    const processed = await processImageForStorage(frame);
    const relativePath = `${EVENT_SUBDIR}/${eventId}-${randomUUID()}-poster${processed.ext}`;
    await writeFile(attachmentAbsolutePath(relativePath), processed.buffer);
    return relativePath;
  } catch {
    return null;
  }
}

export function hashAttachmentBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** 큰 영상을 통째로 메모리에 올리지 않는다 — 청크 업로드 상한은 500MB다. */
export async function hashAttachmentFile(absolutePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(absolutePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

export type LinkedCopy = {
  path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  transcodeStatus: string | null;
  posterPath: string | null;
};

/**
 * 같은 가구에 같은 바이트가 이미 있으면 새로 쓰지 않고 **하드링크**로 잇는다.
 *
 * 행을 공유하지 않는 이유: `Attachment`는 `@@unique([path])`이고 삭제 경로가 여러
 * 군데다. 참조 수를 우리가 세기 시작하면 어느 한 곳만 빠져도 남의 사진이 사라진다.
 * 하드링크면 참조 수는 파일시스템이 세고, 기존 삭제 코드(`unlink` 한 번)가 그대로
 * 맞는다 — 마지막 이름이 사라질 때 블록이 풀린다.
 *
 * 휴지통에 있는 첨부는 대상에서 뺀다. 링크 자체는 안전하지만(퍼지가 지우는 건 그쪽
 * 이름 하나뿐이다) 지워질 예정인 것에 새 참조가 붙는 그림은 설명하기 어렵다.
 *
 * 실패는 전부 삼키고 null을 돌려준다 — 중복 제거는 최적화지 저장의 조건이 아니다 (K-12).
 */
export async function linkExistingCopy(
  householdId: string,
  contentHash: string,
  /**
   * 새 이름을 정한다. 원본 행이 변환을 마쳤다면 바이트는 MP4인데 `contentHash`는 업로드
   * 원본의 것이라, 확장자를 업로드 mime이 아니라 **원본 행의 mime**에서 얻어야 한다.
   */
  destFor: (source: { mime?: string }) => string,
  fallback?: { mime: string; size: number; width: number | null; height: number | null },
): Promise<LinkedCopy | null> {
  const selectSource = {
    path: true,
    mime: true,
    size: true,
    width: true,
    height: true,
    posterPath: true,
    transcodeStatus: true,
  } as const;
  let destAbs: string | null = null;
  try {
    const existing = await prisma.attachment.findFirst({
      // K-1 — 가구 경계는 이벤트를 통해 건다. 남의 가구 파일에 링크가 붙으면 안 된다.
      where: { contentHash, event: { householdId, deletedAt: null } },
      select: selectSource,
      orderBy: { createdAt: "asc" },
    });
    if (!existing) return null;

    const sourceAbs = attachmentAbsolutePath(existing.path);
    const info = await stat(sourceAbs);
    if (!info.isFile()) return null;

    // 변환을 끝낸(또는 건너뛴) 파일이면 그 결과를 그대로 물려받는다 — 다시 변환하지 않는다.
    // 대기·진행 중이면 링크한 바이트는 아직 원본이고, 실패는 상속하지 않는다(새 행이 자기
    // 시도 횟수로 다시 기회를 받는다 — WORKPLAN §7.15).
    const done =
      (existing.transcodeStatus === TRANSCODE_STATUS.READY ||
        existing.transcodeStatus === TRANSCODE_STATUS.SKIPPED) &&
      !!existing.mime;

    const destRelativePath = destFor({ mime: done ? existing.mime : undefined });
    destAbs = attachmentAbsolutePath(destRelativePath);
    await link(sourceAbs, destAbs);

    // 조회와 link 사이에 변환이 끝났을 수 있다(그러면 링크한 바이트가 MP4다). 원본 행을
    // 다시 읽어 달라졌으면 링크를 버리고 호출자가 새로 쓰게 한다.
    const again = await prisma.attachment.findFirst({
      where: { path: existing.path, event: { householdId, deletedAt: null } },
      select: selectSource,
    });
    if (
      !again ||
      again.transcodeStatus !== existing.transcodeStatus ||
      again.mime !== existing.mime ||
      (typeof again.size === "number" && again.size !== (await stat(destAbs)).size)
    ) {
      await unlink(destAbs).catch(() => {});
      return null;
    }

    if (done) {
      // 포스터도 새 이름으로 잇는다. 행마다 자기 이름 하나만 지우므로 삭제가 안전하다.
      // 원본에 포스터가 없거나 링크가 실패하면 null — 기동 백필이 메운다.
      let posterPath: string | null = null;
      if (existing.posterPath) {
        try {
          const rel =
            destRelativePath.replace(/\.[^./]+$/, "") + "-poster" + path.extname(existing.posterPath);
          await link(attachmentAbsolutePath(existing.posterPath), attachmentAbsolutePath(rel));
          posterPath = rel;
        } catch {
          posterPath = null;
        }
      }
      return {
        path: destRelativePath,
        mime: existing.mime,
        size: existing.size ?? info.size,
        width: existing.width ?? null,
        height: existing.height ?? null,
        transcodeStatus: existing.transcodeStatus,
        posterPath,
      };
    }
    return {
      path: destRelativePath,
      mime: fallback?.mime ?? existing.mime ?? "",
      size: fallback?.size ?? info.size,
      width: fallback?.width ?? null,
      height: fallback?.height ?? null,
      transcodeStatus: null,
      posterPath: null,
    };
  } catch {
    if (destAbs) await unlink(destAbs).catch(() => {});
    return null;
  }
}

/** 이벤트 첨부 1건을 디스크에 저장한다. 이미지는 sharp 파이프라인을 탄다. */
export async function saveEventAttachment(
  eventId: string,
  buffer: Buffer,
  mime: string,
  /** 있으면 같은 가구의 동일 파일을 찾아 하드링크한다. 없으면 그냥 새로 쓴다 */
  householdId?: string,
): Promise<SavedEventAttachment> {
  if (!ALLOWED_ATTACHMENT_MIME.has(mime)) {
    throw new InvalidAttachmentError();
  }

  const dir = path.join(UPLOAD_DIR, EVENT_SUBDIR);
  await mkdir(dir, { recursive: true });

  let fileBuffer = buffer;
  let outMime = mime;
  let ext = ALLOWED_VIDEO_MIME.has(mime) ? videoExtension(mime) : ".jpg";
  let width: number | null = null;
  let height: number | null = null;

  if (ALLOWED_IMAGE_MIME.has(mime)) {
    try {
      const processed = await processImageForStorage(buffer);
      fileBuffer = processed.buffer;
      outMime = processed.mimeType;
      ext = processed.ext;
      const meta = await sharp(fileBuffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      throw new InvalidAttachmentError();
    }
  }

  const newPath = (e: string) => `${EVENT_SUBDIR}/${eventId}-${randomUUID()}${e}`;
  const contentHash = hashAttachmentBuffer(fileBuffer);

  const isVideo = ALLOWED_VIDEO_MIME.has(mime);
  const linked = householdId
    ? await linkExistingCopy(
        householdId,
        contentHash,
        (src) => newPath(isVideo ? videoExtension(src.mime ?? mime) : ext),
        { mime: outMime, size: fileBuffer.length, width, height },
      )
    : null;
  let relativePath: string;
  if (linked) {
    relativePath = linked.path;
  } else {
    relativePath = newPath(ext);
    await writeFile(attachmentAbsolutePath(relativePath), fileBuffer);
  }

  return {
    path: relativePath,
    mime: linked?.mime ?? outMime,
    size: linked?.size ?? fileBuffer.length,
    contentHash,
    width: linked ? linked.width : width,
    height: linked ? linked.height : height,
    // 포스터·probe는 업로드 응답 밖에서 한다. complete를 붙잡으면 폰이 99%에서
    // 멈추고, 그 사이 ffmpeg가 작은 CT를 OOM으로 죽일 수 있다. (링크한 완료본은 포스터도 상속)
    posterPath: linked?.posterPath ?? null,
    transcodeStatus: isVideo ? (linked?.transcodeStatus ?? TRANSCODE_STATUS.PENDING) : null,
  };
}

/** 청크 업로드 완료 후 임시 파일을 최종 첨부로 저장한다. 영상은 rename, 이미지는 sharp 파이프라인. */
export async function finalizeEventAttachmentFromTemp(
  eventId: string,
  tempPath: string,
  mime: string,
  householdId?: string,
): Promise<SavedEventAttachment> {
  if (!ALLOWED_ATTACHMENT_MIME.has(mime)) {
    throw new InvalidAttachmentError();
  }

  if (ALLOWED_IMAGE_MIME.has(mime)) {
    const buffer = await readFile(tempPath);
    await unlink(tempPath).catch(() => {});
    return saveEventAttachment(eventId, buffer, mime, householdId);
  }

  const dir = path.join(UPLOAD_DIR, EVENT_SUBDIR);
  await mkdir(dir, { recursive: true });
  const newPath = (e: string) => `${EVENT_SUBDIR}/${eventId}-${randomUUID()}${e}`;

  // 해시는 rename 전에 조각에서 뽑는다. 중복이면 조각을 버리고 기존 파일에 링크만 건다 —
  // 같은 191MB 영상을 아홉 번 올려 1.7GB를 먹었던 게 정확히 이 경로였다.
  const contentHash = await hashAttachmentFile(tempPath);
  const linked = householdId
    ? await linkExistingCopy(householdId, contentHash, (src) => newPath(videoExtension(src.mime ?? mime)))
    : null;
  let relativePath: string;
  if (linked) {
    relativePath = linked.path;
    await unlink(tempPath).catch(() => {});
  } else {
    relativePath = newPath(videoExtension(mime));
    await rename(tempPath, attachmentAbsolutePath(relativePath));
  }

  const fileStat = await stat(attachmentAbsolutePath(relativePath));
  const inherited = linked && linked.transcodeStatus !== null;
  return {
    path: relativePath,
    mime: inherited ? linked.mime : mime,
    size: fileStat.size,
    contentHash,
    width: inherited ? linked.width : null,
    height: inherited ? linked.height : null,
    posterPath: inherited ? linked.posterPath : null,
    transcodeStatus: inherited ? linked.transcodeStatus : TRANSCODE_STATUS.PENDING,
  };
}

export async function removeEventAttachmentFile(
  relativePath: string,
  posterPath?: string | null,
): Promise<void> {
  await deleteUploadedFile(relativePath);
  if (posterPath) await deleteUploadedFile(posterPath);
}

export class AttachmentLimitError extends Error {
  constructor() {
    super("ATTACHMENT_LIMIT");
    this.name = "AttachmentLimitError";
  }
}

export class WritableEventMissingError extends Error {
  constructor() {
    super("EVENT_NOT_FOUND");
    this.name = "WritableEventMissingError";
  }
}

/**
 * 같은 이벤트에 첨부가 동시에 여러 개 붙어도 9장을 넘기지 않게 이벤트 행을 잠근다.
 * 디스크 저장(sharp)은 잠금 밖에서 하고, INSERT 순간에만 센다.
 */
export async function insertEventAttachment(
  eventId: string,
  householdId: string,
  saved: SavedEventAttachment,
) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Event"
      WHERE id = ${eventId} AND "householdId" = ${householdId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new WritableEventMissingError();
    }

    // 동일 이벤트에 대해 최근(120초 이내) 동일한 파일(해시, 없으면 MIME·크기·해상도)이 이미 등록된 경우
    // 네트워크 재시도나 SW/화면 이중 전송에 따른 중복 생성으로 보고 기존 첨부를 반환한다.
    // 해시가 있으면 해시로 비교한다(변환으로 mime·크기가 바뀐 행과도 맞는다). 해시가 없는
    // 옛 행·저장물은 MIME·크기·해상도로 폴백한다.
    const recentDuplicate = await tx.attachment.findFirst({
      where: {
        eventId,
        ...(saved.contentHash
          ? { contentHash: saved.contentHash }
          : {
              mime: saved.mime,
              size: saved.size,
              width: saved.width ?? null,
              height: saved.height ?? null,
            }),
        createdAt: { gte: new Date(Date.now() - 120_000) },
      },
      select: attachmentSelect,
    });
    if (recentDuplicate) {
      await removeEventAttachmentFile(saved.path, saved.posterPath).catch(() => {});
      return recentDuplicate;
    }

    const count = await tx.attachment.count({ where: { eventId } });
    if (count >= MAX_ATTACHMENTS_PER_EVENT) {
      throw new AttachmentLimitError();
    }
    return tx.attachment.create({
      data: {
        eventId,
        path: saved.path,
        mime: saved.mime,
        size: saved.size,
        width: saved.width ?? undefined,
        height: saved.height ?? undefined,
        posterPath: saved.posterPath ?? undefined,
        transcodeStatus: saved.transcodeStatus ?? undefined,
        contentHash: saved.contentHash ?? undefined,
      },
      select: attachmentSelect,
    });
  });
}
