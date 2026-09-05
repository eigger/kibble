import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { processImageForStorage } from "./imageProcessing.js";
import { extractVideoPoster } from "./videoPoster.js";
import { probeVideo, shouldSkipVideoTranscode, TRANSCODE_STATUS } from "./videoTranscode.js";
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
async function savePosterForVideo(eventId: string, videoAbsPath: string): Promise<string | null> {
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

async function classifyVideoForTranscode(
  absPath: string,
  sizeBytes: number,
): Promise<{ width: number | null; height: number | null; transcodeStatus: string }> {
  const probe = await probeVideo(absPath);
  if (!probe || shouldSkipVideoTranscode({ ...probe, sizeBytes })) {
    return {
      width: probe?.width ?? null,
      height: probe?.height ?? null,
      transcodeStatus: TRANSCODE_STATUS.SKIPPED,
    };
  }
  return {
    width: probe.width,
    height: probe.height,
    transcodeStatus: TRANSCODE_STATUS.PENDING,
  };
}

/** 이벤트 첨부 1건을 디스크에 저장한다. 이미지는 sharp 파이프라인을 탄다. */
export async function saveEventAttachment(
  eventId: string,
  buffer: Buffer,
  mime: string,
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

  const filename = `${eventId}-${randomUUID()}${ext}`;
  const relativePath = `${EVENT_SUBDIR}/${filename}`;
  const absolutePath = attachmentAbsolutePath(relativePath);
  await writeFile(absolutePath, fileBuffer);

  const videoMeta = ALLOWED_VIDEO_MIME.has(mime)
    ? await classifyVideoForTranscode(absolutePath, fileBuffer.length)
    : null;

  return {
    path: relativePath,
    mime: outMime,
    size: fileBuffer.length,
    width: videoMeta?.width ?? width,
    height: videoMeta?.height ?? height,
    // 웹은 영상을 항상 청크로 보내지만, API 토큰으로 20MB 이하 영상을 multipart로
    // 직행시키는 경로가 있다 — 거기서만 포스터가 없으면 목록이 갈라진다.
    posterPath: ALLOWED_VIDEO_MIME.has(mime)
      ? await savePosterForVideo(eventId, absolutePath)
      : null,
    transcodeStatus: videoMeta?.transcodeStatus ?? null,
  };
}

/** 청크 업로드 완료 후 임시 파일을 최종 첨부로 저장한다. 영상은 rename, 이미지는 sharp 파이프라인. */
export async function finalizeEventAttachmentFromTemp(
  eventId: string,
  tempPath: string,
  mime: string,
): Promise<SavedEventAttachment> {
  if (!ALLOWED_ATTACHMENT_MIME.has(mime)) {
    throw new InvalidAttachmentError();
  }

  if (ALLOWED_IMAGE_MIME.has(mime)) {
    const buffer = await readFile(tempPath);
    await unlink(tempPath).catch(() => {});
    return saveEventAttachment(eventId, buffer, mime);
  }

  const dir = path.join(UPLOAD_DIR, EVENT_SUBDIR);
  await mkdir(dir, { recursive: true });
  const ext = videoExtension(mime);
  const filename = `${eventId}-${randomUUID()}${ext}`;
  const relativePath = `${EVENT_SUBDIR}/${filename}`;
  const destPath = attachmentAbsolutePath(relativePath);
  await rename(tempPath, destPath);
  const fileStat = await stat(destPath);
  const videoMeta = await classifyVideoForTranscode(destPath, fileStat.size);
  return {
    path: relativePath,
    mime,
    size: fileStat.size,
    width: videoMeta.width,
    height: videoMeta.height,
    posterPath: await savePosterForVideo(eventId, destPath),
    transcodeStatus: videoMeta.transcodeStatus,
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
      },
      select: attachmentSelect,
    });
  });
}
