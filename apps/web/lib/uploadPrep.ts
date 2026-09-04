"use client";

/**
 * 업로드 직전 파일 손질. 두 가지를 한다.
 *
 * 1) MIME 보정 — 안드로이드 파일 제공자·공유 시트는 `type`이 빈 문자열인 File을 준다.
 *    그대로 보내면 서버 허용 목록에 걸려 400이 된다. 확장자로 되살린다 (K-12).
 * 2) 이미지 리인코딩 — 서버는 어차피 1600px JPEG로 줄인다. 원본을 그대로 올리면
 *    모바일 전송량만 몇 배가 되고 그만큼 중간에 끊길 확률이 오른다. 덤으로 아이폰
 *    HEIC이 JPEG가 된다 — sharp 프리빌트 바이너리는 HEIC을 열지 못한다.
 *
 * 변환이 안 되면 원본을 그대로 돌려준다. 여기서 파일을 거부하지 않는다 (K-12) —
 * 판단은 서버에 맡기고, 사용자는 최소한 시도라도 하게 둔다.
 */

/** 서버 imageProcessing.ts와 같은 값을 쓴다 — 여기서 줄여 보내면 서버는 그대로 통과시킨다. */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

/** <img> 폴백 경로가 영영 안 끝나면 업로드 전체가 멈춘다 — 그럴 바엔 원본을 올린다. */
const DECODE_TIMEOUT_MS = 20_000;

const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  "3gp": "video/3gpp",
  webm: "video/webm",
  mkv: "video/x-matroska",
};

/** 서버 sharp가 직접 열 수 있는 이미지. 이 밖이면 변환본이 커져도 변환본을 쓴다. */
const SERVER_DECODABLE_IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

/** file.type이 비었거나 octet-stream이면 확장자로 되살린다. */
export function normalizeAttachmentType(file: File): string {
  const declared = file.type?.trim().toLowerCase() ?? "";
  if (declared && declared !== "application/octet-stream") return declared;
  return EXTENSION_MIME[extensionOf(file.name)] ?? declared;
}

function withType(file: File, type: string): File {
  if (!type || type === file.type) return file;
  return new File([file], file.name, { type, lastModified: file.lastModified });
}

function jpegName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const stem = dot === -1 ? filename : filename.slice(0, dot);
  return `${stem || "photo"}.jpg`;
}

/** 캔버스를 못 쓰는 환경(SSR·테스트·구형 WebView)이면 리인코딩 자체를 시도하지 않는다. */
let canvasSupport: boolean | null = null;

function canvasUnavailable(): boolean {
  if (canvasSupport === null) {
    if (typeof document === "undefined") {
      canvasSupport = false;
    } else {
      try {
        canvasSupport = Boolean(document.createElement("canvas").getContext("2d"));
      } catch {
        canvasSupport = false;
      }
    }
  }
  return !canvasSupport;
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function decodeImage(file: File): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === "function") {
    try {
      // EXIF 회전을 픽셀에 굽는다 — 서버 sharp의 .rotate()와 결과가 같아진다.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // 옵션 미지원·디코더 없음 — <img> 폴백으로 내려간다.
    }
  }

  if (typeof Image !== "function" || typeof URL?.createObjectURL !== "function") return null;

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      const timer = setTimeout(() => reject(new Error("DECODE_TIMEOUT")), DECODE_TIMEOUT_MS);
      element.onload = () => {
        clearTimeout(timer);
        resolve(element);
      };
      element.onerror = () => {
        clearTimeout(timer);
        reject(new Error("DECODE_FAILED"));
      };
      element.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

async function reencodeToJpeg(file: File): Promise<File | null> {
  if (canvasUnavailable()) return null;

  const decoded = await decodeImage(file);
  if (!decoded) return null;

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    decoded.release();
  };

  try {
    const { width, height } = decoded;
    if (!width || !height) return null;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(decoded.source, 0, 0, targetWidth, targetHeight);

    // 원본 비트맵을 즉시 놓아준다 — 12MP 사진이면 ~48MB다. JPEG 인코더가 버퍼를
    // 잡기 전에 비워야 최대 점유가 (원본 + 캔버스 + 인코더)에서 한 단계 내려간다.
    // (createImageBitmap의 resizeWidth로 디코드 단계에서 줄이는 방법은 못 쓴다 —
    //  가로/세로 중 어느 쪽이 긴지, 원본이 1600보다 큰지를 디코드 전에 알 수 없어
    //  작은 이미지를 억지로 확대하게 된다)
    release();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    if (!blob || blob.size === 0) return null;

    return new File([blob], jpegName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    release();
  }
}

export async function prepareAttachmentForUpload(file: File): Promise<File> {
  const type = normalizeAttachmentType(file);
  if (!type.startsWith("image/")) return withType(file, type);

  let converted: File | null = null;
  try {
    converted = await reencodeToJpeg(file);
  } catch {
    converted = null;
  }
  if (!converted) return withType(file, type);

  // 서버가 못 여는 형식(HEIC 등)은 크기와 무관하게 변환본만이 유일한 길이다.
  if (!SERVER_DECODABLE_IMAGE.has(type)) return converted;
  return converted.size < file.size ? converted : withType(file, type);
}
