"use client";

/**
 * 업로드 직전 파일 손질.
 *
 * 1) MIME 보정 — 안드로이드 파일 제공자·공유 시트는 `type`이 빈 문자열인 File을 준다.
 * 2) HEIC/HEIF 등 서버가 못 여는 이미지만 canvas로 JPEG. JPEG/PNG/WebP는 원본을 보낸다.
 *    서버 sharp가 1600px JPEG로 줄인다. 갤럭시에서 12MP JPEG를 장마다 캔버스로 바꾸면
 *    수 초~20초가 걸려 쓸 수 없었다 (R63).
 *
 * 변환이 안 되면 원본을 그대로 돌려준다 (K-12).
 */

/** 서버 imageProcessing.ts와 같은 값을 쓴다 — 여기서 줄여 보내면 서버는 그대로 통과시킨다. */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

/** HEIC 디코드가 안 끝나면 원본을 올린다. JPEG 경로에는 쓰지 않는다. */
export const DECODE_TIMEOUT_MS = 8_000;

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

function logPrep(message: string, err?: unknown): void {
  const detail =
    err instanceof Error ? `${err.name}: ${err.message}` : err != null ? String(err) : "";
  const line = detail ? `[uploadPrep] ${message} (${detail})` : `[uploadPrep] ${message}`;
  // 이슈 등록이 console.error를 링버퍼에 담는다 — 삼키지 말고 남겨야 갤럭시 실패가 보인다.
  console.error(line);
}

function isTimeoutError(err: unknown): boolean {
  if (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") {
    return true;
  }
  if (!(err instanceof Error)) return false;
  return (
    err.name === "AbortError" ||
    err.message === "BITMAP_TIMEOUT" ||
    err.message === "DECODE_TIMEOUT" ||
    err.message === "TOBLOB_TIMEOUT" ||
    err.message === "READ_TIMEOUT"
  );
}

function bitmapAbortSignal(): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") return undefined;
  return AbortSignal.timeout(DECODE_TIMEOUT_MS);
}

/** 선택 직후 content URI가 끊긴 파일. 네트워크가 죽은 게 아니라 그 장만 못 읽는다. */
export class LocalFileError extends Error {
  constructor(filename: string) {
    super(filename);
    this.name = "LocalFileError";
  }
}

export function isLocalFileFailure(err: unknown): boolean {
  if (err instanceof LocalFileError) return true;
  if (typeof err !== "object" || err === null) return false;
  const name = (err as Error).name;
  if (name === "LocalFileError" || name === "NotReadableError" || name === "NotFoundError") return true;
  const message = typeof (err as Error).message === "string" ? (err as Error).message : "";
  // Chromium은 arrayBuffer()엔 DOMException을, FormData fetch엔 TypeError로 감싸
  // "The requested file could not be read"를 남긴다.
  return message.toLowerCase().includes("could not be read");
}

/**
 * 타임아웃 뒤에도 원본 Promise는 돌아가지만, 이후 resolve/reject는 버린다.
 * createImageBitmap이 갤럭시 HEIF에서 끝나지 않는 게 이 헬퍼를 쓰는 이유다.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(label));
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  // jsdom File에는 arrayBuffer가 없다. FileReader는 양쪽에서 동작한다.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("READ_FAILED"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("READ_FAILED"));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * 안드로이드 다중 선택은 File이 content URI를 가리키는 경우가 많다.
 * 미리보기·디코드·FormData가 같은 URI를 늦게 다시 읽으면 NotReadableError가 난다.
 * 선택 직후 바이트를 복사해 두면 이후 단계는 메모리만 본다.
 */
export async function snapshotFile(file: File): Promise<File> {
  try {
    const buf = await withTimeout(blobToArrayBuffer(file), DECODE_TIMEOUT_MS, "READ_TIMEOUT");
    return new File([buf], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
  } catch (err) {
    logPrep(`unreadable file ${file.name}`, err);
    throw new LocalFileError(file.name);
  }
}

/** 캔버스를 못 쓰는 환경(SSR·테스트·구형 WebView)이면 리인코딩 자체를 시도하지 않는다. */
let canvasSupport: boolean | null = null;

/**
 * 이 탭에서 createImageBitmap이 한 번 멈추면 같은 GPU에서 다음 장도 멈출 가능성이 크다.
 * 장마다 20초를 쓰면 6장에서 2분이 된다 — 이후 장은 원본 JPEG를 그대로 올린다.
 * 서버 sharp가 JPEG는 열 수 있다.
 */
let decodeHardwareBroken = false;

function markDecodeBroken(reason: string): void {
  if (decodeHardwareBroken) return;
  decodeHardwareBroken = true;
  logPrep(`decode appears stuck (${reason}); skip reencode for later files`);
}

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

type BitmapDecode = DecodedImage | "timeout";

async function decodeWithBitmap(file: File): Promise<BitmapDecode | null> {
  if (typeof createImageBitmap !== "function") return null;

  const tryOnce = async (options?: ImageBitmapOptions): Promise<DecodedImage> => {
    const signal = bitmapAbortSignal();
    // DOM 타입에 signal이 아직 없는 TS 버전 — 런타임 크롬은 받는다.
    const bitmap = await withTimeout(
      createImageBitmap(file, { ...options, ...(signal ? { signal } : {}) } as ImageBitmapOptions),
      DECODE_TIMEOUT_MS,
      "BITMAP_TIMEOUT",
    );
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  };

  try {
    // EXIF 회전을 픽셀에 굽는다 — 서버 sharp의 .rotate()와 결과가 같아진다.
    return await tryOnce({ imageOrientation: "from-image" });
  } catch (err) {
    logPrep("createImageBitmap(orientation) failed", err);
    // 타임아웃·Abort면 옵션 없는 호출과 <img>도 같은 디코더에서 멈출 수 있다.
    // 한 번 더 20초를 쓰지 않고, 멈춘 비트맵을 또 디코드하지 않는다 (OOM).
    if (isTimeoutError(err)) {
      markDecodeBroken("BITMAP_TIMEOUT");
      return "timeout";
    }
  }

  try {
    return await tryOnce();
  } catch (err) {
    logPrep("createImageBitmap failed", err);
    if (isTimeoutError(err)) {
      markDecodeBroken("BITMAP_TIMEOUT");
      return "timeout";
    }
    return null;
  }
}

async function decodeImage(file: File): Promise<DecodedImage | null> {
  const fromBitmap = await decodeWithBitmap(file);
  if (fromBitmap === "timeout") return null;
  if (fromBitmap) return fromBitmap;

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
  } catch (err) {
    logPrep("img decode failed", err);
    URL.revokeObjectURL(url);
    return null;
  }
}

async function reencodeToJpeg(file: File): Promise<File | null> {
  if (decodeHardwareBroken || canvasUnavailable()) return null;

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

    let blob: Blob | null;
    try {
      blob = await withTimeout(
        new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
        }),
        DECODE_TIMEOUT_MS,
        "TOBLOB_TIMEOUT",
      );
    } catch (err) {
      if (isTimeoutError(err)) markDecodeBroken("TOBLOB_TIMEOUT");
      throw err;
    }
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
  const local = await snapshotFile(file);
  const type = normalizeAttachmentType(local);
  const typed = withType(local, type);
  if (!type.startsWith("image/")) return typed;
  // 서버가 여는 JPEG/PNG/WebP는 canvas를 거치지 않는다. 갤럭시 12MP에서
  // createImageBitmap이 장당 수 초~타임아웃이라 업로드가 실사용 불가였다.
  if (SERVER_DECODABLE_IMAGE.has(type)) return typed;

  let converted: File | null = null;
  try {
    converted = await reencodeToJpeg(typed);
  } catch (err) {
    logPrep(`reencode failed ${typed.name}`, err);
    converted = null;
  }
  // HEIC 등은 변환본만이 서버를 통과한다. 실패하면 원본을 보내고 서버 400을 받는다 (K-12).
  return converted ?? typed;
}
