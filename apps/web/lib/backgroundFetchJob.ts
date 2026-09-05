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
  fileIndex: number;
  chunkIndex: number;
  uploadId: string | null;
  fetchId: string | null;
  uploaded: unknown[];
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
  | { kind: "complete"; uploadId: string };

export function chunkCount(size: number, chunkSize = UPLOAD_CHUNK_SIZE_BYTES): number {
  if (size <= 0) return 1;
  return Math.ceil(size / chunkSize);
}

export function nextBfWork(job: BfJob, chunkSize = UPLOAD_CHUNK_SIZE_BYTES): BfWork {
  if (job.fileIndex >= job.files.length) return { kind: "done" };
  const file = job.files[job.fileIndex];
  if (!file.chunked) return { kind: "multipart", fileIndex: job.fileIndex };
  if (!job.uploadId) return { kind: "init", fileIndex: job.fileIndex };
  if (job.chunkIndex >= chunkCount(file.size, chunkSize)) {
    return { kind: "complete", uploadId: job.uploadId };
  }
  return {
    kind: "chunk",
    fileIndex: job.fileIndex,
    chunkIndex: job.chunkIndex,
    uploadId: job.uploadId,
  };
}

export function applyBfSuccess(
  job: BfJob,
  work: BfWork,
  result: { uploadId?: string; attachment?: unknown } = {},
  chunkSize = UPLOAD_CHUNK_SIZE_BYTES,
): BfJob {
  switch (work.kind) {
    case "done":
      return job;
    case "multipart": {
      const file = job.files[work.fileIndex];
      return {
        ...job,
        fileIndex: job.fileIndex + 1,
        uploaded: result.attachment ? [...job.uploaded, result.attachment] : job.uploaded,
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
        fileIndex: job.fileIndex + 1,
        chunkIndex: 0,
        uploadId: null,
        uploaded: result.attachment ? [...job.uploaded, result.attachment] : job.uploaded,
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
  return {
    ...job,
    fileIndex: job.fileIndex + 1,
    chunkIndex: 0,
    uploadId: null,
    fetchId: null,
    retries: 0,
  };
}

export function remainingFileCount(job: BfJob): number {
  return Math.max(0, job.files.length - job.fileIndex);
}

export function jobTotalBytes(job: BfJob): number {
  return job.files.reduce((n, file) => n + file.size, 0);
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
