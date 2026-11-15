import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createEvent } from "./createEvent.js";

type Row = Record<string, unknown>;

type Course = {
  id: string;
  householdId: string;
  petId: string;
  startDate: Date;
  endDate: Date | null;
  continuesFromId: string | null;
  archivedAt: Date | null;
  dosesPerDay: number;
  doseTimes: string[];
};

type CourseWhere = {
  id?: string;
  continuesFromId?: string;
  householdId?: string;
  petId?: string;
  archivedAt?: null;
};

/**
 * 이어가기 연결을 따라 복약을 매길 처방을 고른다 (WORKLOG 2026-11-15).
 * - 뒤로: 이어가기 직후 전날 밤 복약을 늦게 기록하면 새 처방 1회차가 되어 첫날 기록이 2회차부터 찍혔다
 * - 앞으로: 시작일을 넘긴 루틴 스냅샷이 이전 처방 id로 보낸다
 */
function fakeDb(courses: Course[]) {
  const events: Row[] = [];
  const locks: string[] = [];
  const courseQueries: CourseWhere[] = [];
  const matches = (c: Course, where: CourseWhere) =>
    (where.id === undefined || c.id === where.id) &&
    (where.continuesFromId === undefined || c.continuesFromId === where.continuesFromId) &&
    (where.householdId === undefined || c.householdId === where.householdId) &&
    (where.petId === undefined || c.petId === where.petId) &&
    (where.archivedAt !== null || c.archivedAt == null);
  const tx = {
    $executeRaw: async (_s: TemplateStringsArray, key: string) => {
      locks.push(key.split(":").pop()!);
      return 0;
    },
    pet: { findFirst: async () => ({ id: "pet1" }) },
    eventType: { findFirst: async () => ({ id: "t", key: "medication", scaleType: null }) },
    medicationCourse: {
      findFirst: async ({ where }: { where: CourseWhere }) => {
        courseQueries.push(where);
        return (
          courses
            .filter((c) => matches(c, where))
            .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0] ?? null
        );
      },
    },
    product: { findFirst: async () => null },
    event: {
      findFirst: async () => null,
      findMany: async ({ where }: { where: { medicationCourseId: string } }) =>
        events.filter((e) => e.medicationCourseId === where.medicationCourseId),
      aggregate: async ({ where }: { where: { medicationCourseId: string } }) => {
        const rows = events.filter((e) => e.medicationCourseId === where.medicationCourseId);
        const ords = rows.map((e) => e.doseOrdinal as number);
        return {
          _max: { doseOrdinal: ords.length ? Math.max(...ords) : null },
          _count: { _all: rows.length },
        };
      },
      create: async ({ data }: { data: Row }) => {
        events.push(data);
        return { id: `e${events.length}`, ...data };
      },
    },
  };
  const db = { $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) };
  return { db: db as unknown as PrismaClient, events, locks, courseQueries };
}

const kst = (s: string) => new Date(`${s}+09:00`);
const base = { householdId: "h1", petId: "pet1" };

/** 하루 1회(21시), 10/22~10/31 */
const previous: Course = {
  ...base,
  id: "old",
  startDate: kst("2026-10-22T12:00:00"),
  endDate: kst("2026-10-31T12:00:00"),
  continuesFromId: null,
  archivedAt: null,
  dosesPerDay: 1,
  doseTimes: ["21:00"],
};
/** 하루 2회(9시·21시), 11/1부터 — previous에서 이어감 */
const next: Course = {
  ...base,
  id: "new",
  startDate: kst("2026-11-01T12:00:00"),
  endDate: null,
  continuesFromId: "old",
  archivedAt: null,
  dosesPerDay: 2,
  doseTimes: ["09:00", "21:00"],
};
/** 이어가기(오늘 시작)로 바로 보관된 이전 처방 */
const archivedPrevious: Course = { ...previous, archivedAt: kst("2026-11-01T13:58:00") };

const params = (occurredAt: Date, extra: Partial<{ medicationCourseId: string; doseSlotIndex: number }> = {}) => ({
  ...base,
  eventTypeId: "t",
  medicationCourseId: "new",
  occurredAt,
  source: "QUICK" as const,
  ...extra,
});

describe("createEvent — 이어가기 연결을 뒤로 따라간다", () => {
  it("records a dose dated before the new course's start on an archived previous course", async () => {
    const { db, events, locks } = fakeDb([archivedPrevious, next]);
    await createEvent(db, params(kst("2026-10-31T23:00:00")));
    expect(events[0]).toMatchObject({ medicationCourseId: "old", doseOrdinal: 1, doseSlotIndex: 0 });
    // 실제로 기록하는 처방 하나만 잠근다
    expect(locks).toEqual(["old"]);
  });

  it("re-picks the slot against the previous course instead of keeping the new course's index", async () => {
    const { db, events } = fakeDb([archivedPrevious, next]);
    // 새 처방의 저녁 슬롯(1)을 골랐지만 이전 처방은 슬롯이 하나뿐이다 — DOSE_SLOT_INVALID가 나면 안 된다
    await createEvent(db, params(kst("2026-10-31T23:00:00"), { doseSlotIndex: 1 }));
    expect(events[0]).toMatchObject({ medicationCourseId: "old", doseSlotIndex: 0 });
  });

  it("numbers the first dose on the start day as 1", async () => {
    const { db, events } = fakeDb([archivedPrevious, next]);
    await createEvent(db, params(kst("2026-10-31T23:00:00")));
    await createEvent(db, params(kst("2026-11-01T21:00:00"), { doseSlotIndex: 1 }));
    expect(events[1]).toMatchObject({ medicationCourseId: "new", doseOrdinal: 1, doseSlotIndex: 1 });
  });

  it("does not move a dose onto a previous course that had already ended before that day", async () => {
    // 오래전 처방에서 이어간 경우 — 공백 기간의 기록을 끝난 처방에 붙이지 않는다
    const { db, events } = fakeDb([{ ...previous, endDate: kst("2026-10-10T12:00:00") }, next]);
    await createEvent(db, params(kst("2026-10-31T23:00:00")));
    expect(events[0]).toMatchObject({ medicationCourseId: "new" });
  });

  it("keeps the requested course when it was not continued from another", async () => {
    const { db, events } = fakeDb([{ ...next, continuesFromId: null }]);
    await createEvent(db, params(kst("2026-10-31T23:00:00")));
    expect(events[0]).toMatchObject({ medicationCourseId: "new" });
  });

  it("scopes every course lookup to the household and pet (K-1)", async () => {
    const { db, courseQueries } = fakeDb([archivedPrevious, next]);
    await createEvent(db, params(kst("2026-10-31T23:00:00")));
    expect(courseQueries.length).toBeGreaterThan(0);
    for (const where of courseQueries) expect(where).toMatchObject(base);
  });

  it("does not follow a link into another household", async () => {
    const { db, events } = fakeDb([{ ...archivedPrevious, householdId: "h2" }, next]);
    await createEvent(db, params(kst("2026-10-31T23:00:00")));
    expect(events[0]).toMatchObject({ medicationCourseId: "new" });
  });
});

describe("createEvent — 이어가기 연결을 앞으로 따라간다", () => {
  it("moves a dose sent to an ended previous course onto the course that continued it", async () => {
    // 시작 전날 받아 둔 루틴 스냅샷이 시작일에 이전 처방 id로 보낸다
    const { db, events } = fakeDb([previous, next]);
    await createEvent(
      db,
      params(kst("2026-11-01T21:00:00"), { medicationCourseId: "old", doseSlotIndex: 0 }),
    );
    // 슬롯도 새 처방 기준으로 다시 고른다(21시 → 1)
    expect(events[0]).toMatchObject({ medicationCourseId: "new", doseOrdinal: 1, doseSlotIndex: 1 });
  });

  it("keeps a dose on the previous course while it is still running", async () => {
    const { db, events } = fakeDb([previous, next]);
    await createEvent(db, params(kst("2026-10-31T21:00:00"), { medicationCourseId: "old" }));
    expect(events[0]).toMatchObject({ medicationCourseId: "old" });
  });

  it("still rejects an archived course with no successor when it is requested directly", async () => {
    const { db } = fakeDb([archivedPrevious]);
    await expect(
      createEvent(db, params(kst("2026-10-31T23:00:00"), { medicationCourseId: "old" })),
    ).rejects.toThrow();
  });
});
