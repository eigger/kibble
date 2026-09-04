import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { processImageForStorage } from "./imageProcessing.js";
import { UPLOAD_DIR, deleteUploadedFile } from "./uploads.js";

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

// 안드로이드 갤러리·기본 카메라는 mp4/mov 밖의 컨테이너도 내놓는다. 영상은 재인코딩
// 없이 그대로 저장하므로 확장자만 알면 받아줄 수 있다 (K-12).
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
};

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
  await writeFile(attachmentAbsolutePath(relativePath), fileBuffer);

  return {
    path: relativePath,
    mime: outMime,
    size: fileBuffer.length,
    width,
    height,
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
  return {
    path: relativePath,
    mime,
    size: fileStat.size,
    width: null,
    height: null,
  };
}

export async function removeEventAttachmentFile(relativePath: string): Promise<void> {
  await deleteUploadedFile(relativePath);
}
