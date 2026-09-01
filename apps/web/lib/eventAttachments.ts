import { apiFetch, apiJson } from "./api";
import type { EventAttachment } from "./types";

export async function uploadEventAttachment(
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

export async function uploadEventAttachments(
  eventId: string,
  files: File[],
): Promise<EventAttachment[]> {
  const uploaded: EventAttachment[] = [];
  for (const file of files) {
    uploaded.push(await uploadEventAttachment(eventId, file));
  }
  return uploaded;
}

export async function deleteEventAttachment(attachmentId: string): Promise<void> {
  await apiJson(`/api/attachments/${attachmentId}`, { method: "DELETE" });
}

export function attachmentFileUrl(path: string): string {
  return `/api/attachments/file/${path}`;
}

export async function fetchAttachmentBlob(path: string): Promise<Blob> {
  const res = await apiFetch(attachmentFileUrl(path));
  if (!res.ok) throw new Error("ATTACHMENT_FETCH_FAILED");
  return res.blob();
}
