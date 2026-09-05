import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("finalizeEventAttachmentFromTemp", () => {
  let uploadDir = "";

  beforeEach(async () => {
    uploadDir = await mkdtemp(path.join(tmpdir(), "kibble-chunk-"));
    process.env.UPLOAD_DIR = uploadDir;
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.UPLOAD_DIR;
    vi.resetModules();
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
  });

  it("moves video temp file without re-encoding", async () => {
    const { finalizeEventAttachmentFromTemp } = await import("./eventAttachment.js");
    const tempPath = path.join(uploadDir, "tmp", "clip.part");
    await mkdir(path.dirname(tempPath), { recursive: true });
    await writeFile(tempPath, Buffer.from("fake-video"));

    const saved = await finalizeEventAttachmentFromTemp("evt1", tempPath, "video/mp4");
    expect(saved.mime).toBe("video/mp4");
    expect(saved.size).toBe(10);
    expect(saved.transcodeStatus).toBe("pending");
    const abs = path.join(uploadDir, saved.path);
    expect(await readFile(abs)).toEqual(Buffer.from("fake-video"));
  });
});
