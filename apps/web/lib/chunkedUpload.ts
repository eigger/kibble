import { UPLOAD_CHUNK_SIZE_BYTES } from "@kibble/shared";
import { apiFetch, ApiError, isRetriableUploadStatus, UPLOAD_RETRY_ATTEMPTS } from "./api";
import { findPendingUploadFor, removePendingUpload, savePendingUpload } from "./pendingUploads";
import type { EventAttachment } from "./types";

export interface UploadProgress {
  loaded: number;
  total: number;
}

/**
 * 한 청크를 몇 번까지 다시 시도할지. 모바일에서는 LTE↔WiFi 전환·터널 진입으로
 * fetch가 통째로 던지는 일이 흔하다 — 응답이 온 경우만 재시도하면 한 번의 끊김에
 * 영상 업로드 전체가 죽는다.
 */
const MAX_BACKOFF_MS = 5000;

/** multipart 20MB 제한을 넘거나 영상이면 청크 업로드를 쓴다. */
export function shouldUseChunkedUpload(file: File): boolean {
  return file.type.startsWith("video/") || file.size > 15 * 1024 * 1024;
}

async function errorFromResponse(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  const message = typeof body?.error === "string" ? body.error : `요청 실패 (${res.status})`;
  return new ApiError(message, res.status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

/**
 * 네트워크·5xx에서 다시 시도하는 요청 래퍼. 청크·complete·init이 같은 정책을 쓴다 —
 * 터널 진입 직후라고 영상 업로드의 첫 요청만 유독 한 번에 포기할 이유가 없다.
 */
async function fetchWithRetry(path: string, init: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await apiFetch(path, init);
    } catch (err) {
      if (attempt >= UPLOAD_RETRY_ATTEMPTS) throw err;
      await sleep(backoffMs(attempt));
      continue;
    }
    if (res.ok) return res;
    if (!isRetriableUploadStatus(res.status) || attempt >= UPLOAD_RETRY_ATTEMPTS) {
      throw await errorFromResponse(res);
    }
    await sleep(backoffMs(attempt));
  }
}

async function initUpload(eventId: string, file: File): Promise<string> {
  const initRes = await fetchWithRetry("/api/attachments/uploads", {
    method: "POST",
    body: JSON.stringify({
      eventId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      totalSize: file.size,
    }),
  });
  const { uploadId } = (await initRes.json()) as { uploadId: string };
  return uploadId;
}

type ServerProgress = { receivedBytes: number; nextChunkIndex: number };

async function fetchServerProgress(uploadId: string): Promise<ServerProgress | null> {
  const res = await apiFetch(`/api/attachments/uploads/${uploadId}`);
  if (!res.ok) return null;
  const status = (await res.json()) as Partial<ServerProgress>;
  if (typeof status.receivedBytes !== "number" || typeof status.nextChunkIndex !== "number") {
    return null;
  }
  return { receivedBytes: status.receivedBytes, nextChunkIndex: status.nextChunkIndex };
}

async function resolveStartingPoint(
  eventId: string,
  file: File,
): Promise<{ uploadId: string; offset: number; index: number }> {
  const pending = findPendingUploadFor(eventId, file);
  if (pending) {
    const progress = await fetchServerProgress(pending.uploadId).catch(() => null);
    if (progress) {
      return {
        uploadId: pending.uploadId,
        offset: progress.receivedBytes,
        index: progress.nextChunkIndex,
      };
    }
    removePendingUpload(pending.uploadId);
  }
  return { uploadId: await initUpload(eventId, file), offset: 0, index: 0 };
}

type ChunkOutcome =
  | { kind: "ok" }
  /** 서버가 이 청크를 이미 받았다(409). 서버 진행 상태로 다시 맞춘다 */
  | { kind: "desync" }
  /** 네트워크·5xx — 같은 청크를 잠시 뒤 다시 */
  | { kind: "retry" }
  | { kind: "fatal"; error: ApiError };

async function putChunk(uploadId: string, index: number, chunk: Blob): Promise<ChunkOutcome> {
  let res: Response;
  try {
    res = await apiFetch(`/api/attachments/uploads/${uploadId}/chunks/${index}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: chunk,
    });
  } catch {
    // fetch 자체가 던졌다 = 연결이 끊겼다. 서버가 이미 받았는지는 알 수 없으므로
    // 재동기화 없이 그냥 다시 보내면 409가 오고, 그때 위치를 맞춘다.
    return { kind: "retry" };
  }

  if (res.ok) return { kind: "ok" };
  // 서버는 409에 expectedIndex를 실어 보낸다 — 그 값을 무시하고 같은 인덱스를
  // 반복하면 영원히 409만 받는다. 진행 상태를 다시 읽어 위치를 맞춘다.
  if (res.status === 409) return { kind: "desync" };
  if (isRetriableUploadStatus(res.status)) return { kind: "retry" };
  return { kind: "fatal", error: await errorFromResponse(res) };
}

async function completeUpload(uploadId: string): Promise<EventAttachment> {
  const res = await fetchWithRetry(`/api/attachments/uploads/${uploadId}/complete`, {
    method: "POST",
  });
  return (await res.json()) as EventAttachment;
}

export async function uploadEventAttachmentInChunks(
  eventId: string,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<EventAttachment> {
  const { uploadId, offset: startOffset, index: startIndex } = await resolveStartingPoint(
    eventId,
    file,
  );

  const pendingEntry = {
    uploadId,
    eventId,
    filename: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
  };
  savePendingUpload(pendingEntry);
  if (startOffset > 0) onProgress?.({ loaded: startOffset, total: file.size });

  let offset = startOffset;
  let index = startIndex;
  let attempt = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + UPLOAD_CHUNK_SIZE_BYTES);
    const outcome = await putChunk(uploadId, index, chunk);

    if (outcome.kind === "ok") {
      offset += chunk.size;
      index += 1;
      attempt = 0;
      savePendingUpload(pendingEntry);
      onProgress?.({ loaded: offset, total: file.size });
      continue;
    }

    if (outcome.kind === "fatal") {
      // 세션이 사라졌다면(재시작·TTL) 재개 기록도 함께 버려야 다음 시도가 새로 시작한다.
      if (outcome.error.status === 404) removePendingUpload(uploadId);
      throw outcome.error;
    }

    attempt += 1;
    if (attempt >= UPLOAD_RETRY_ATTEMPTS) {
      // 메시지를 비워 둔다 — formatApiErrorMessage()가 호출부의 언어별 폴백 문구를
      // 쓰게 하려는 것이다. 여기서 한국어 문장을 만들면 en 로케일이 깨진다 (K-9).
      // status 0 = 영구 거부가 아님 → 남은 파일도 함께 remaining으로 돌아간다.
      throw new ApiError("", 0);
    }

    if (outcome.kind === "desync") {
      const progress = await fetchServerProgress(uploadId).catch(() => null);
      // 위치가 그대로면 409의 원인은 진행 차이가 아니라 동시 쓰기 잠금이다 — 잠깐 쉰다.
      if (progress && progress.nextChunkIndex !== index) {
        // 앞으로 나아간 재동기화만 재시도 예산을 되돌려준다 — 그래야 제자리를
        // 오가는 서버 응답에 무한 루프로 갇히지 않는다.
        if (progress.receivedBytes > offset) attempt = 0;
        offset = progress.receivedBytes;
        index = progress.nextChunkIndex;
        onProgress?.({ loaded: offset, total: file.size });
        continue;
      }
    }

    await sleep(backoffMs(attempt));
  }

  const attachment = await completeUpload(uploadId);
  removePendingUpload(uploadId);
  return attachment;
}
