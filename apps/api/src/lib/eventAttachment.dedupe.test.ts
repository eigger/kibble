import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  attachment: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
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

  it("inherits mime, size, dimensions and .mp4 name from an already-transcoded source", async () => {
    const bytes = Buffer.from("transcoded-mp4-bytes");
    const existingRel = await seedExisting(bytes);
    mockPrisma.attachment.findFirst.mockResolvedValue({
      path: existingRel,
      mime: "video/mp4",
      size: bytes.length,
      width: 1280,
      height: 720,
      transcodeStatus: "ready",
    });

    const { finalizeEventAttachmentFromTemp } = await import("./eventAttachment.js");
    const tempPath = path.join(uploadDir, "tmp", "orig.part");
    await mkdir(path.dirname(tempPath), { recursive: true });
    await writeFile(tempPath, Buffer.from("original-mov-bytes"));

    const saved = await finalizeEventAttachmentFromTemp("evt6", tempPath, "video/quicktime", "hh1");

    expect(saved.path.endsWith(".mp4")).toBe(true);
    expect(saved.mime).toBe("video/mp4");
    expect(saved.size).toBe(bytes.length);
    expect(saved.width).toBe(1280);
    expect(saved.height).toBe(720);
    expect(saved.transcodeStatus).toBe("ready");
  });

  it("keeps the upload mime and PENDING when the linked source is still the original", async () => {
    const bytes = Buffer.from("untranscoded-mov-bytes");
    const existingRel = await seedExisting(bytes);
    mockPrisma.attachment.findFirst.mockResolvedValue({
      path: existingRel,
      mime: "video/quicktime",
      size: bytes.length,
      width: null,
      height: null,
      transcodeStatus: "pending",
    });

    const { finalizeEventAttachmentFromTemp } = await import("./eventAttachment.js");
    const tempPath = path.join(uploadDir, "tmp", "orig2.part");
    await mkdir(path.dirname(tempPath), { recursive: true });
    await writeFile(tempPath, bytes);

    const saved = await finalizeEventAttachmentFromTemp("evt7", tempPath, "video/quicktime", "hh1");
    expect(saved.path.endsWith(".mov")).toBe(true);
    expect(saved.mime).toBe("video/quicktime");
    expect(saved.transcodeStatus).toBe("pending");
  });

  it("matches the 120s duplicate by contentHash, and by mime/size/dims for legacy rows", async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        $queryRaw: vi.fn().mockResolvedValue([{ id: "evt8" }]),
        attachment: mockPrisma.attachment,
      }),
    );
    mockPrisma.attachment.findFirst.mockResolvedValue({ id: "a1" });
    const { insertEventAttachment } = await import("./eventAttachment.js");

    await insertEventAttachment("evt8", "hh1", {
      path: "events/x.mov",
      mime: "video/quicktime",
      size: 10,
      contentHash: "h".repeat(64),
      width: null,
      height: null,
    });
    const hashed = mockPrisma.attachment.findFirst.mock.calls.at(-1)?.[0].where;
    expect(hashed.contentHash).toBe("h".repeat(64));
    expect(hashed.mime).toBeUndefined();

    await insertEventAttachment("evt8", "hh1", {
      path: "events/y.jpg",
      mime: "image/jpeg",
      size: 5,
      width: 2,
      height: 3,
    });
    const legacy = mockPrisma.attachment.findFirst.mock.calls.at(-1)?.[0].where;
    expect(legacy.contentHash).toBeUndefined();
    expect(legacy).toMatchObject({ mime: "image/jpeg", size: 5, width: 2, height: 3 });
  });
});
