import { describe, expect, it, vi, beforeEach } from "vitest";
import { purgeOldTrash, trashPurgeThreshold, TRASH_RETENTION_DAYS } from "./trashPurge.js";

const mockPrisma = vi.hoisted(() => ({
  event: {
    findMany: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../lib/uploads.js", () => ({
  deleteUploadedFile: vi.fn().mockResolvedValue(undefined),
}));

import { deleteUploadedFile } from "../lib/uploads.js";

describe("trashPurge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes threshold from retention days", () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const threshold = trashPurgeThreshold(now, TRASH_RETENTION_DAYS);
    expect(threshold.toISOString()).toBe("2026-08-02T12:00:00.000Z");
  });

  it("hard-deletes stale events and attachment files", async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: "evt1",
        attachments: [{ path: "events/a.jpg" }, { path: "events/b.jpg" }],
      },
    ]);
    mockPrisma.event.delete.mockResolvedValue({ id: "evt1" });

    const purged = await purgeOldTrash(new Date("2026-09-01T12:00:00.000Z"));

    expect(purged).toBe(1);
    expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: {
            not: null,
            lte: new Date("2026-08-02T12:00:00.000Z"),
          },
        },
      }),
    );
    expect(deleteUploadedFile).toHaveBeenCalledTimes(2);
    expect(deleteUploadedFile).toHaveBeenCalledWith("events/a.jpg");
    expect(mockPrisma.event.delete).toHaveBeenCalledWith({ where: { id: "evt1" } });
  });

  it("returns 0 when nothing is stale", async () => {
    mockPrisma.event.findMany.mockResolvedValue([]);
    await expect(purgeOldTrash()).resolves.toBe(0);
    expect(mockPrisma.event.delete).not.toHaveBeenCalled();
  });
});
