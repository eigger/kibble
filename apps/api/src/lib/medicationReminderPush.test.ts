import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());
vi.mock("./push.js", () => ({ sendPushToHousehold: sendMock }));
vi.mock("./prisma.js", () => ({ prisma: {} }));

const { isReminderSlotEligible, processMedicationReminderPushes, pushCopy } = await import(
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
    expect(where.startDate).toEqual({ lte: now });
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
