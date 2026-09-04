import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UPLOAD_CHUNK_SIZE_BYTES } from "@kibble/shared";
import { uploadEventAttachmentInChunks } from "./chunkedUpload";
import { ApiError } from "./api";
import { getPendingUploads, savePendingUpload } from "./pendingUploads";
import type { EventAttachment } from "./types";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "./api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("uploadEventAttachmentInChunks", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("uploads a small file as a single chunk", async () => {
    const file = new File([new Uint8Array(10)], "note.jpg", { type: "image/jpeg" });
    const attachment = { id: "att1", path: "events/a.jpg", mime: "image/jpeg", size: 10, width: 1, height: 1 };
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === "/api/attachments/uploads") return jsonResponse(201, { uploadId: "u1" });
      if (path.includes("/chunks/")) return jsonResponse(200, { receivedBytes: 10, nextChunkIndex: 1 });
      if (path.endsWith("/complete")) return jsonResponse(201, attachment);
      throw new Error(`unexpected path ${path}`);
    });

    const result = await uploadEventAttachmentInChunks("evt1", file);
    expect(result.id).toBe("att1");
    const calls = vi.mocked(apiFetch).mock.calls.map(([path]) => path);
    expect(calls).toEqual([
      "/api/attachments/uploads",
      "/api/attachments/uploads/u1/chunks/0",
      "/api/attachments/uploads/u1/complete",
    ]);
  });

  it("resumes from server progress when pending upload exists", async () => {
    const size = UPLOAD_CHUNK_SIZE_BYTES * 2;
    const file = new File([new Uint8Array(size)], "resume.bin", { type: "video/mp4" });
    savePendingUpload({
      uploadId: "u5",
      eventId: "evt1",
      filename: "resume.bin",
      size,
      mimeType: "video/mp4",
    });

    const chunkCalls: string[] = [];
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === "/api/attachments/uploads/u5") {
        return jsonResponse(200, { receivedBytes: UPLOAD_CHUNK_SIZE_BYTES, nextChunkIndex: 1 });
      }
      if (path.includes("/chunks/")) {
        chunkCalls.push(path);
        return jsonResponse(200, {});
      }
      if (path.endsWith("/complete")) {
        return jsonResponse(201, { id: "f5" } as EventAttachment);
      }
      throw new Error(`unexpected path ${path}`);
    });

    await uploadEventAttachmentInChunks("evt1", file);
    expect(chunkCalls).toEqual(["/api/attachments/uploads/u5/chunks/1"]);
  });
  // 모바일에서 fetch가 통째로 던지는 끊김이 훨씬 흔하다 — 예전에는 이 한 번에
  // 영상 업로드 전체가 죽었다
  it("retries a chunk after a network error", async () => {
    const file = new File([new Uint8Array(10)], "note.jpg", { type: "image/jpeg" });
    let chunkAttempts = 0;
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === "/api/attachments/uploads") return jsonResponse(201, { uploadId: "u2" });
      if (path.includes("/chunks/")) {
        chunkAttempts += 1;
        if (chunkAttempts === 1) throw new TypeError("Failed to fetch");
        return jsonResponse(200, { receivedBytes: 10, nextChunkIndex: 1 });
      }
      if (path.endsWith("/complete")) return jsonResponse(201, { id: "att2" } as EventAttachment);
      throw new Error(`unexpected path ${path}`);
    });

    const result = await uploadEventAttachmentInChunks("evt1", file);
    expect(result.id).toBe("att2");
    expect(chunkAttempts).toBe(2);
  });

  // 응답만 유실되면 서버는 이미 그 청크를 받은 상태다. expectedIndex를 무시하고
  // 같은 인덱스를 반복하면 409만 계속 받고 영영 못 끝낸다
  it("resyncs to the server position after a 409", async () => {
    const size = UPLOAD_CHUNK_SIZE_BYTES * 2;
    const file = new File([new Uint8Array(size)], "clip.mp4", { type: "video/mp4" });
    const chunkCalls: string[] = [];
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === "/api/attachments/uploads") return jsonResponse(201, { uploadId: "u3" });
      if (path === "/api/attachments/uploads/u3") {
        return jsonResponse(200, {
          receivedBytes: UPLOAD_CHUNK_SIZE_BYTES,
          nextChunkIndex: 1,
        });
      }
      if (path.includes("/chunks/")) {
        chunkCalls.push(path);
        if (path.endsWith("/chunks/0")) {
          return jsonResponse(409, { error: "out of order", expectedIndex: 1 });
        }
        return jsonResponse(200, {});
      }
      if (path.endsWith("/complete")) return jsonResponse(201, { id: "att3" } as EventAttachment);
      throw new Error(`unexpected path ${path}`);
    });

    const result = await uploadEventAttachmentInChunks("evt1", file);
    expect(result.id).toBe("att3");
    expect(chunkCalls).toEqual([
      "/api/attachments/uploads/u3/chunks/0",
      "/api/attachments/uploads/u3/chunks/1",
    ]);
  });

  it("retries complete after a network error", async () => {
    const file = new File([new Uint8Array(10)], "note.jpg", { type: "image/jpeg" });
    let completeAttempts = 0;
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === "/api/attachments/uploads") return jsonResponse(201, { uploadId: "u6" });
      if (path.includes("/chunks/")) return jsonResponse(200, { receivedBytes: 10, nextChunkIndex: 1 });
      if (path.endsWith("/complete")) {
        completeAttempts += 1;
        if (completeAttempts === 1) throw new TypeError("Failed to fetch");
        return jsonResponse(201, { id: "att6" } as EventAttachment);
      }
      throw new Error(`unexpected path ${path}`);
    });

    const result = await uploadEventAttachmentInChunks("evt1", file);
    expect(result.id).toBe("att6");
    expect(completeAttempts).toBe(2);
    expect(getPendingUploads()).toHaveLength(0);
  });

  it("drops the resume record when the session is gone", async () => {
    const file = new File([new Uint8Array(10)], "note.jpg", { type: "image/jpeg" });
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === "/api/attachments/uploads") return jsonResponse(201, { uploadId: "u4" });
      if (path.includes("/chunks/")) return jsonResponse(404, { error: "session gone" });
      throw new Error(`unexpected path ${path}`);
    });

    await expect(uploadEventAttachmentInChunks("evt1", file)).rejects.toMatchObject({ status: 404 });
    expect(getPendingUploads()).toHaveLength(0);
  });
});

describe("shouldUseChunkedUpload", () => {
  it("uses chunks for video and large files", async () => {
    const { shouldUseChunkedUpload } = await import("./chunkedUpload");
    expect(shouldUseChunkedUpload(new File(["x"], "a.mp4", { type: "video/mp4" }))).toBe(true);
    const big = new File([new Uint8Array(16 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    expect(shouldUseChunkedUpload(big)).toBe(true);
    expect(shouldUseChunkedUpload(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBe(false);
  });
});
