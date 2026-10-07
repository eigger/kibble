import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { CreateEventDoseConflictError, CreateEventNotFoundError } from "./createEvent.js";
import { restoreEvent } from "./restoreEvent.js";

type Opts = {
  deleted?: Record<string, unknown> | null;
  course?: Record<string, unknown> | null;
  others?: { doseSlotIndex: number | null }[];
};

function fakeDb(opts: Opts) {
  const deleted = opts.deleted === undefined
    ? {
        id: "e1",
        petId: "pet1",
        occurredAt: new Date("2026-10-07T01:00:00Z"),
        medicationCourseId: "c1",
        doseSlotIndex: 0,
      }
    : opts.deleted;
  const update = vi.fn(async () => ({ id: "e1", deletedAt: null }));
  const lock = vi.fn(async () => 0);
  const tx = {
    $executeRaw: lock,
    event: {
      findFirst: vi.fn(async () => deleted),
      findMany: vi.fn(async () => opts.others ?? []),
      update,
    },
    medicationCourse: {
      findFirst: vi.fn(async () =>
        opts.course === undefined ? { id: "c1", dosesPerDay: 2, doseTimes: ["08:00", "19:00"] } : opts.course,
      ),
    },
  };
  const db = { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) };
  return { db: db as unknown as PrismaClient, update, lock };
}

const params = { householdId: "h1", eventId: "e1" };

describe("restoreEvent", () => {
  it("restores a non-medication event without locking or slot checks", async () => {
    const { db, update, lock } = fakeDb({
      deleted: { id: "e1", petId: "pet1", occurredAt: new Date(), medicationCourseId: null, doseSlotIndex: null },
    });
    await restoreEvent(db, params);
    expect(update).toHaveBeenCalledOnce();
    expect(lock).not.toHaveBeenCalled();
  });

  it("rejects when the same slot was recorded again after deletion (409 meaning)", async () => {
    const { db, update, lock } = fakeDb({ others: [{ doseSlotIndex: 0 }] });
    await expect(restoreEvent(db, params)).rejects.toMatchObject({
      name: CreateEventDoseConflictError.name,
      message: "DOSE_SLOT_TAKEN",
    });
    expect(lock).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });

  it("restores into a different free slot", async () => {
    const { db, update } = fakeDb({ others: [{ doseSlotIndex: 1 }] });
    await restoreEvent(db, params);
    expect(update).toHaveBeenCalledOnce();
  });

  it("enforces the daily limit for courses without time slots", async () => {
    const { db, update } = fakeDb({
      deleted: {
        id: "e1",
        petId: "pet1",
        occurredAt: new Date(),
        medicationCourseId: "c1",
        doseSlotIndex: null,
      },
      course: { id: "c1", dosesPerDay: 1, doseTimes: [] },
      others: [{ doseSlotIndex: null }],
    });
    await expect(restoreEvent(db, params)).rejects.toMatchObject({ message: "DOSE_LIMIT_REACHED" });
    expect(update).not.toHaveBeenCalled();
  });

  it("is not found when nothing deleted matches", async () => {
    const { db } = fakeDb({ deleted: null });
    await expect(restoreEvent(db, params)).rejects.toBeInstanceOf(CreateEventNotFoundError);
  });
});
