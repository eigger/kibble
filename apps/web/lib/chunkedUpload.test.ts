import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UPLOAD_CHUNK_SIZE_BYTES } from "@kibble/shared";
import { uploadEventAttachmentInChunks } from "./chunkedUpload";
import { ApiError } from "./api";
import { savePendingUpload } from "./pendingUploads";
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
