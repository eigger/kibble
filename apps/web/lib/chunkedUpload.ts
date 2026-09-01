import { UPLOAD_CHUNK_SIZE_BYTES } from "@kibble/shared";
import { apiFetch, ApiError } from "./api";
import { findPendingUploadFor, removePendingUpload, savePendingUpload } from "./pendingUploads";
import type { EventAttachment } from "./types";

export interface UploadProgress {
  loaded: number;
  total: number;
}

const MAX_CHUNK_RETRIES = 3;

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

async function initUpload(eventId: string, file: File): Promise<string> {
  const initRes = await apiFetch("/api/attachments/uploads", {
    method: "POST",
    body: JSON.stringify({
      eventId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      totalSize: file.size,
    }),
  });
  if (!initRes.ok) throw await errorFromResponse(initRes);
  const { uploadId } = (await initRes.json()) as { uploadId: string };
  return uploadId;
}

async function resolveStartingPoint(
  eventId: string,
  file: File,
): Promise<{ uploadId: string; offset: number; index: number }> {
  const pending = findPendingUploadFor(eventId, file);
  if (pending) {
    const statusRes = await apiFetch(`/api/attachments/uploads/${pending.uploadId}`);
    if (statusRes.ok) {
      const status = (await statusRes.json()) as { receivedBytes: number; nextChunkIndex: number };
      return { uploadId: pending.uploadId, offset: status.receivedBytes, index: status.nextChunkIndex };
    }
    removePendingUpload(pending.uploadId);
  }
  return { uploadId: await initUpload(eventId, file), offset: 0, index: 0 };
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

  savePendingUpload({
    uploadId,
    eventId,
    filename: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
  });
  if (startOffset > 0) onProgress?.({ loaded: startOffset, total: file.size });

  let offset = startOffset;
  let index = startIndex;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + UPLOAD_CHUNK_SIZE_BYTES);

    let attempt = 0;
    for (;;) {
      const chunkRes = await apiFetch(`/api/attachments/uploads/${uploadId}/chunks/${index}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: chunk,
      });
      if (chunkRes.ok) break;
      attempt += 1;
      if (attempt >= MAX_CHUNK_RETRIES) throw await errorFromResponse(chunkRes);
      await sleep(500 * attempt);
    }

    offset += chunk.size;
    index += 1;
    savePendingUpload({
      uploadId,
      eventId,
      filename: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
    });
    onProgress?.({ loaded: offset, total: file.size });
  }

  const completeRes = await apiFetch(`/api/attachments/uploads/${uploadId}/complete`, {
    method: "POST",
  });
  if (!completeRes.ok) throw await errorFromResponse(completeRes);
  removePendingUpload(uploadId);
  return (await completeRes.json()) as EventAttachment;
}
