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
  eventId: string;
  fileCount: number;
  progress: AttachmentUploadProgress | null;
  remaining: File[];
  status: "uploading" | "partial";
};

type Listener = () => void;

let snapshot: BackgroundUploadSnapshot | null = null;
const listeners = new Set<Listener>();
const queue: { eventId: string; files: File[] }[] = [];
let running = false;

function emit(): void {
  for (const listener of listeners) listener();
}

export function getBackgroundUpload(): BackgroundUploadSnapshot | null {
  return snapshot;
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
  if (!snapshot || snapshot.status !== "partial" || snapshot.remaining.length === 0) return;
  queue.unshift({ eventId: snapshot.eventId, files: snapshot.remaining });
  snapshot = {
    ...snapshot,
    status: "uploading",
    remaining: [],
    progress: null,
  };
  emit();
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
      snapshot = {
        eventId: job.eventId,
        fileCount: job.files.length,
        progress: null,
        remaining: [],
        status: "uploading",
      };
      emit();
      const { uploaded, remaining } = await uploadEventAttachments(
        job.eventId,
        job.files,
        (progress) => {
          if (snapshot?.eventId !== job.eventId) return;
          snapshot = { ...snapshot, progress };
          emit();
        },
      );
      notifyUploaded(job.eventId, uploaded);
      if (remaining.length > 0) {
        snapshot = {
          eventId: job.eventId,
          fileCount: remaining.length,
          progress: null,
          remaining,
          status: "partial",
        };
        emit();
        return;
      }
    }
    snapshot = null;
    emit();
  } finally {
    running = false;
    if (queue.length > 0 && snapshot?.status !== "partial") void drain();
  }
}

/** 테스트 전용 */
export function resetBackgroundUploadForTests(): void {
  snapshot = null;
  queue.length = 0;
  running = false;
  listeners.clear();
}
