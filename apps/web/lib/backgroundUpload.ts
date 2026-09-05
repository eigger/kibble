import {
  uploadEventAttachments,
  type AttachmentUploadProgress,
} from "./eventAttachments";
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

/** 기록은 이미 저장된 뒤다. 시트는 닫고, 전송만 이어서 돈다. */
export function startBackgroundUpload(eventId: string, files: File[]): void {
  if (files.length === 0) return;
  queue.push({ eventId, files: [...files] });
  void drain();
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
      try {
        const { uploaded, remaining } = await uploadEventAttachments(
          job.eventId,
          job.files,
          (progress) => {
            if (current?.eventId !== job.eventId) return;
            current = { ...current, progress };
            publish();
          },
        );
        notifyUploaded(job.eventId, uploaded);
        holdFailed(job.eventId, remaining);
      } catch {
        // 배치가 통째로 던지면 이 작업의 파일을 실패분에 남긴다. uploading으로 굳히지 않는다.
        holdFailed(job.eventId, job.files);
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
  listeners.clear();
}
