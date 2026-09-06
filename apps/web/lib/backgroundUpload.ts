import {
  uploadEventAttachments,
  type AttachmentUploadProgress,
} from "./eventAttachments";
import { isUploadCancelled } from "./uploadAbort";
import type { EventAttachment, TimelineEvent } from "./types";
import { jobTotalBytes } from "./backgroundFetchJob";
import {
  abortBackgroundFetchesFor,
  canUseBackgroundFetch,
  cancelAllBackgroundFetches,
  hydrateBackgroundFetchJobs,
  retryFailedBackgroundFetches,
  sweepBackgroundFetchJobs,
  startViaBackgroundFetch,
  subscribeBackgroundFetchMessages,
  type BfClientMessage,
} from "./backgroundFetchUpload";
import {
  dismissUploadNotification,
  requestUploadNotificationPermission,
  showUploadCompleteNotification,
  showUploadFailedNotification,
  showUploadPreparingNotification,
  showUploadProgressNotification,
} from "./uploadNotification";

export const ATTACHMENTS_UPLOADED_EVENT = "kibble-attachments-uploaded";

export type AttachmentsUploadedDetail = {
  eventId: string;
  uploaded: EventAttachment[];
};

export type FailedUploadFile = {
  name: string;
  size: number;
  file?: File;
};

export type FailedUploadItem = {
  eventId: string;
  totalCount: number;
  succeededFiles: { id?: string; name?: string; path?: string }[];
  failedFiles: FailedUploadFile[];
};

export type BackgroundUploadSnapshot = {
  current: {
    eventId: string;
    fileCount: number;
    progress: AttachmentUploadProgress | null;
    /** OS Background Fetch가 받으면 앱을 나가도 된다 */
    canLeave: boolean;
  } | null;
  failedCount: number;
  failedItems: FailedUploadItem[];
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
let bfActive = false;
let bfFailedCount = 0;
let bfFailedJobs: import("./backgroundFetchJob").BfJob[] = [];
let cancelGen = 0;
let unsubBf: (() => void) | null = null;
let unsubOnline: (() => void) | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function computeFailedItems(): FailedUploadItem[] {
  const map = new Map<string, FailedUploadItem>();

  for (const job of failed) {
    const existing = map.get(job.eventId) ?? {
      eventId: job.eventId,
      totalCount: 0,
      succeededFiles: [],
      failedFiles: [],
    };
    for (const f of job.files) {
      existing.failedFiles.push({ name: f.name, size: f.size, file: f });
    }
    existing.totalCount = existing.succeededFiles.length + existing.failedFiles.length;
    map.set(job.eventId, existing);
  }

  for (const job of bfFailedJobs) {
    const existing = map.get(job.eventId) ?? {
      eventId: job.eventId,
      totalCount: 0,
      succeededFiles: [],
      failedFiles: [],
    };
    const uploadedSet = new Set(job.uploadedIndex ?? []);
    for (let i = 0; i < job.files.length; i++) {
      const f = job.files[i];
      if (uploadedSet.has(i)) {
        existing.succeededFiles.push({ name: f.name });
      } else {
        existing.failedFiles.push({ name: f.name, size: f.size });
      }
    }
    existing.totalCount = existing.succeededFiles.length + existing.failedFiles.length;
    map.set(job.eventId, existing);
  }

  return Array.from(map.values());
}

function publish(): void {
  const failedItems = computeFailedItems();
  const failedCount = failed.reduce((n, job) => n + job.files.length, 0) + bfFailedCount;
  if (!current && failedCount === 0) {
    view = null;
  } else {
    view = { current, failedCount, failedItems };
  }
  emit();
}

function holdFailed(eventId: string, files: File[]): void {
  if (files.length === 0) return;
  const existing = failed.find((job) => job.eventId === eventId);
  if (existing) existing.files.push(...files);
  else failed.push({ eventId, files: [...files] });
}

function asUploaded(uploaded: unknown[] | undefined): EventAttachment[] {
  if (!uploaded || uploaded.length === 0) return [];
  return uploaded.filter((item): item is EventAttachment => {
    if (typeof item !== "object" || item === null) return false;
    const row = item as EventAttachment;
    return typeof row.id === "string" && typeof row.path === "string";
  });
}

function onBfMessage(msg: BfClientMessage): void {
  if (msg.action === "started" || msg.action === "progress") {
    bfActive = true;
    current = {
      eventId: msg.eventId ?? current?.eventId ?? "",
      fileCount: msg.fileCount ?? current?.fileCount ?? 0,
      canLeave: true,
      progress: {
        fileIndex: msg.fileIndex ?? 0,
        fileCount: msg.fileCount ?? 1,
        startedCount: (msg.fileIndex ?? 0) + 1,
        loaded: msg.bytesDone ?? 0,
        total: msg.bytesTotal ?? 1,
        phase: "uploading",
        fileStates: [],
      },
    };
    publish();
    return;
  }
  if (msg.action === "done") {
    notifyUploaded(msg.eventId ?? "", asUploaded(msg.uploaded));
    void refreshBfFailedCount();
    return;
  }
  if (msg.action === "cancel") {
    if (msg.eventId) {
      cancelUploadsForEvent(msg.eventId);
    } else {
      cancelBackgroundUpload();
    }
    return;
  }
  if (msg.action === "fail") {
    bfActive = false;
    void refreshBfFailedCount();
    return;
  }
  if (msg.action === "idle") {
    bfActive = false;
    if (!running) current = null;
    void refreshBfFailedCount();
  }
}

async function refreshBfFailedCount(): Promise<void> {
  const { running: runningJob, failedCount, failedJobs } = await hydrateBackgroundFetchJobs();
  bfFailedCount = failedCount;
  bfFailedJobs = failedJobs;
  if (runningJob) {
    bfActive = true;
    if (!current || current.canLeave) {
      current = {
        eventId: runningJob.eventId,
        fileCount: runningJob.files.length,
        canLeave: true,
        progress: {
          fileIndex: runningJob.fileIndex,
          fileCount: runningJob.files.length,
          startedCount: runningJob.fileIndex + 1,
          loaded: runningJob.bytesDone,
          total: Math.max(jobTotalBytes(runningJob), 1),
          phase: runningJob.bytesDone > 0 ? "uploading" : "preparing",
          fileStates: [],
        },
      };
    }
  } else {
    bfActive = false;
    if (!running && current?.canLeave) {
      current = null;
    }
  }
  publish();
}

/** 배너가 마운트되면 SW 메시지와 재실행 중인 작업을 붙인다. */
export function bindBackgroundFetchBridge(): () => void {
  if (!unsubBf) {
    unsubBf = subscribeBackgroundFetchMessages(onBfMessage);
    // 오래된 실패 잡·주인 없는 사본은 여기서만 걷는다 (세션당 한 번).
    void sweepBackgroundFetchJobs()
      .catch(() => {})
      .then(() => refreshBfFailedCount());

    if (typeof window !== "undefined") {
      const onResume = () => {
        if (view && view.failedCount > 0 && !view.current && !running) {
          retryBackgroundUpload();
        }
      };
      const onVisibility = () => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          onResume();
        }
      };
      window.addEventListener("online", onResume);
      document.addEventListener("visibilitychange", onVisibility);
      unsubOnline = () => {
        window.removeEventListener("online", onResume);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }
  }
  return () => {
    unsubBf?.();
    unsubBf = null;
    unsubOnline?.();
    unsubOnline = null;
  };
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

/** 기록은 이미 저장된 뒤다. 화면에서 올리며 알림 권한이 있으면 상단바 알림창에 진행 상태를 표시한다. */
export function startBackgroundUpload(eventId: string, files: File[]): void {
  if (files.length === 0) return;
  void requestUploadNotificationPermission();
  queue.push({ eventId, files: [...files] });
  void drain();
}

/** 배너의 그만두기 — 큐·진행 중·실패 목록을 모두 끊는다. 기록 행은 그대로 둔다. */
export function cancelBackgroundUpload(): void {
  cancelGen += 1;
  queue.length = 0;
  failed.length = 0;
  jobAbort?.abort();
  bfActive = false;
  bfFailedCount = 0;
  bfFailedJobs = [];
  void cancelAllBackgroundFetches();
  void dismissUploadNotification();
  if (!running) {
    current = null;
  }
  publish();
}

/** 이력 삭제 전에 그 기록으로 가는 전송만 끊는다. */
export function cancelUploadsForEvent(eventId: string): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].eventId === eventId) queue.splice(i, 1);
  }
  for (let i = failed.length - 1; i >= 0; i--) {
    if (failed[i].eventId === eventId) failed.splice(i, 1);
  }
  bfFailedJobs = bfFailedJobs.filter((j) => j.eventId !== eventId);
  void abortBackgroundFetchesFor((job) => job.eventId === eventId).then(() => {
    void refreshBfFailedCount();
  });
  if (current?.eventId === eventId) {
    jobAbort?.abort();
    if (current.canLeave) current = null;
  }
  publish();
}

/** 특정 기록의 특정 실패 파일만 목록에서 제외한다. */
export function dismissFailedUploadFile(eventId: string, fileName: string): void {
  let changed = false;
  const matchIdx = failed.findIndex((job) => job.eventId === eventId);
  if (matchIdx !== -1) {
    const job = failed[matchIdx];
    const prevLen = job.files.length;
    job.files = job.files.filter((f) => f.name !== fileName);
    if (job.files.length < prevLen) {
      changed = true;
      if (job.files.length === 0) {
        failed.splice(matchIdx, 1);
      }
    }
  }

  for (let i = bfFailedJobs.length - 1; i >= 0; i--) {
    const bfJob = bfFailedJobs[i];
    if (bfJob.eventId === eventId) {
      const fileIdx = bfJob.files.findIndex((f) => f.name === fileName);
      if (fileIdx !== -1) {
        changed = true;
        bfJob.files.splice(fileIdx, 1);
        if (bfJob.files.length === 0) {
          bfFailedJobs.splice(i, 1);
        }
      }
    }
  }

  if (changed) {
    bfFailedCount = bfFailedJobs.reduce(
      (n, j) => n + (j.files.length - (j.uploadedIndex?.length ?? 0)),
      0,
    );
    publish();
    if (failed.length === 0 && bfFailedJobs.length === 0) {
      void dismissUploadNotification();
    }
  }
}

export function retryBackgroundUpload(targetEventId?: string): void {
  let toRetry: Job[] = [];
  if (targetEventId) {
    const matchIdx = failed.findIndex((job) => job.eventId === targetEventId);
    if (matchIdx !== -1) {
      toRetry = failed.splice(matchIdx, 1);
    }
  } else {
    toRetry = failed.splice(0, failed.length);
  }
  for (let i = toRetry.length - 1; i >= 0; i--) {
    queue.unshift(toRetry[i]);
  }

  const shouldRetryBf =
    bfFailedCount > 0 ||
    bfFailedJobs.length > 0 ||
    (toRetry.length === 0 && (!targetEventId || bfFailedJobs.some((j) => j.eventId === targetEventId)));

  if (shouldRetryBf) {
    if (!targetEventId) {
      bfFailedCount = 0;
      bfFailedJobs = [];
    } else {
      bfFailedJobs = bfFailedJobs.filter((j) => j.eventId !== targetEventId);
      bfFailedCount = bfFailedJobs.reduce((n, j) => n + (j.files.length - (j.uploadedIndex?.length ?? 0)), 0);
    }
    bfActive = true;
    publish();

    void retryFailedBackgroundFetches(targetEventId).then(async (ok) => {
      if (!ok) bfActive = false;
      await refreshBfFailedCount();
    });
  }

  if (toRetry.length > 0) {
    publish();
    void drain();
  } else {
    publish();
  }
}

export function mergeTimelineAttachments(
  events: TimelineEvent[],
  eventId: string,
  uploaded: EventAttachment[],
): TimelineEvent[] {
  if (uploaded.length === 0) return events;
  return events.map((event) => {
    if (event.id !== eventId) return event;
    const existing = event.attachments ?? [];
    const existingIds = new Set(existing.map((a) => a.id));
    const fresh = uploaded.filter((a) => !existingIds.has(a.id));
    if (fresh.length === 0) return event;
    return { ...event, attachments: [...existing, ...fresh] };
  });
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
      const gen = cancelGen;
      current = {
        eventId: job.eventId,
        fileCount: job.files.length,
        progress: null,
        canLeave: false,
      };
      publish();

      if (await canUseBackgroundFetch()) {
        const started = await startViaBackgroundFetch(job.eventId, job.files, (prep) => {
          if (current?.eventId !== job.eventId) return;
          // 손질·복사만 몇 초가 걸린다. SW가 전송을 시작해야 알림이 뜨던 예전에는
          // 저장을 누른 뒤 그동안 상단바가 비어 있어 앱이 멈춘 것처럼 보였다.
          void showUploadPreparingNotification({
            fileIndex: prep.fileIndex,
            fileCount: prep.fileCount,
            eventId: job.eventId,
          });
          current = {
            ...current,
            canLeave: false,
            progress: {
              fileIndex: prep.fileIndex,
              fileCount: prep.fileCount,
              startedCount: prep.fileIndex + 1,
              loaded: 0,
              total: 1,
              phase: "preparing",
              fileStates: [],
            },
          };
          publish();
        });
        if (gen !== cancelGen) {
          if (started) void cancelAllBackgroundFetches();
          continue;
        }
        if (started) {
          bfActive = true;
          if (current?.eventId === job.eventId) {
            current = { ...current, canLeave: true };
            publish();
          }
          continue;
        }
      }

      if (gen !== cancelGen) continue;

      const abort = new AbortController();
      jobAbort = abort;
      void showUploadProgressNotification({
        fileIndex: 0,
        fileCount: job.files.length,
        loaded: 0,
        total: Math.max(job.files.reduce((n, f) => n + f.size, 0), 1),
        force: true,
        eventId: job.eventId,
      });
      try {
        const { uploaded, remaining } = await uploadEventAttachments(
          job.eventId,
          job.files,
          (progress) => {
            if (current?.eventId !== job.eventId) return;
            current = { ...current, progress, canLeave: false };
            publish();
            void showUploadProgressNotification({
              fileIndex: progress.fileIndex,
              fileCount: progress.fileCount,
              loaded: progress.loaded,
              total: progress.total,
              eventId: job.eventId,
            });
          },
          abort.signal,
        );
        notifyUploaded(job.eventId, uploaded);
        if (!abort.signal.aborted) {
          if (remaining.length === 0) {
            for (let i = failed.length - 1; i >= 0; i--) {
              if (failed[i].eventId === job.eventId) failed.splice(i, 1);
            }
            void showUploadCompleteNotification(job.files.length, job.eventId);
          } else {
            holdFailed(job.eventId, remaining);
            void showUploadFailedNotification(remaining.length, job.eventId);
          }
        }
        if (uploaded.length > 0) {
          void abortBackgroundFetchesFor((bfJob) => bfJob.eventId === job.eventId).then(() => {
            void refreshBfFailedCount();
          });
        }
      } catch (err) {
        if (isUploadCancelled(err)) {
          // 그만두기 — 실패 배너에 남기지 않는다
          void dismissUploadNotification();
        } else {
          console.warn("[kibble] background upload failed", err);
          holdFailed(job.eventId, job.files);
          void showUploadFailedNotification(job.files.length);
        }
      } finally {
        if (jobAbort === abort) jobAbort = null;
      }
    }
    if (!bfActive) current = null;
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
  bfActive = false;
  bfFailedCount = 0;
  bfFailedJobs = [];
  cancelGen = 0;
  unsubBf?.();
  unsubBf = null;
  unsubOnline?.();
  unsubOnline = null;
  listeners.clear();
}

