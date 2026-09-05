import { UPLOAD_CHUNK_SIZE_BYTES } from "@kibble/shared";

/** IndexedDB / Cache 이름. 서비스워커 `sw-background-fetch.js`와 같아야 한다. */
export const BF_DB_NAME = "kibble-bf";
/**
 * v1 잡에는 `chunkSize`가 없다. SW의 `jobChunkSize`는 그때 던지므로, 열자마자
 * 매 kick마다 죽는 잡이 남는다. 스토어를 통째로 버리는 쪽이 싸다.
 */
export const BF_DB_VERSION = 2;
export const BF_STORE = "jobs";
export const BF_CACHE = "kibble-bf-v1";
export const BF_FETCH_PREFIX = "kbf:";
export const BF_MESSAGE_TYPE = "kibble-bf";
export const BF_SW_KICK = "kibble-bf-kick";
export const BF_SW_CANCEL = "kibble-bf-cancel";
export const BF_SW_ABORT_JOB = "kibble-bf-abort-job";
export const BF_MAX_RETRIES = 2;
export const BF_MAX_BACKOFF_MS = 5000;
/**
 * 실패로 남은 잡을 붙들고 있는 기간. 원본은 사용자 갤러리에 그대로 있으므로,
 * 지나면 "배너에서 다시 올리기"만 잃고 다시 붙이면 된다. 그 대가로 폰 저장소에
 * 수백 MB짜리 사본이 무기한 남지 않는다.
 */
export const BF_JOB_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export type BfJobStatus = "pending" | "running" | "failed" | "cancelled";

export type BfFileMeta = {
  index: number;
  name: string;
  type: string;
  size: number;
  chunked: boolean;
};

export type BfUiCopy = {
  title: string;
  uploading: string;
  done: string;
  failed: string;
};

export type BfJob = {
  id: string;
  eventId: string;
  token: string;
  apiBase: string;
  locale: string | null;
  iconUrl: string;
  ui: BfUiCopy;
  files: BfFileMeta[];
  /** 서버·페이지와 같은 청크 크기. SW는 상수를 갖지 않고 이 값을 쓴다. */
  chunkSize: number;
  /** 잡을 만든 시각. 실패분 GC는 이 값으로 나이를 본다. */
  createdAt: number;
  fileIndex: number;
  chunkIndex: number;
  uploadId: string | null;
  fetchId: string | null;
  uploaded: unknown[];
  /** 서버에 붙은 파일 인덱스. 재시도 때 이 인덱스는 건너뛴다. */
  uploadedIndex: number[];
  /** 4xx로 건너뛴 인덱스. 성공 잡으로 지우지 않고 실패 배너에 남긴다 (R59). */
  skipped: number[];
  bytesDone: number;
  status: BfJobStatus;
  retries: number;
  seq: number;
};

export type BfWork =
  | { kind: "done" }
  | { kind: "multipart"; fileIndex: number }
  | { kind: "init"; fileIndex: number }
  | { kind: "chunk"; fileIndex: number; chunkIndex: number; uploadId: string }
  | { kind: "complete"; fileIndex: number; uploadId: string };

export function jobChunkSize(job: Pick<BfJob, "chunkSize">): number {
  return job.chunkSize > 0 ? job.chunkSize : UPLOAD_CHUNK_SIZE_BYTES;
}

export function chunkCount(size: number, chunkSize = UPLOAD_CHUNK_SIZE_BYTES): number {
  if (size <= 0) return 1;
  return Math.ceil(size / chunkSize);
}

export function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** (attempt - 1), BF_MAX_BACKOFF_MS);
}

/** 아직 서버에 안 붙은 다음 파일. 재시도 때 fileIndex를 0으로 되돌려도 성공분은 건너뛴다. */
export function currentFileIndex(job: BfJob): number {
  const uploaded = new Set(job.uploadedIndex ?? []);
  for (let i = job.fileIndex; i < job.files.length; i++) {
    if (!uploaded.has(i)) return i;
  }
  return job.files.length;
}

export function nextBfWork(job: BfJob, chunkSize = jobChunkSize(job)): BfWork {
  const fileIndex = currentFileIndex(job);
  if (fileIndex >= job.files.length) return { kind: "done" };
  const file = job.files[fileIndex];
  if (!file.chunked) return { kind: "multipart", fileIndex };
  if (!job.uploadId) return { kind: "init", fileIndex };
  if (job.chunkIndex >= chunkCount(file.size, chunkSize)) {
    return { kind: "complete", fileIndex, uploadId: job.uploadId };
  }
  return {
    kind: "chunk",
    fileIndex,
    chunkIndex: job.chunkIndex,
    uploadId: job.uploadId,
  };
}

export function applyBfSuccess(
  job: BfJob,
  work: BfWork,
  result: { uploadId?: string; attachment?: unknown } = {},
  chunkSize = jobChunkSize(job),
): BfJob {
  switch (work.kind) {
    case "done":
      return job;
    case "multipart": {
      const file = job.files[work.fileIndex];
      return {
        ...job,
        fileIndex: work.fileIndex + 1,
        uploaded: result.attachment ? [...job.uploaded, result.attachment] : job.uploaded,
        uploadedIndex: [...(job.uploadedIndex ?? []), work.fileIndex],
        bytesDone: job.bytesDone + file.size,
        retries: 0,
      };
    }
    case "init":
      return { ...job, uploadId: result.uploadId ?? job.uploadId, chunkIndex: 0, retries: 0 };
    case "chunk": {
      const file = job.files[work.fileIndex];
      const start = work.chunkIndex * chunkSize;
      const size = Math.min(chunkSize, Math.max(0, file.size - start));
      return {
        ...job,
        chunkIndex: job.chunkIndex + 1,
        bytesDone: job.bytesDone + size,
        retries: 0,
      };
    }
    case "complete":
      return {
        ...job,
        fileIndex: work.fileIndex + 1,
        chunkIndex: 0,
        uploadId: null,
        uploaded: result.attachment ? [...job.uploaded, result.attachment] : job.uploaded,
        uploadedIndex: [...(job.uploadedIndex ?? []), work.fileIndex],
        retries: 0,
      };
  }
}

/** 서버에 실제로 붙은 파일들의 바이트 합. 진행률의 기준점이다. */
export function uploadedBytes(job: BfJob): number {
  const uploaded = new Set(job.uploadedIndex ?? []);
  return job.files.reduce((n, file, i) => (uploaded.has(i) ? n + file.size : n), 0);
}

export function applyChunkDesync(
  job: BfJob,
  receivedBytes: number,
  nextChunkIndex: number,
): BfJob {
  // `fileIndex`까지의 합이 아니라 **실제로 올라간** 파일들의 합이다. 4xx로 건너뛴
  // 파일이나 재시도로 되감긴 커서가 있으면 두 값이 갈린다.
  return {
    ...job,
    chunkIndex: nextChunkIndex,
    bytesDone: uploadedBytes(job) + receivedBytes,
  };
}

export function skipCurrentFile(job: BfJob): BfJob {
  const index = currentFileIndex(job);
  return {
    ...job,
    skipped: [...(job.skipped ?? []), index],
    fileIndex: index + 1,
    chunkIndex: 0,
    uploadId: null,
    fetchId: null,
    retries: 0,
  };
}

/** 서버에 안 붙은 파일 수 — 아직 시도 전 + 4xx 건너뛴 것 + 지금 실패한 것. */
export function remainingFileCount(job: BfJob): number {
  const uploaded = new Set(job.uploadedIndex ?? []);
  let n = 0;
  for (let i = 0; i < job.files.length; i++) {
    if (!uploaded.has(i)) n += 1;
  }
  return n;
}

export function jobTotalBytes(job: BfJob): number {
  return job.files.reduce((n, file) => n + file.size, 0);
}

export function prepareFailedJobForRetry(job: BfJob, token: string | null): BfJob {
  return {
    ...job,
    token: token || job.token,
    status: "pending",
    retries: 0,
    fetchId: null,
    skipped: [],
    fileIndex: 0,
    chunkIndex: 0,
    uploadId: null,
    // 커서를 0으로 되감으므로 진행률도 되감는다. 안 하면 다음 성공분이 옛 누적 위에
    // 더해져 loaded가 total을 넘고 배너가 100%에 붙박인다.
    bytesDone: uploadedBytes(job),
  };
}

/** 되살릴 가망이 없는 실패 잡. 원본 파일 사본을 붙들고 있을 이유가 없다. */
export function isStaleFailedJob(job: BfJob, now: number, ttlMs = BF_JOB_TTL_MS): boolean {
  if (job.status !== "failed") return false;
  const createdAt = typeof job.createdAt === "number" ? job.createdAt : 0;
  return now - createdAt > ttlMs;
}

/** Cache 키에서 잡 id를 되뽑는다. 잡이 사라진 사본을 걷어내는 데 쓴다. */
export function parseFileCacheUrl(url: string): { jobId: string; index: number } | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "bf") return null;
  const index = Number(parts[2]);
  if (!Number.isInteger(index) || index < 0) return null;
  return { jobId: parts[1], index };
}

export function bfFetchId(jobId: string, seq: number): string {
  return `${BF_FETCH_PREFIX}${jobId}:${seq}`;
}

export function parseBfFetchId(id: string): { jobId: string; seq: number } | null {
  if (!id.startsWith(BF_FETCH_PREFIX)) return null;
  const rest = id.slice(BF_FETCH_PREFIX.length);
  const last = rest.lastIndexOf(":");
  if (last <= 0) return null;
  const jobId = rest.slice(0, last);
  const seq = Number(rest.slice(last + 1));
  if (!jobId || !Number.isInteger(seq)) return null;
  return { jobId, seq };
}

export function fileCacheUrl(jobId: string, index: number): string {
  return `https://kibble.invalid/bf/${jobId}/${index}`;
}

export function isPermanentBfStatus(status: number, workKind: BfWork["kind"]): boolean {
  if (status === 400 || status === 404 || status === 413 || status === 415 || status === 422) {
    return true;
  }
  return status === 409 && workKind !== "chunk";
}
