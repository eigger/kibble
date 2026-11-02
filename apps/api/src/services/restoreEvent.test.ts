import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { CreateEventDoseConflictError, CreateEventNotFoundError } from "./createEvent.js";
import { restoreEvent } from "./restoreEvent.js";

type Opts = {
  deleted?: Record<string, unknown> | null;
  course?: Record<string, unknown> | null;
  others?: { doseSlotIndex: number | null }[];
  /** 같은 번호를 가진 살아 있는 기록 수 */
  ordinalClash?: number;
  numbering?: { max: number | null; count: number };
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
  const update = vi.fn(async () => ({ count: 1 }));
  const lock = vi.fn(async () => 0);
  const tx = {
    $executeRaw: lock,
    event: {
      findFirst: vi.fn(async () => deleted),
      // 삭제된 행 조회와 복원 후 재조회가 같은 mock을 쓴다(반환 행의 id만 본다)
      findMany: vi.fn(async () => opts.others ?? []),
      count: vi.fn(async () => opts.ordinalClash ?? 0),
      aggregate: vi.fn(async () => ({
        _max: { doseOrdinal: opts.numbering?.max ?? null },
        _count: { _all: opts.numbering?.count ?? 0 },
      })),
      updateMany: update,
    },
    medicationCourse: {
      findFirst: vi.fn(async () =>
        opts.course === undefined ? { id: "c1", dosesPerDay: 2, doseTimes: ["08:00", "19:00"] } : opts.course,
      ),
    },
  };
  const db = { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) };
  return {
    db: db as unknown as PrismaClient,
    update,
    lock,
    findMany: tx.event.findMany,
    count: tx.event.count,
    aggregate: tx.event.aggregate,
  };
}

const params = { householdId: "h1", eventId: "e1" };

describe("restoreEvent", () => {
  it("restores a non-medication event without locking or slot checks", async () => {
    const { db, update, lock } = fakeDb({
      deleted: { id: "e1", petId: "pet1", occurredAt: new Date(), medicationCourseId: null, doseSlotIndex: null },
    });
    const restored = await restoreEvent(db, params);
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e1", householdId: "h1", deletedAt: { not: null } },
        data: { deletedAt: null },
      }),
    );
    expect(restored).toMatchObject({ id: "e1" });
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

  it("scopes the same-day lookup to this household, pet, course and KST day", async () => {
    const { db, findMany } = fakeDb({ others: [] });
    await restoreEvent(db, params);
    const where = (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    // 2026-10-07T01:00Z = KST 10:00 → KST 10/07 00:00 = 10/06 15:00Z부터 24시간
    const start = new Date("2026-10-06T15:00:00Z");
    expect(where).toMatchObject({
      householdId: "h1",
      petId: "pet1",
      medicationCourseId: "c1",
      deletedAt: null,
      id: { not: "e1" },
      occurredAt: { gte: start, lt: new Date(start.getTime() + 86_400_000) },
    });
  });

  it("restores a slot-less row into a slotted course while a free slot remains", async () => {
    const { db, update } = fakeDb({
      deleted: {
        id: "e1",
        petId: "pet1",
        occurredAt: new Date("2026-10-07T01:00:00Z"),
        medicationCourseId: "c1",
        doseSlotIndex: null,
      },
      others: [{ doseSlotIndex: 0 }, { doseSlotIndex: null }],
    });
    await restoreEvent(db, params);
    expect(update).toHaveBeenCalledOnce();
  });

  it("rejects a slot-less row when every slot is already filled", async () => {
    const { db, update } = fakeDb({
      deleted: {
        id: "e1",
        petId: "pet1",
        occurredAt: new Date("2026-10-07T01:00:00Z"),
        medicationCourseId: "c1",
        doseSlotIndex: null,
      },
      others: [{ doseSlotIndex: 0 }, { doseSlotIndex: 1 }],
    });
    await expect(restoreEvent(db, params)).rejects.toMatchObject({ message: "DOSE_LIMIT_REACHED" });
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

  describe("doseOrdinal on restore", () => {
    const withOrdinal = (doseOrdinal: number | null) => ({
      id: "e1",
      petId: "pet1",
      occurredAt: new Date("2026-10-07T01:00:00Z"),
      medicationCourseId: "c1",
      doseSlotIndex: 0,
      doseOrdinal,
    });

    it("keeps the original number when no live dose shares it (R126)", async () => {
      const { db, update, count } = fakeDb({ deleted: withOrdinal(4), ordinalClash: 0 });
      await restoreEvent(db, params);
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { deletedAt: null } }));
      expect(count).toHaveBeenCalledOnce();
    });

    it("takes the next number when a live dose already uses it", async () => {
      const { db, update, aggregate } = fakeDb({
        deleted: withOrdinal(4),
        ordinalClash: 1,
        numbering: { max: 4, count: 4 },
      });
      await restoreEvent(db, params);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { deletedAt: null, doseOrdinal: 5 } }),
      );
      expect(aggregate).toHaveBeenCalledOnce();
    });

    it("leaves unnumbered legacy rows alone", async () => {
      const { db, update, count, aggregate } = fakeDb({ deleted: withOrdinal(null) });
      await restoreEvent(db, params);
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { deletedAt: null } }));
      expect(count).not.toHaveBeenCalled();
      expect(aggregate).not.toHaveBeenCalled();
    });

    it("scopes the clash lookup and the renumbering to household and course, live rows only", async () => {
      const { db, count, aggregate } = fakeDb({
        deleted: withOrdinal(4),
        ordinalClash: 1,
        numbering: { max: 4, count: 4 },
      });
      await restoreEvent(db, params);
      const live = { householdId: "h1", medicationCourseId: "c1", deletedAt: null };
      expect(count).toHaveBeenCalledWith({ where: { ...live, doseOrdinal: 4 } });
      expect(aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: live }));
    });
  });

  it("is not found when nothing deleted matches", async () => {
    const { db } = fakeDb({ deleted: null });
    await expect(restoreEvent(db, params)).rejects.toBeInstanceOf(CreateEventNotFoundError);
  });
});
