/**
 * 상태기 사본은 `public/sw-background-fetch.js`에도 있다. public SW는 번들을
 * import하지 못하므로 두 벌을 맞춘다. 청크 크기는 잡 레코드 `chunkSize`로만 흘린다 —
 * SW에 8MB 리터럴을 두지 않는 이유. 아래 단언이 깨지면 SW 사본도 같이 본다.
 */
import { describe, expect, it } from "vitest";
import { UPLOAD_CHUNK_SIZE_BYTES } from "@kibble/shared";
import {
  applyBfSuccess,
  applyChunkDesync,
  backoffMs,
  bfFetchId,
  chunkCount,
  fileCacheUrl,
  isPermanentBfStatus,
  jobChunkSize,
  nextBfWork,
  parseBfFetchId,
  prepareFailedJobForRetry,
  remainingFileCount,
  skipCurrentFile,
  type BfJob,
} from "./backgroundFetchJob";

function job(partial: Partial<BfJob> & Pick<BfJob, "files">): BfJob {
  return {
    id: "job-1",
    eventId: "e1",
    token: "t",
    apiBase: "http://localhost",
    locale: "ko",
    iconUrl: "",
    ui: { title: "Kibble", uploading: "up", done: "ok", failed: "no" },
    chunkSize: UPLOAD_CHUNK_SIZE_BYTES,
    createdAt: 0,
    fileIndex: 0,
    chunkIndex: 0,
    uploadId: null,
    fetchId: null,
    uploaded: [],
    uploadedIndex: [],
    skipped: [],
    bytesDone: 0,
    status: "running",
    retries: 0,
    seq: 0,
    ...partial,
  };
}

describe("chunk size contract", () => {
  it("matches the shared upload chunk size so the SW job field cannot silently drift", () => {
    expect(UPLOAD_CHUNK_SIZE_BYTES).toBe(8 * 1024 * 1024);
  });

  it("counts chunks from the job record, not a module default", () => {
    const j = job({
      files: [{ index: 0, name: "a.mp4", type: "video/mp4", size: 30, chunked: true }],
      chunkSize: 10,
      uploadId: "u1",
    });
    expect(jobChunkSize(j)).toBe(10);
    let cur = j;
    expect(nextBfWork(cur)).toEqual({ kind: "chunk", fileIndex: 0, chunkIndex: 0, uploadId: "u1" });
    cur = applyBfSuccess(cur, nextBfWork(cur));
    expect(nextBfWork(cur)).toEqual({ kind: "chunk", fileIndex: 0, chunkIndex: 1, uploadId: "u1" });
    cur = applyBfSuccess(cur, nextBfWork(cur));
    expect(nextBfWork(cur)).toEqual({ kind: "chunk", fileIndex: 0, chunkIndex: 2, uploadId: "u1" });
    cur = applyBfSuccess(cur, nextBfWork(cur));
    expect(nextBfWork(cur)).toEqual({ kind: "complete", uploadId: "u1" });
  });
});

describe("nextBfWork", () => {
  it("finishes when every file is past the cursor", () => {
    const j = job({ files: [{ index: 0, name: "a.jpg", type: "image/jpeg", size: 10, chunked: false }], fileIndex: 1 });
    expect(nextBfWork(j)).toEqual({ kind: "done" });
  });

  it("posts a photo as multipart", () => {
    const j = job({ files: [{ index: 0, name: "a.jpg", type: "image/jpeg", size: 10, chunked: false }] });
    expect(nextBfWork(j)).toEqual({ kind: "multipart", fileIndex: 0 });
  });

  it("inits a video before the first chunk", () => {
    const j = job({
      files: [{ index: 0, name: "a.mp4", type: "video/mp4", size: UPLOAD_CHUNK_SIZE_BYTES * 2 + 1, chunked: true }],
    });
    expect(nextBfWork(j)).toEqual({ kind: "init", fileIndex: 0 });
  });

  it("sends chunks in order then completes", () => {
    const size = UPLOAD_CHUNK_SIZE_BYTES + 10;
    const j = job({
      files: [{ index: 0, name: "a.mp4", type: "video/mp4", size, chunked: true }],
      uploadId: "u1",
      chunkIndex: 0,
    });
    expect(nextBfWork(j)).toEqual({ kind: "chunk", fileIndex: 0, chunkIndex: 0, uploadId: "u1" });
    const afterFirst = applyBfSuccess(j, nextBfWork(j));
    expect(nextBfWork(afterFirst)).toEqual({ kind: "chunk", fileIndex: 0, chunkIndex: 1, uploadId: "u1" });
    const afterSecond = applyBfSuccess(afterFirst, nextBfWork(afterFirst));
    expect(nextBfWork(afterSecond)).toEqual({ kind: "complete", uploadId: "u1" });
  });
});

describe("applyBfSuccess", () => {
  it("advances a photo and records the attachment", () => {
    const j = job({ files: [{ index: 0, name: "a.jpg", type: "image/jpeg", size: 12, chunked: false }] });
    const next = applyBfSuccess(j, nextBfWork(j), { attachment: { id: "a1" } });
    expect(next.fileIndex).toBe(1);
    expect(next.bytesDone).toBe(12);
    expect(next.uploaded).toEqual([{ id: "a1" }]);
    expect(next.uploadedIndex).toEqual([0]);
    expect(nextBfWork(next).kind).toBe("done");
    expect(remainingFileCount(next)).toBe(0);
  });

  it("stores uploadId from init without counting bytes", () => {
    const j = job({
      files: [{ index: 0, name: "a.mp4", type: "video/mp4", size: 20, chunked: true }],
    });
    const next = applyBfSuccess(j, nextBfWork(j), { uploadId: "u1" });
    expect(next.uploadId).toBe("u1");
    expect(next.bytesDone).toBe(0);
    expect(next.chunkIndex).toBe(0);
  });
});

describe("applyChunkDesync / skip", () => {
  it("rebuilds bytesDone from prior files plus the server offset", () => {
    const j = job({
      files: [
        { index: 0, name: "a.jpg", type: "image/jpeg", size: 5, chunked: false },
        { index: 1, name: "b.mp4", type: "video/mp4", size: 100, chunked: true },
      ],
      fileIndex: 1,
      bytesDone: 5,
    });
    const next = applyChunkDesync(j, 40, 2);
    expect(next.chunkIndex).toBe(2);
    expect(next.bytesDone).toBe(45);
  });

  it("keeps a skipped file in remaining so the fail banner can show it (R59)", () => {
    const j = job({
      files: [
        { index: 0, name: "a.jpg", type: "image/jpeg", size: 5, chunked: false },
        { index: 1, name: "b.jpg", type: "image/jpeg", size: 7, chunked: false },
      ],
      uploadId: "u",
      chunkIndex: 3,
    });
    const skipped = skipCurrentFile(j);
    expect(skipped.skipped).toEqual([0]);
    expect(skipped.fileIndex).toBe(1);
    expect(skipped.uploadId).toBeNull();
    expect(remainingFileCount(skipped)).toBe(2);

    const afterOther = applyBfSuccess(skipped, nextBfWork(skipped), { attachment: { id: "b1" } });
    expect(nextBfWork(afterOther).kind).toBe("done");
    expect(remainingFileCount(afterOther)).toBe(1);
    expect(afterOther.uploadedIndex).toEqual([1]);
  });
});

describe("prepareFailedJobForRetry", () => {
  it("refreshes the token and retries skipped files without re-posting successes", () => {
    const j = job({
      files: [
        { index: 0, name: "a.jpg", type: "image/jpeg", size: 5, chunked: false },
        { index: 1, name: "b.jpg", type: "image/jpeg", size: 7, chunked: false },
      ],
      skipped: [0],
      uploadedIndex: [1],
      fileIndex: 2,
      status: "failed",
      retries: 5,
      token: "dead",
    });
    const next = prepareFailedJobForRetry(j, "fresh");
    expect(next.token).toBe("fresh");
    expect(next.status).toBe("pending");
    expect(next.retries).toBe(0);
    expect(next.skipped).toEqual([]);
    expect(nextBfWork(next)).toEqual({ kind: "multipart", fileIndex: 0 });
  });

  it("keeps the stored token when none is given", () => {
    const j = job({ files: [{ index: 0, name: "a.jpg", type: "image/jpeg", size: 1, chunked: false }], token: "old" });
    expect(prepareFailedJobForRetry(j, null).token).toBe("old");
  });
});

describe("ids and status", () => {
  it("round-trips a fetch id that contains the job uuid", () => {
    const id = bfFetchId("2b1d8c0a-9f3e-4b11-a222-abcdef123456", 7);
    expect(parseBfFetchId(id)).toEqual({ jobId: "2b1d8c0a-9f3e-4b11-a222-abcdef123456", seq: 7 });
  });

  it("rejects ids that are not ours", () => {
    expect(parseBfFetchId("other")).toBeNull();
  });

  it("treats 409 as retryable only for chunks", () => {
    expect(isPermanentBfStatus(409, "chunk")).toBe(false);
    expect(isPermanentBfStatus(409, "multipart")).toBe(true);
    expect(isPermanentBfStatus(415, "chunk")).toBe(true);
  });

  it("builds a cache URL that is not an app route", () => {
    expect(fileCacheUrl("job", 0)).toMatch(/^https:\/\/kibble\.invalid\/bf\//);
  });

  it("counts a zero-byte file as one chunk", () => {
    expect(chunkCount(0)).toBe(1);
  });

  it("backs off like the in-page chunked path", () => {
    expect(backoffMs(1)).toBe(500);
    expect(backoffMs(2)).toBe(1000);
    expect(backoffMs(5)).toBe(5000);
  });
});
