import { describe, expect, it } from "vitest";
import { UPLOAD_CHUNK_SIZE_BYTES } from "@kibble/shared";
import {
  applyBfSuccess,
  applyChunkDesync,
  bfFetchId,
  chunkCount,
  fileCacheUrl,
  isPermanentBfStatus,
  nextBfWork,
  parseBfFetchId,
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
    fileIndex: 0,
    chunkIndex: 0,
    uploadId: null,
    fetchId: null,
    uploaded: [],
    bytesDone: 0,
    status: "running",
    retries: 0,
    seq: 0,
    ...partial,
  };
}

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
    expect(nextBfWork(next).kind).toBe("done");
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

  it("skips the current file and clears the chunk session", () => {
    const j = job({
      files: [
        { index: 0, name: "a.jpg", type: "image/jpeg", size: 5, chunked: false },
        { index: 1, name: "b.jpg", type: "image/jpeg", size: 7, chunked: false },
      ],
      uploadId: "u",
      chunkIndex: 3,
    });
    const next = skipCurrentFile(j);
    expect(next.fileIndex).toBe(1);
    expect(next.uploadId).toBeNull();
    expect(next.chunkIndex).toBe(0);
    expect(remainingFileCount(next)).toBe(1);
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
});
