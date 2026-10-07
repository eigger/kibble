import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { applyEventUpdate } from "./updateEvent.js";

type Opts = {
  current?: Record<string, unknown> | null;
  course?: Record<string, unknown> | null;
  others?: { doseSlotIndex: number | null }[];
};

const base = {
  petId: "pet1",
  occurredAt: new Date("2026-10-07T23:30:00Z"), // KST 10/08 08:30
  medicationCourseId: "c1" as string | null,
  doseSlotIndex: 0 as number | null,
};

function fakeDb(opts: Opts = {}) {
  const current = opts.current === undefined ? base : opts.current;
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const lock = vi.fn(async () => 0);
  const tx = {
    $executeRaw: lock,
    event: {
      findFirst: vi.fn(async () => current),
      findMany: vi.fn(async () => opts.others ?? []),
      updateMany,
    },
    medicationCourse: {
      findFirst: vi.fn(async () =>
        opts.course === undefined ? { id: "c1", dosesPerDay: 2, doseTimes: ["08:00", "19:00"] } : opts.course,
      ),
    },
  };
  const db = { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) };
  return { db: db as unknown as PrismaClient, updateMany, lock, findMany: tx.event.findMany };
}

const params = (occurredAt?: Date) => ({
  householdId: "h1",
  eventId: "e1",
  data: occurredAt ? { occurredAt, note: "x" } : { note: "x" },
});
const yesterday = new Date("2026-10-06T23:30:00Z"); // KST 10/07 08:30

describe("applyEventUpdate", () => {
  it("plain update when the date is not touched", async () => {
    const { db, updateMany, lock } = fakeDb();
    expect(await applyEventUpdate(db, params())).toBe(1);
    expect(updateMany).toHaveBeenCalledOnce();
    expect(lock).not.toHaveBeenCalled();
  });

  it("does not check a non-prescription event moved to another day", async () => {
    const { db, updateMany, lock } = fakeDb({ current: { ...base, medicationCourseId: null, doseSlotIndex: null } });
    await applyEventUpdate(db, params(yesterday));
    expect(updateMany).toHaveBeenCalledOnce();
    expect(lock).not.toHaveBeenCalled();
  });

  it("does not check a time change within the same KST day", async () => {
    const { db, updateMany, lock } = fakeDb();
    await applyEventUpdate(db, params(new Date("2026-10-08T05:00:00Z"))); // KST 10/08 14:00
    expect(updateMany).toHaveBeenCalledOnce();
    expect(lock).not.toHaveBeenCalled();
  });

  it("rejects moving a dose onto a day whose slot is already taken (409 meaning)", async () => {
    const { db, updateMany, lock } = fakeDb({ others: [{ doseSlotIndex: 0 }] });
    await expect(applyEventUpdate(db, params(yesterday))).rejects.toMatchObject({
      message: "DOSE_SLOT_TAKEN",
    });
    expect(lock).toHaveBeenCalledOnce();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("moves the dose when the target day's slot is free, keeping its slot", async () => {
    const { db, updateMany } = fakeDb({ others: [{ doseSlotIndex: 1 }] });
    await applyEventUpdate(db, params(yesterday));
    expect(updateMany).toHaveBeenCalledOnce();
    const arg = (updateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0];
    expect(arg.data.doseSlotIndex).toBeUndefined();
  });

  it("scopes the target-day lookup to household, pet, course, live rows, excluding itself", async () => {
    const { db, findMany } = fakeDb();
    await applyEventUpdate(db, params(yesterday));
    const where = (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    const start = new Date("2026-10-06T15:00:00Z"); // KST 10/07 00:00
    expect(where).toMatchObject({
      householdId: "h1",
      petId: "pet1",
      medicationCourseId: "c1",
      deletedAt: null,
      id: { not: "e1" },
      occurredAt: { gte: start, lt: new Date(start.getTime() + 86_400_000) },
    });
  });

  it("is a no-op count of 0 when the event does not exist", async () => {
    const { db } = fakeDb({ current: null });
    // 존재하지 않으면 plain update가 0행을 돌려준다 (라우트가 404)
    const zero = vi.fn(async () => ({ count: 0 }));
    (db as unknown as { event: { updateMany: typeof zero } }).event.updateMany = zero;
    expect(await applyEventUpdate(db, params(yesterday))).toBe(0);
  });
});
