import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createEvent } from "./createEvent.js";

type Row = Record<string, unknown>;

type Course = {
  id: string;
  startDate: Date;
  continuesFromId: string | null;
  archivedAt: Date | null;
  dosesPerDay: number;
  doseTimes: string[];
};

/**
 * 이어가기로 만든 처방에 시작일 전 시각의 복약을 기록하면 이전 처방으로 간다 (WORKLOG 2026-11-15).
 * 이어가기 직후 전날 밤 복약을 늦게 기록하면 새 처방 1회차가 되어 첫날 기록이 2회차부터 찍혔다.
 */
function fakeDb(courses: Course[]) {
  const events: Row[] = [];
  const locks: string[] = [];
  const tx = {
    $executeRaw: async (_s: TemplateStringsArray, key: string) => {
      locks.push(key);
      return 0;
    },
    pet: { findFirst: async () => ({ id: "pet1" }) },
    eventType: { findFirst: async () => ({ id: "t", key: "medication", scaleType: null }) },
    medicationCourse: {
      findFirst: async ({ where }: { where: { id: string; archivedAt?: null } }) => {
        const course = courses.find((c) => c.id === where.id);
        if (!course) return null;
        if (where.archivedAt === null && course.archivedAt) return null;
        return course;
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
  return { db: db as unknown as PrismaClient, events, locks };
}

const kst = (s: string) => new Date(`${s}+09:00`);

const previous: Course = {
  id: "old",
  startDate: kst("2026-10-22T12:00:00"),
  continuesFromId: null,
  archivedAt: kst("2026-11-01T13:58:00"), // 이어가기(오늘 시작)로 바로 보관됐다
  dosesPerDay: 1,
  doseTimes: [],
};
const next: Course = {
  id: "new",
  startDate: kst("2026-11-01T12:00:00"),
  continuesFromId: "old",
  archivedAt: null,
  dosesPerDay: 2,
  doseTimes: ["09:00", "21:00"],
};

const params = (occurredAt: Date) => ({
  householdId: "h1",
  petId: "pet1",
  eventTypeId: "t",
  medicationCourseId: "new",
  occurredAt,
  source: "QUICK" as const,
});

describe("createEvent — 이어가기 전 시각의 복약", () => {
  it("records a dose dated before the new course's start on the course it continues", async () => {
    const { db, events, locks } = fakeDb([previous, next]);
    await createEvent(db, params(kst("2026-10-31T23:00:00")));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ medicationCourseId: "old", doseOrdinal: 1 });
    // 두 처방 모두 잠근다 — 새 처방 먼저
    expect(locks.map((k) => k.split(":").pop())).toEqual(["new", "old"]);
  });

  it("numbers the first dose on the start day as 1", async () => {
    const { db, events } = fakeDb([previous, next]);
    await createEvent(db, params(kst("2026-10-31T23:00:00")));
    await createEvent(db, params(kst("2026-11-01T21:00:00")));
    expect(events[1]).toMatchObject({ medicationCourseId: "new", doseOrdinal: 1 });
  });

  it("keeps the requested course when it was not continued from another", async () => {
    const { db, events } = fakeDb([{ ...next, continuesFromId: null }]);
    await createEvent(db, params(kst("2026-10-31T23:00:00")));
    expect(events[0]).toMatchObject({ medicationCourseId: "new" });
  });

  it("still rejects an archived course when it is requested directly", async () => {
    const { db } = fakeDb([previous, next]);
    await expect(
      createEvent(db, { ...params(kst("2026-10-31T23:00:00")), medicationCourseId: "old" }),
    ).rejects.toThrow();
  });
});
