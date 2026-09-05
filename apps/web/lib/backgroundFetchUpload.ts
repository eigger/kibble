import { API_URL, getToken } from "./api";
import { BASE_PATH } from "./base-path";
import { UPLOAD_CHUNK_SIZE_BYTES } from "@kibble/shared";
import {
  BF_FETCH_PREFIX,
  BF_MESSAGE_TYPE,
  BF_SW_ABORT_JOB,
  BF_SW_CANCEL,
  BF_SW_KICK,
  isStaleFailedJob,
  prepareFailedJobForRetry,
  remainingFileCount,
  type BfJob,
  type BfUiCopy,
} from "./backgroundFetchJob";
import { shouldUseChunkedUpload } from "./chunkedUpload";
import { prepareAttachmentForUpload } from "./uploadPrep";
import { beginUploadGuard, endUploadGuard } from "./uploadGuard";
import {
  deleteBfJobAndBlobs,
  deleteOrphanBfBlobs,
  getAllBfJobs,
  persistBfBlobs,
  putBfJob,
} from "./backgroundFetchStore";

export type BfClientMessage = {
  type: typeof BF_MESSAGE_TYPE;
  action: "started" | "progress" | "done" | "fail" | "idle";
  jobId?: string;
  eventId?: string;
  fileIndex?: number;
  fileCount?: number;
  bytesDone?: number;
  bytesTotal?: number;
  remainingCount?: number;
  uploaded?: unknown[];
};

type BgFetchManager = {
  fetch: (...args: unknown[]) => Promise<unknown>;
  get: (id: string) => Promise<{ abort: () => Promise<boolean> } | undefined>;
  getIds: () => Promise<string[]>;
};

function bgFetchOf(
  registration: ServiceWorkerRegistration,
): BgFetchManager | undefined {
  return (registration as ServiceWorkerRegistration & { backgroundFetch?: BgFetchManager })
    .backgroundFetch;
}

/**
 * Service Worker 백그라운드 업로드 지원 여부를 확인합니다.
 * Service Worker, Cache API, IndexedDB가 준비되어 있으면 true를 반환하여
 * 앱 화면을 내리거나 다른 앱으로 전환하더라도 Service Worker가 백그라운드에서
 * 업로드와 상단바 알림 갱신을 계속 진행하도록 합니다.
 */
export async function canUseBackgroundFetch(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("caches" in window) || !("indexedDB" in window)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration.active);
  } catch {
    return false;
  }
}

function uiCopy(): BfUiCopy {
  const locale = typeof localStorage !== "undefined" ? localStorage.getItem("kibble_locale") : null;
  if (locale === "en") {
    return { title: "Kibble", uploading: "Uploading", done: "Uploaded", failed: "Upload failed" };
  }
  return { title: "Kibble", uploading: "올리는 중", done: "올렸습니다", failed: "업로드 실패" };
}

function newJobId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function pokeSw(type: string, extra: Record<string, unknown> = {}): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type, ...extra });
}

function isBfMessage(data: unknown): data is BfClientMessage {
  if (typeof data !== "object" || data === null) return false;
  const msg = data as BfClientMessage;
  return msg.type === BF_MESSAGE_TYPE && typeof msg.action === "string";
}

function waitForStarted(jobId: string, ms = 8_000): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      cleanup();
      resolve(false);
    }, ms);
    function onMsg(event: MessageEvent) {
      if (!isBfMessage(event.data) || event.data.jobId !== jobId) return;
      if (event.data.action === "started" || event.data.action === "progress" || event.data.action === "done") {
        cleanup();
        resolve(true);
      }
      if (event.data.action === "fail") {
        cleanup();
        resolve(false);
      }
    }
    function cleanup() {
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMsg);
    }
    navigator.serviceWorker.addEventListener("message", onMsg);
  });
}

async function abortFetches(ids: string[]): Promise<void> {
  if (ids.length === 0 || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const bg = bgFetchOf(registration);
    if (!bg) return;
    await Promise.all(
      ids.map(async (id) => {
        const active = await bg.get(id);
        await active?.abort();
      }),
    );
  } catch {
    /* abort is best-effort */
  }
}

async function abortAllSiteFetches(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const bg = bgFetchOf(registration);
    if (!bg) return;
    const ids = (await bg.getIds()).filter((id) => id.startsWith(BF_FETCH_PREFIX));
    await abortFetches(ids);
  } catch {
    /* abort is best-effort */
  }
}

/** 한 기록의 전송만 끊는다. 다른 기록의 Background Fetch는 이어서 돈다. */
export async function abortBackgroundFetchesFor(
  predicate: (job: BfJob) => boolean,
): Promise<void> {
  const jobs = await getAllBfJobs().catch(() => [] as BfJob[]);
  const targets = jobs.filter(predicate);
  if (targets.length === 0) return;
  for (const job of targets) {
    await pokeSw(BF_SW_ABORT_JOB, { jobId: job.id });
  }
  await abortFetches(targets.map((job) => job.fetchId).filter((id): id is string => Boolean(id)));
  await Promise.all(targets.map((job) => deleteBfJobAndBlobs(job)));
  await pokeSw(BF_SW_KICK);
}

export async function cancelAllBackgroundFetches(): Promise<void> {
  await abortAllSiteFetches();
  await pokeSw(BF_SW_CANCEL);
  const jobs = await getAllBfJobs().catch(() => [] as BfJob[]);
  await Promise.all(jobs.map((job) => deleteBfJobAndBlobs(job)));
}

export type BfPrepareProgress = { fileIndex: number; fileCount: number };

/**
 * 파일을 Cache에 담고 SW가 Background Fetch를 걸게 한다.
 * 등록이 끝나면 탭을 닫아도 OS가 전송을 잇는다. 실패하면 false — 호출부가 화면 전송으로 폴백.
 */
export async function startViaBackgroundFetch(
  eventId: string,
  files: File[],
  onPreparing?: (p: BfPrepareProgress) => void,
): Promise<boolean> {
  if (files.length === 0) return false;
  if (!(await canUseBackgroundFetch())) return false;
  const token = getToken();
  if (!token) return false;

  let created: BfJob | null = null;
  beginUploadGuard();
  try {
    const prepared: File[] = [];
    for (let i = 0; i < files.length; i++) {
      onPreparing?.({ fileIndex: i, fileCount: files.length });
      prepared.push(await prepareAttachmentForUpload(files[i]));
    }

    const existing = await getAllBfJobs();
    const inFlight = existing.some((job) => Boolean(job.fetchId));

    const id = newJobId();
    const locale =
      typeof localStorage !== "undefined" ? localStorage.getItem("kibble_locale") : null;
    created = {
      id,
      eventId,
      token,
      apiBase: API_URL,
      locale,
      iconUrl: `${window.location.origin}${BASE_PATH}/icons/icon-192.png`,
      ui: uiCopy(),
      files: prepared.map((file, index) => ({
        index,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        chunked: shouldUseChunkedUpload(file),
      })),
      fileIndex: 0,
      chunkIndex: 0,
      uploadId: null,
      fetchId: null,
      uploaded: [],
      uploadedIndex: [],
      skipped: [],
      bytesDone: 0,
      status: "pending",
      retries: 0,
      seq: 0,
      chunkSize: UPLOAD_CHUNK_SIZE_BYTES,
      createdAt: Date.now(),
    };
    await persistBfBlobs(id, prepared);
    await putBfJob(created);

    const startedWait = inFlight ? Promise.resolve(true) : waitForStarted(id, 8_000);
    await pokeSw(BF_SW_KICK, { jobId: id });
    const ok = await startedWait;
    if (!ok) {
      await pokeSw(BF_SW_ABORT_JOB, { jobId: id });
      await abortBackgroundFetchesFor((job) => job.id === id);
      await deleteBfJobAndBlobs(created);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[kibble] background fetch persist failed", err);
    if (created) await deleteBfJobAndBlobs(created).catch(() => {});
    return false;
  } finally {
    endUploadGuard();
  }
}

export async function retryFailedBackgroundFetches(): Promise<boolean> {
  const jobs = await getAllBfJobs().catch(() => [] as BfJob[]);
  const failed = jobs.filter((job) => job.status === "failed");
  if (failed.length === 0) return false;
  if (!(await canUseBackgroundFetch())) return false;
  for (const job of failed) {
    await putBfJob(prepareFailedJobForRetry(job, getToken()));
  }
  await pokeSw(BF_SW_KICK);
  return true;
}

export function bfFailedFileCount(jobs: BfJob[]): number {
  return jobs
    .filter((job) => job.status === "failed")
    .reduce((n, job) => n + remainingFileCount(job), 0);
}

/**
 * 오래된 실패 잡과 주인 없는 파일 사본을 걷는다. 성공·중단 경로에만 삭제가 있으면
 * 사용자가 다시 올리기도 그만두기도 안 누른 잡이 원본 영상과 Bearer 토큰을 붙든 채
 * 영원히 남는다. 배너가 붙을 때마다 한 번씩 돈다.
 */
export async function sweepBackgroundFetchJobs(now = Date.now()): Promise<BfJob[]> {
  const jobs = await getAllBfJobs().catch(() => [] as BfJob[]);
  const stale = jobs.filter((job) => isStaleFailedJob(job, now));
  for (const job of stale) {
    await deleteBfJobAndBlobs(job).catch(() => {});
  }
  const kept = jobs.filter((job) => !stale.includes(job));
  await deleteOrphanBfBlobs(new Set(kept.map((job) => job.id))).catch(() => {});
  return kept;
}

export async function hydrateBackgroundFetchJobs(): Promise<{
  running: BfJob | undefined;
  failedCount: number;
}> {
  // 읽기만 한다 — 메시지마다 불리므로 Cache 전체 순회를 여기 두지 않는다. 정리는
  // 배너가 붙을 때 sweepBackgroundFetchJobs()가 한 번 돈다.
  const jobs = await getAllBfJobs().catch(() => [] as BfJob[]);
  return {
    running: jobs.find((job) => job.status === "running" || job.status === "pending"),
    failedCount: bfFailedFileCount(jobs),
  };
}

export function subscribeBackgroundFetchMessages(
  handler: (msg: BfClientMessage) => void,
): () => void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const onMsg = (event: MessageEvent) => {
    if (isBfMessage(event.data)) handler(event.data);
  };
  navigator.serviceWorker.addEventListener("message", onMsg);
  return () => navigator.serviceWorker.removeEventListener("message", onMsg);
}
