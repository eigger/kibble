import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";

const HH = "household_a";
const USER = "user_a";
const PET = "pet_1";
const MED_TYPE = "event_type_medication";
const COURSE = "course_1";

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  pet: { findFirst: vi.fn() },
  eventType: { findFirst: vi.fn() },
  medicationCourse: { findFirst: vi.fn() },
  event: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

function jwt(app: FastifyInstance): string {
  return app.jwt.sign({ sub: USER, role: "ADMIN", tv: 1 }, { expiresIn: "1h" });
}

describe("복약 기록 — 입력 시각 · 슬롯 자동 선택 · 중복 거절 (WORKPLAN §3.10, §7.24)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateHouseholdCache(USER);
    invalidateTokenVersionCache(USER);

    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH, role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
    mockPrisma.pet.findFirst.mockResolvedValue({ id: PET });
    mockPrisma.eventType.findFirst.mockResolvedValue({ id: MED_TYPE, scaleType: null });
    mockPrisma.event.aggregate.mockResolvedValue({ _max: { doseOrdinal: null }, _count: { _all: 0 } });
    mockPrisma.event.create.mockResolvedValue({ id: "event_1" });
    mockPrisma.event.findFirst.mockResolvedValue({ id: "event_1" });

    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  function post(payload: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: "/api/events",
      headers: { authorization: `Bearer ${jwt(app)}` },
      payload: { petId: PET, eventTypeId: MED_TYPE, medicationCourseId: COURSE, ...payload },
    });
  }

  it("슬롯을 고르지 않으면 비어 있는 슬롯 중 가장 가까운 것을 채우고, 시각은 입력 시각 그대로다", async () => {
    mockPrisma.medicationCourse.findFirst.mockResolvedValue({
      id: COURSE,
      dosesPerDay: 2,
      doseTimes: ["08:00", "19:00"],
    });
    mockPrisma.event.findMany.mockResolvedValue([]);
    const at = "2026-09-01T11:30:00.000Z";

    const res = await post({ occurredAt: at });

    expect(res.statusCode).toBe(201);
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ doseSlotIndex: 1, occurredAt: new Date(at) }),
      }),
    );
  });

  it("슬롯을 골라도 시각을 슬롯 예정 시각으로 당기지 않는다", async () => {
    mockPrisma.medicationCourse.findFirst.mockResolvedValue({
      id: COURSE,
      dosesPerDay: 2,
      doseTimes: ["08:00", "19:00"],
    });
    mockPrisma.event.findMany.mockResolvedValue([]);
    const before = Date.now();

    const res = await post({ doseSlotIndex: 0 });

    expect(res.statusCode).toBe(201);
    const data = mockPrisma.event.create.mock.calls[0][0].data;
    expect(data.doseSlotIndex).toBe(0);
    expect(data.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("그날 슬롯이 다 찼으면 409", async () => {
    mockPrisma.medicationCourse.findFirst.mockResolvedValue({
      id: COURSE,
      dosesPerDay: 2,
      doseTimes: ["08:00", "19:00"],
    });
    mockPrisma.event.findMany.mockResolvedValue([{ doseSlotIndex: 0 }, { doseSlotIndex: 1 }]);

    const res = await post({ occurredAt: "2026-09-01T12:00:00.000Z" });

    expect(res.statusCode).toBe(409);
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it("고른 슬롯이 이미 기록됐으면 409", async () => {
    mockPrisma.medicationCourse.findFirst.mockResolvedValue({
      id: COURSE,
      dosesPerDay: 2,
      doseTimes: ["08:00", "19:00"],
    });
    mockPrisma.event.findMany.mockResolvedValue([{ doseSlotIndex: 0 }]);

    const res = await post({ doseSlotIndex: 0 });

    expect(res.statusCode).toBe(409);
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it("슬롯 없는 처방도 하루 횟수에 닿으면 409", async () => {
    mockPrisma.medicationCourse.findFirst.mockResolvedValue({
      id: COURSE,
      dosesPerDay: 1,
      doseTimes: [],
    });
    mockPrisma.event.findMany.mockResolvedValue([{ doseSlotIndex: null }]);

    const res = await post({});

    expect(res.statusCode).toBe(409);
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it("그날 몫을 셀 때 가구·반려동물·처방으로 좁힌다 (K-1)", async () => {
    mockPrisma.medicationCourse.findFirst.mockResolvedValue({
      id: COURSE,
      dosesPerDay: 1,
      doseTimes: [],
    });
    mockPrisma.event.findMany.mockResolvedValue([]);

    await post({ occurredAt: "2026-09-01T00:00:00.000Z" });

    expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          householdId: HH,
          petId: PET,
          medicationCourseId: COURSE,
          occurredAt: {
            gte: new Date("2026-09-01T00:00:00+09:00"),
            lt: new Date("2026-09-02T00:00:00+09:00"),
          },
        }),
      }),
    );
  });
});
