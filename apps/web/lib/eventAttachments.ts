import { apiFetch, apiJson, API_URL, isPermanentApiRejection } from "./api";
import { shouldUseChunkedUpload, uploadEventAttachmentInChunks } from "./chunkedUpload";
import { prepareAttachmentForUpload } from "./uploadPrep";
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
  // MIME 보정·이미지 축소는 전송 직전에 한 번만 한다 — 재개 시에도 같은 결과가 나와야
  // pendingUploads의 (filename, size) 매칭이 어긋나지 않는다.
  const prepared = await prepareAttachmentForUpload(file);
  if (shouldUseChunkedUpload(prepared)) {
    return uploadEventAttachmentInChunks(eventId, prepared);
  }
  return uploadEventAttachmentMultipart(eventId, prepared);
}

/**
 * 순차 업로드. 이미 올린 항목은 유지하고 못 올린 것만 remaining에 돌려준다.
 *
 * 파일 하나가 거부됐다고 나머지를 건너뛰지 않는다 — 사진 5장 중 첫 장만 형식 문제로
 * 400을 받아도 예전에는 나머지 4장을 시도조차 하지 않아, 사용자 눈에는 "다중 업로드가
 * 안 되는" 것으로 보였다. 다만 서버·네트워크가 죽은 일시 장애면 남은 파일도 똑같이
 * 실패하므로 거기서는 멈춘다.
 */
export async function uploadEventAttachments(
  eventId: string,
  files: File[],
): Promise<UploadAttachmentsResult> {
  const uploaded: EventAttachment[] = [];
  const remaining: File[] = [];
  for (let i = 0; i < files.length; i++) {
    try {
      uploaded.push(await uploadEventAttachment(eventId, files[i]));
    } catch (err) {
      remaining.push(files[i]);
      if (!isPermanentApiRejection(err)) {
        remaining.push(...files.slice(i + 1));
        break;
      }
    }
  }
  return { uploaded, remaining };
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
