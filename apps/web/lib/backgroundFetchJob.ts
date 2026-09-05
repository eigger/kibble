import { UPLOAD_CHUNK_SIZE_BYTES } from "@kibble/shared";

/** IndexedDB / Cache 이름. 서비스워커 `sw-background-fetch.js`와 같아야 한다. */
export const BF_DB_NAME = "kibble-bf";
export const BF_DB_VERSION = 1;
export const BF_STORE = "jobs";
export const BF_CACHE = "kibble-bf-v1";
export const BF_FETCH_PREFIX = "kbf:";
export const BF_MESSAGE_TYPE = "kibble-bf";
export const BF_SW_KICK = "kibble-bf-kick";
export const BF_SW_CANCEL = "kibble-bf-cancel";
export const BF_MAX_RETRIES = 5;
export const BF_MAX_BACKOFF_MS = 5000;

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

export function applyChunkDesync(
  job: BfJob,
  receivedBytes: number,
  nextChunkIndex: number,
): BfJob {
  const prior = job.files.slice(0, job.fileIndex).reduce((n, file) => n + file.size, 0);
  return {
    ...job,
    chunkIndex: nextChunkIndex,
    bytesDone: prior + receivedBytes,
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
  };
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
