import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());
vi.mock("./push.js", () => ({ sendPushToHousehold: sendMock }));
vi.mock("./prisma.js", () => ({ prisma: {} }));

const { isReminderSlotEligible, processMedicationReminderPushes, pushCopy, reminderCourseWindow } = await import(
  "./medicationReminderPush.js"
);

describe("pushCopy", () => {
  it("formats lead push notification in Korean", () => {
    const copy = pushCopy("lead", "ko", "초코", "항생제", "09:00");
    expect(copy.title).toBe("복약 시간이 다가왔어요");
    expect(copy.body).toContain("초코 · 항생제 ·");
  });

  it("formats lead push notification in English", () => {
    const copy = pushCopy("lead", "en", "Choco", "Antibiotics", "09:00");
    expect(copy.title).toBe("Medication soon");
    expect(copy.body).toContain("Choco · Antibiotics ·");
  });

  it("formats overdue push notification in Korean", () => {
    const copy = pushCopy("overdue", "ko", "초코", "심장사상충", "20:00");
    expect(copy.title).toBe("복약 기록이 없어요");
    expect(copy.body).toContain("초코 · 심장사상충 ·");
  });

  it("formats overdue push notification in English", () => {
    const copy = pushCopy("overdue", "en", "Choco", "Heartworm", "20:00");
    expect(copy.title).toBe("Medication overdue");
    expect(copy.body).toContain("Choco · Heartworm ·");
  });
});

describe("isReminderSlotEligible", () => {
  it("skips slots earlier than the course was created", () => {
    const course = { createdAt: new Date("2026-09-01T14:00:00+09:00") };
    expect(isReminderSlotEligible(course, new Date("2026-09-01T08:00:00+09:00"))).toBe(false);
    expect(isReminderSlotEligible(course, new Date("2026-09-01T19:00:00+09:00"))).toBe(true);
  });
});

describe("processMedicationReminderPushes", () => {
  const now = new Date("2026-09-01T20:30:00+09:00");

  function fakeDb(courseOverrides: Record<string, unknown> = {}) {
    const course = {
      id: "c1",
      name: "항생제",
      dosesPerDay: 1,
      doseTimes: ["20:00"],
      createdAt: new Date("2026-08-01T00:00:00+09:00"),
      pet: { name: "초코" },
      ...courseOverrides,
    };
    const findMany = vi.fn(async () => [course]);
    const db = {
      setting: {
        findMany: vi.fn(async () => [
          {
            key: "household:h1:medicationReminder",
            value: JSON.stringify({ enabled: true, leadMinutes: 5, overdueMinutes: 10 }),
          },
        ]),
      },
      medicationCourse: { findMany },
      event: { findMany: vi.fn(async () => []) },
      medicationPushSent: {
        findMany: vi.fn(async () => []),
        create: vi.fn(async () => ({})),
      },
      pet: {},
    };
    return { db: db as never, findMany };
  }

  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue(1);
  });

  it("queries only started courses of active pets", async () => {
    const { db, findMany } = fakeDb();
    await processMedicationReminderPushes(db, now);
    const where = (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    const { startBefore, endNotBefore } = reminderCourseWindow(now);
    expect(where.startDate).toEqual({ lt: startBefore });
    expect(where.OR).toEqual([{ endDate: null }, { endDate: { gte: endNotBefore } }]);
    expect(where.pet).toEqual({ archivedAt: null });
    expect(where.archivedAt).toBeNull();
  });

  it("does not remind a slot that predates the course's creation", async () => {
    const { db } = fakeDb({ createdAt: new Date("2026-09-01T20:20:00+09:00") });
    await processMedicationReminderPushes(db, now);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("builds the copy per subscription locale", async () => {
    const { db } = fakeDb();
    await processMedicationReminderPushes(db, now);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const build = sendMock.mock.calls[0][1] as (l: "ko" | "en") => { title: string; url: string };
    expect(build("ko").title).toBe("복약 기록이 없어요");
    expect(build("en").title).toBe("Medication overdue");
    expect(build("en").url).toBe("/care");
  });
});

describe("reminderCourseWindow (처방 시작·종료일은 KST 정오로 저장된다)", () => {
  const includes = (course: { startDate: string; endDate?: string }, now: string) => {
    const { startBefore, endNotBefore } = reminderCourseWindow(new Date(now));
    const start = new Date(course.startDate);
    const end = course.endDate ? new Date(course.endDate) : null;
    return start < startBefore && (!end || end >= endNotBefore);
  };
  const started = { startDate: "2026-09-02T12:00:00+09:00" };

  it("includes a course on its start day before noon (morning slot)", () => {
    expect(includes(started, "2026-09-02T07:55:00+09:00")).toBe(true);
    expect(includes(started, "2026-09-02T08:10:00+09:00")).toBe(true);
    expect(includes(started, "2026-09-02T00:00:00+09:00")).toBe(true);
  });

  it("excludes the day before the start day", () => {
    expect(includes(started, "2026-09-01T23:59:00+09:00")).toBe(false);
  });

  it("keeps the whole end day (late slots) and drops the day after", () => {
    const ending = { ...started, endDate: "2026-09-05T12:00:00+09:00" };
    expect(includes(ending, "2026-09-05T00:00:00+09:00")).toBe(true);
    expect(includes(ending, "2026-09-05T23:30:00+09:00")).toBe(true);
    expect(includes(ending, "2026-09-06T00:00:00+09:00")).toBe(false);
  });
});

describe("start-day morning reminder with the creation guard", () => {
  it("still sends when the course was created the night before", async () => {
    const now = new Date("2026-09-02T08:10:00+09:00");
    const course = {
      id: "c1",
      name: "항생제",
      dosesPerDay: 2,
      doseTimes: ["08:00", "20:00"],
      startDate: new Date("2026-09-02T12:00:00+09:00"),
      createdAt: new Date("2026-09-01T22:00:00+09:00"),
      pet: { name: "초코" },
    };
    const db = {
      setting: {
        findMany: vi.fn(async () => [
          {
            key: "household:h1:medicationReminder",
            value: JSON.stringify({ enabled: true, leadMinutes: 5, overdueMinutes: 10 }),
          },
        ]),
      },
      // DB 조회 조건은 위 테스트가 본다 — 여기서는 조회된 처방이 슬롯 판정을 통과하는지 본다
      medicationCourse: { findMany: vi.fn(async () => [course]) },
      event: { findMany: vi.fn(async () => []) },
      medicationPushSent: { findMany: vi.fn(async () => []), create: vi.fn(async () => ({})) },
      pet: {},
    };
    sendMock.mockReset();
    sendMock.mockResolvedValue(1);
    await processMedicationReminderPushes(db as never, now);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
