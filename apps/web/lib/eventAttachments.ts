import { apiFetch, apiFormUpload, apiJson, API_URL, isPermanentApiRejection } from "./api";
import { shouldUseChunkedUpload, uploadEventAttachmentInChunks } from "./chunkedUpload";
import { isLocalFileFailure, prepareAttachmentForUpload } from "./uploadPrep";
import { withUploadGuard } from "./uploadGuard";
import type { EventAttachment } from "./types";

export type UploadAttachmentsResult = {
  uploaded: EventAttachment[];
  /** 업로드에 실패했거나 아직 시도하지 않은 파일 */
  remaining: File[];
};

export type AttachmentUploadPhase = "preparing" | "uploading";

export type AttachmentFileProgress = {
  loaded: number;
  total: number;
  phase: AttachmentUploadPhase;
  done: boolean;
  /** 큐에서 대기 중이면 오버레이를 그리지 않는다 */
  active: boolean;
};

/** 일괄 업로드 중 지금 처리 중인 파일의 위치. 사진(multipart)은 XHR 바이트, 영상(청크)은 청크 단위. */
export type AttachmentUploadProgress = {
  fileIndex: number;
  fileCount: number;
  startedCount: number;
  loaded: number;
  total: number;
  phase: AttachmentUploadPhase;
  fileStates: AttachmentFileProgress[];
};

export { shouldUseChunkedUpload };

/** 사진 여러 장을 한 장씩 올리면 회선이 비어 있는데도 체감이 몇 배가 된다. */
export const ATTACHMENT_UPLOAD_CONCURRENCY = 3;

type FileProgress = { loaded: number; total: number; phase: AttachmentUploadPhase };

function reportMultipartProgress(
  preparedSize: number,
  loaded: number,
  total: number,
  onProgress?: (p: FileProgress) => void,
): void {
  if (!Number.isFinite(loaded) || loaded === Number.POSITIVE_INFINITY) {
    onProgress?.({ loaded: preparedSize, total: preparedSize, phase: "uploading" });
    return;
  }
  const size = total > 0 ? total : preparedSize;
  onProgress?.({
    loaded: Math.min(loaded, size),
    total: Math.max(size, 1),
    phase: "uploading",
  });
}

async function uploadEventAttachmentMultipart(
  eventId: string,
  file: File,
  onProgress?: (p: FileProgress) => void,
): Promise<EventAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFormUpload<EventAttachment>(
    `/api/attachments?eventId=${encodeURIComponent(eventId)}`,
    formData,
    (loaded, total) => reportMultipartProgress(file.size, loaded, total, onProgress),
  );
}

export async function uploadEventAttachment(
  eventId: string,
  file: File,
  onProgress?: (p: FileProgress) => void,
): Promise<EventAttachment> {
  // 이탈 경고는 여기서 건다 — 오프라인 큐 재전송을 포함해 모든 업로드 경로가 이 함수를 지난다.
  return withUploadGuard(async () => {
    // MIME 보정·이미지 축소는 전송 직전에 한 번만 한다 — 재개 시에도 같은 결과가 나와야
    // pendingUploads의 (filename, size) 매칭이 어긋나지 않는다.
    onProgress?.({ loaded: 0, total: Math.max(file.size, 1), phase: "preparing" });
    const prepared = await prepareAttachmentForUpload(file);
    onProgress?.({ loaded: 0, total: Math.max(prepared.size, 1), phase: "uploading" });
    if (shouldUseChunkedUpload(prepared)) {
      return uploadEventAttachmentInChunks(eventId, prepared, (p) =>
        onProgress?.({ loaded: p.loaded, total: p.total, phase: "uploading" }),
      );
    }
    return uploadEventAttachmentMultipart(eventId, prepared, onProgress);
  });
}

function emptyFileState(file: File): AttachmentFileProgress {
  return {
    loaded: 0,
    total: Math.max(file.size, 1),
    phase: "preparing",
    done: false,
    active: false,
  };
}

function emitBatchProgress(
  files: File[],
  states: AttachmentFileProgress[],
  onProgress?: (p: AttachmentUploadProgress) => void,
): void {
  if (!onProgress) return;
  const fileCount = files.length;
  const startedCount = states.filter((s) => s.active || s.done).length;
  const loaded = states.reduce((sum, s) => sum + s.loaded, 0);
  const total = states.reduce((sum, s) => sum + s.total, 0);
  const anyUploading = states.some((s) => s.active && s.phase === "uploading");
  const firstActive = states.findIndex((s) => s.active && !s.done);
  onProgress({
    fileIndex: firstActive === -1 ? Math.max(0, startedCount - 1) : firstActive,
    fileCount,
    startedCount,
    loaded,
    total: Math.max(total, 1),
    phase: anyUploading ? "uploading" : "preparing",
    fileStates: states.map((s) => ({ ...s })),
  });
}

/**
 * 최대 3장을 동시에 올린다. 이미 올린 항목은 유지하고 못 올린 것만 remaining에 돌려준다.
 *
 * 파일 하나가 거부됐다고 나머지를 건너뛰지 않는다 — 사진 5장 중 첫 장만 형식 문제로
 * 400을 받아도 예전에는 나머지 4장을 시도조차 하지 않아, 사용자 눈에는 "다중 업로드가
 * 안 되는" 것으로 보였다. 다만 서버·네트워크가 죽은 일시 장애면 아직 시작하지 않은
 * 파일은 멈춘다. 이미 전송 중인 파일은 끝까지 간다.
 */
export async function uploadEventAttachments(
  eventId: string,
  files: File[],
  onProgress?: (p: AttachmentUploadProgress) => void,
): Promise<UploadAttachmentsResult> {
  // 배치 전체를 한 번 더 감싼다 — 파일 사이의 짧은 틈에도 가드가 풀리지 않게.
  // (카운터라 중첩은 안전하다)
  return withUploadGuard(() => runAttachmentUploads(eventId, files, onProgress));
}

async function runAttachmentUploads(
  eventId: string,
  files: File[],
  onProgress?: (p: AttachmentUploadProgress) => void,
): Promise<UploadAttachmentsResult> {
  const slots: (EventAttachment | undefined)[] = Array.from({ length: files.length });
  const states = files.map(emptyFileState);
  let cursor = 0;
  let stopNew = false;

  const workers = Array.from(
    { length: Math.min(ATTACHMENT_UPLOAD_CONCURRENCY, files.length) },
    async () => {
      for (;;) {
        const i = cursor++;
        if (i >= files.length) return;
        if (stopNew) continue;

        states[i] = { ...states[i], active: true, phase: "preparing" };
        emitBatchProgress(files, states, onProgress);
        try {
          slots[i] = await uploadEventAttachment(eventId, files[i], (p) => {
            states[i] = { ...p, done: false, active: true };
            emitBatchProgress(files, states, onProgress);
          });
          states[i] = {
            ...states[i],
            loaded: states[i].total,
            phase: "uploading",
            done: true,
            active: false,
          };
          emitBatchProgress(files, states, onProgress);
        } catch (err) {
          states[i] = { ...states[i], active: false };
          emitBatchProgress(files, states, onProgress);
          if (isPermanentApiRejection(err) || isLocalFileFailure(err)) continue;
          // content URI 만료·NotReadableError는 그 장만의 문제다. HTTP 4xx와 같이
          // 나머지를 계속 올린다. TypeError("Failed to fetch")는 회선 문제로 두고
          // 아직 시작하지 않은 파일만 중단한다.
          stopNew = true;
        }
      }
    },
  );

  await Promise.all(workers);

  return {
    uploaded: slots.filter((item): item is EventAttachment => item != null),
    remaining: files.filter((_, i) => slots[i] == null),
  };
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
