import { apiFetch, apiJson, API_URL } from "./api";
import { shouldUseChunkedUpload, uploadEventAttachmentInChunks } from "./chunkedUpload";
import type { EventAttachment } from "./types";

export type UploadAttachmentsResult = {
  uploaded: EventAttachment[];
  /** 업로드에 실패했거나 아직 시도하지 않은 파일 */
  remaining: File[];
};

export { shouldUseChunkedUpload };

async function uploadEventAttachmentMultipart(
  eventId: string,
  file: File,
): Promise<EventAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  return apiJson<EventAttachment>(
    `/api/attachments?eventId=${encodeURIComponent(eventId)}`,
    { method: "POST", body: formData },
  );
}

export async function uploadEventAttachment(
  eventId: string,
  file: File,
): Promise<EventAttachment> {
  if (shouldUseChunkedUpload(file)) {
    return uploadEventAttachmentInChunks(eventId, file);
  }
  return uploadEventAttachmentMultipart(eventId, file);
}

/** 순차 업로드. 중간 실패 시 이미 올린 항목은 유지하고 나머지를 remaining에 돌려준다. */
export async function uploadEventAttachments(
  eventId: string,
  files: File[],
): Promise<UploadAttachmentsResult> {
  const uploaded: EventAttachment[] = [];
  for (let i = 0; i < files.length; i++) {
    try {
      uploaded.push(await uploadEventAttachment(eventId, files[i]));
    } catch {
      return { uploaded, remaining: files.slice(i) };
    }
  }
  return { uploaded, remaining: [] };
}

export async function deleteEventAttachment(attachmentId: string): Promise<void> {
  await apiJson(`/api/attachments/${attachmentId}`, { method: "DELETE" });
}

export function attachmentFileUrl(path: string): string {
  return `/api/attachments/file/${path}`;
}

/** same-origin이면 미디어 쿠키로 <img>/<video src> 직접 사용 가능 */
export function canUseDirectAttachmentUrl(): boolean {
  if (typeof window === "undefined") return false;
  return API_URL === window.location.origin;
}

export function directAttachmentUrl(path: string): string {
  return `${API_URL}${attachmentFileUrl(path)}`;
}

export async function fetchAttachmentBlob(path: string): Promise<Blob> {
  const res = await apiFetch(attachmentFileUrl(path));
  if (!res.ok) throw new Error("ATTACHMENT_FETCH_FAILED");
  return res.blob();
}
