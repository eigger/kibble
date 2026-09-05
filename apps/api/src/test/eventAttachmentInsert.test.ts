import { describe, expect, it, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  attachment: {
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

describe("insertEventAttachment duplicate prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing attachment and avoids duplicate create if a recent duplicate exists", async () => {
    const existing = {
      id: "att_existing",
      eventId: "e1",
      path: "events/e1-existing.jpg",
      mime: "image/jpeg",
      size: 1234,
      width: 100,
      height: 100,
      posterPath: null,
      transcodeStatus: null,
      createdAt: new Date(),
    };

    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
      return cb(mockPrisma);
    });
    mockPrisma.$queryRaw.mockResolvedValue([{ id: "e1" }]);
    mockPrisma.attachment.findFirst.mockResolvedValue(existing);

    const { insertEventAttachment } = await import("../lib/eventAttachment.js");

    const result = await insertEventAttachment("e1", "hh1", {
      path: "events/e1-new.jpg",
      mime: "image/jpeg",
      size: 1234,
      width: 100,
      height: 100,
      posterPath: null,
    });

    expect(result).toEqual(existing);
    expect(mockPrisma.attachment.create).not.toHaveBeenCalled();
  });

  it("creates a new attachment if no recent duplicate exists", async () => {
    const created = {
      id: "att_new",
      eventId: "e1",
      path: "events/e1-new.jpg",
      mime: "image/jpeg",
      size: 1234,
      width: 100,
      height: 100,
      posterPath: null,
      transcodeStatus: null,
      createdAt: new Date(),
    };

    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
      return cb(mockPrisma);
    });
    mockPrisma.$queryRaw.mockResolvedValue([{ id: "e1" }]);
    mockPrisma.attachment.findFirst.mockResolvedValue(null);
    mockPrisma.attachment.count.mockResolvedValue(0);
    mockPrisma.attachment.create.mockResolvedValue(created);

    const { insertEventAttachment } = await import("../lib/eventAttachment.js");

    const result = await insertEventAttachment("e1", "hh1", {
      path: "events/e1-new.jpg",
      mime: "image/jpeg",
      size: 1234,
      width: 100,
      height: 100,
      posterPath: null,
    });

    expect(result).toEqual(created);
    expect(mockPrisma.attachment.create).toHaveBeenCalledOnce();
  });
});
