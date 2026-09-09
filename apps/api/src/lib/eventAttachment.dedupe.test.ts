import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  attachment: { findFirst: vi.fn() },
}));

vi.mock("./prisma.js", () => ({ prisma: mockPrisma }));

/**
 * 같은 191MB 영상이 아홉 번 올라와 1.7GB를 먹었던 회귀를 막는다. 바이트가 같으면
 * 새로 쓰지 않고 하드링크로 잇는다 — 이름은 둘, 블록은 하나다.
 */
describe("attachment content dedupe", () => {
  let uploadDir = "";

  beforeEach(async () => {
    uploadDir = await mkdtemp(path.join(tmpdir(), "kibble-dedupe-"));
    process.env.UPLOAD_DIR = uploadDir;
    mockPrisma.attachment.findFirst.mockReset();
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.UPLOAD_DIR;
    vi.resetModules();
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
  });

  async function seedExisting(bytes: Buffer): Promise<string> {
    const rel = "events/existing-clip.mp4";
    await mkdir(path.join(uploadDir, "events"), { recursive: true });
    await writeFile(path.join(uploadDir, rel), bytes);
    return rel;
  }

  it("hard-links a duplicate video instead of storing it twice", async () => {
    const bytes = Buffer.from("the-very-same-video-bytes");
    const existingRel = await seedExisting(bytes);
    mockPrisma.attachment.findFirst.mockResolvedValue({ path: existingRel });

    const { finalizeEventAttachmentFromTemp } = await import("./eventAttachment.js");
    const tempPath = path.join(uploadDir, "tmp", "clip.part");
    await mkdir(path.dirname(tempPath), { recursive: true });
    await writeFile(tempPath, bytes);

    const saved = await finalizeEventAttachmentFromTemp("evt2", tempPath, "video/mp4", "hh1");

    expect(saved.path).not.toBe(existingRel);
    expect(saved.size).toBe(bytes.length);

    const existingStat = await stat(path.join(uploadDir, existingRel));
    const savedStat = await stat(path.join(uploadDir, saved.path));
    expect(savedStat.ino).toBe(existingStat.ino);
    expect(savedStat.nlink).toBe(2);

    // 조각은 남기지 않는다 — tmp가 첨부보다 커지던 경로다
    await expect(stat(tempPath)).rejects.toThrow();
  });

  it("scopes the lookup to the household through the event (K-1)", async () => {
    mockPrisma.attachment.findFirst.mockResolvedValue(null);

    const { finalizeEventAttachmentFromTemp } = await import("./eventAttachment.js");
    const tempPath = path.join(uploadDir, "tmp", "clip.part");
    await mkdir(path.dirname(tempPath), { recursive: true });
    await writeFile(tempPath, Buffer.from("unique-bytes"));

    const saved = await finalizeEventAttachmentFromTemp("evt3", tempPath, "video/mp4", "hh1");

    const where = mockPrisma.attachment.findFirst.mock.calls[0][0].where;
    expect(where.event.householdId).toBe("hh1");
    expect(where.event.deletedAt).toBeNull();
    expect(where.contentHash).toBe(saved.contentHash);

    // 짝이 없으면 평소대로 옮겨 쓴다
    expect(await readFile(path.join(uploadDir, saved.path))).toEqual(Buffer.from("unique-bytes"));
  });

  it("falls back to a normal write when the linked source is gone", async () => {
    mockPrisma.attachment.findFirst.mockResolvedValue({ path: "events/vanished.mp4" });

    const { finalizeEventAttachmentFromTemp } = await import("./eventAttachment.js");
    const tempPath = path.join(uploadDir, "tmp", "clip.part");
    await mkdir(path.dirname(tempPath), { recursive: true });
    await writeFile(tempPath, Buffer.from("orphan-source"));

    const saved = await finalizeEventAttachmentFromTemp("evt4", tempPath, "video/mp4", "hh1");
    expect(await readFile(path.join(uploadDir, saved.path))).toEqual(Buffer.from("orphan-source"));
  });

  it("hashes photos too so the same picture is stored once", async () => {
    mockPrisma.attachment.findFirst.mockResolvedValue(null);
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();

    const { saveEventAttachment } = await import("./eventAttachment.js");
    const saved = await saveEventAttachment("evt5", jpeg, "image/jpeg", "hh1");
    expect(saved.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
