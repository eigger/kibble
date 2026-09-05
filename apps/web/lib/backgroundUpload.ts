import {
  uploadEventAttachments,
  type AttachmentUploadProgress,
} from "./eventAttachments";
import { isUploadCancelled } from "./uploadAbort";
import type { EventAttachment, TimelineEvent } from "./types";

export const ATTACHMENTS_UPLOADED_EVENT = "kibble-attachments-uploaded";

export type AttachmentsUploadedDetail = {
  eventId: string;
  uploaded: EventAttachment[];
};

export type BackgroundUploadSnapshot = {
  current: {
    eventId: string;
    fileCount: number;
    progress: AttachmentUploadProgress | null;
  } | null;
  failedCount: number;
};

type Job = { eventId: string; files: File[] };
type Listener = () => void;

const listeners = new Set<Listener>();
const queue: Job[] = [];
const failed: Job[] = [];
let current: BackgroundUploadSnapshot["current"] = null;
let view: BackgroundUploadSnapshot | null = null;
let running = false;
let jobAbort: AbortController | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function publish(): void {
  const failedCount = failed.reduce((n, job) => n + job.files.length, 0);
  if (!current && failedCount === 0) {
    view = null;
  } else {
    view = { current, failedCount };
  }
  emit();
}

function holdFailed(eventId: string, files: File[]): void {
  if (files.length === 0) return;
  const existing = failed.find((job) => job.eventId === eventId);
  if (existing) existing.files.push(...files);
  else failed.push({ eventId, files: [...files] });
}

export function getBackgroundUpload(): BackgroundUploadSnapshot | null {
  return view;
}

export function subscribeBackgroundUpload(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 기록은 이미 저장된 뒤다. 시트는 닫고, 이 탭에서 전송만 이어서 돈다. */
export function startBackgroundUpload(eventId: string, files: File[]): void {
  if (files.length === 0) return;
  queue.push({ eventId, files: [...files] });
  void drain();
}

/** 배너의 그만두기 — 큐·진행 중을 모두 끊는다. 기록 행은 그대로 둔다. */
export function cancelBackgroundUpload(): void {
  queue.length = 0;
  jobAbort?.abort();
  if (!running) {
    current = null;
    publish();
  }
}

/** 이력 삭제 전에 그 기록으로 가는 전송만 끊는다. */
export function cancelUploadsForEvent(eventId: string): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].eventId === eventId) queue.splice(i, 1);
  }
  for (let i = failed.length - 1; i >= 0; i--) {
    if (failed[i].eventId === eventId) failed.splice(i, 1);
  }
  if (current?.eventId === eventId) jobAbort?.abort();
  else publish();
}

export function retryBackgroundUpload(): void {
  if (failed.length === 0) return;
  const toRetry = failed.splice(0, failed.length);
  for (let i = toRetry.length - 1; i >= 0; i--) {
    queue.unshift(toRetry[i]);
  }
  publish();
  void drain();
}

export function mergeTimelineAttachments(
  events: TimelineEvent[],
  eventId: string,
  uploaded: EventAttachment[],
): TimelineEvent[] {
  if (uploaded.length === 0) return events;
  return events.map((event) =>
    event.id === eventId
      ? { ...event, attachments: [...(event.attachments ?? []), ...uploaded] }
      : event,
  );
}

function notifyUploaded(eventId: string, uploaded: EventAttachment[]): void {
  if (typeof window === "undefined" || uploaded.length === 0) return;
  window.dispatchEvent(
    new CustomEvent<AttachmentsUploadedDetail>(ATTACHMENTS_UPLOADED_EVENT, {
      detail: { eventId, uploaded },
    }),
  );
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) break;
      current = {
        eventId: job.eventId,
        fileCount: job.files.length,
        progress: null,
      };
      publish();
      const abort = new AbortController();
      jobAbort = abort;
      try {
        const { uploaded, remaining } = await uploadEventAttachments(
          job.eventId,
          job.files,
          (progress) => {
            if (current?.eventId !== job.eventId) return;
            current = { ...current, progress };
            publish();
          },
          abort.signal,
        );
        notifyUploaded(job.eventId, uploaded);
        if (!abort.signal.aborted) holdFailed(job.eventId, remaining);
      } catch (err) {
        if (isUploadCancelled(err)) {
          // 그만두기 — 실패 배너에 남기지 않는다
        } else {
          console.warn("[kibble] background upload failed", err);
          holdFailed(job.eventId, job.files);
        }
      } finally {
        if (jobAbort === abort) jobAbort = null;
      }
    }
    current = null;
    publish();
  } finally {
    running = false;
    if (queue.length > 0) void drain();
  }
}

/** 테스트 전용 */
export function resetBackgroundUploadForTests(): void {
  current = null;
  view = null;
  queue.length = 0;
  failed.length = 0;
  running = false;
  jobAbort = null;
  listeners.clear();
}
