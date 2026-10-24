import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";

const HH = "household_a";
const USER = "user_a";
const PET = "pet_1";

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  pet: { findFirst: vi.fn() },
  medicationCourse: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  routineItem: { updateMany: vi.fn() },
  event: { findFirst: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

describe("처방 이어가기 — 이전 처방 처리", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateHouseholdCache(USER);
    invalidateTokenVersionCache(USER);
    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH, role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
    mockPrisma.pet.findFirst.mockResolvedValue({ id: PET });
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma));
    mockPrisma.medicationCourse.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "new",
      ingredients: null,
      dosage: null,
      totalDoses: null,
      endDate: null,
      note: null,
      archivedAt: null,
      ...data,
    }));
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  function cont(startDate: string, previous: { endDate: Date | null }) {
    mockPrisma.medicationCourse.findFirst.mockResolvedValue({ id: "old", archivedAt: null, ...previous });
    const token = app.jwt.sign({ sub: USER, role: "ADMIN", tv: 1 }, { expiresIn: "1h" });
    return app.inject({
      method: "POST",
      url: "/api/care/medication-courses",
      headers: { authorization: `Bearer ${token}` },
      payload: { petId: PET, name: "새 처방", startDate, continuesCourseId: "old", dosesPerDay: 1 },
    });
  }

  it("ends but does not archive the previous course when the new one starts later", async () => {
    const later = new Date(Date.now() + 3 * 86_400_000);
    const key = new Date(later.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const res = await cont(new Date(`${key}T12:00:00+09:00`).toISOString(), { endDate: null });
    expect(res.statusCode).toBe(201);
    const [call] = mockPrisma.medicationCourse.updateMany.mock.calls;
    expect(call[0].where).toEqual({ id: "old", householdId: expect.any(String) });
    expect(call[0].data.endDate).toBeInstanceOf(Date);
    expect(call[0].data.archivedAt).toBeUndefined();
  });

  it("archives the previous course when the new one starts today", async () => {
    const res = await cont(new Date().toISOString(), { endDate: null });
    expect(res.statusCode).toBe(201);
    const [call] = mockPrisma.medicationCourse.updateMany.mock.calls;
    expect(call[0].data.archivedAt).toBeInstanceOf(Date);
    expect(call[0].data.endDate).toBeUndefined();
  });

  it("leaves an earlier existing end date alone", async () => {
    const later = new Date(Date.now() + 10 * 86_400_000);
    const key = new Date(later.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const res = await cont(new Date(`${key}T12:00:00+09:00`).toISOString(), {
      endDate: new Date(Date.now() + 86_400_000),
    });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.medicationCourse.updateMany).not.toHaveBeenCalled();
  });

  it("종료일이 시작일보다 앞서면 거부하지 않고 시작일로 보정한다 (생성)", async () => {
    const token = app.jwt.sign({ sub: USER, role: "ADMIN", tv: 1 }, { expiresIn: "1h" });
    const res = await app.inject({
      method: "POST",
      url: "/api/care/medication-courses",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        petId: PET,
        name: "처방",
        startDate: "2026-09-05T12:00:00+09:00",
        endDate: "2026-09-01T12:00:00+09:00",
      },
    });
    expect(res.statusCode).toBe(201);
    const { data } = mockPrisma.medicationCourse.create.mock.calls[0][0];
    expect(data.startDate).toEqual(new Date("2026-09-05T03:00:00.000Z"));
    expect(data.endDate).toEqual(data.startDate);
  });

  describe("PATCH/DELETE 범위와 날짜 보정", () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: "c1",
      householdId: HH,
      petId: PET,
      name: "처방",
      ingredients: null,
      dosage: null,
      dosesPerDay: 1,
      doseTimes: [],
      totalDoses: null,
      startDate: new Date("2026-09-05T03:00:00.000Z"),
      endDate: null,
      note: null,
      archivedAt: null,
      ...over,
    });
    const tokenOf = () => app.jwt.sign({ sub: USER, role: "ADMIN", tv: 1 }, { expiresIn: "1h" });
    function patch(existing: Record<string, unknown>, payload: Record<string, unknown>) {
      mockPrisma.medicationCourse.findFirst.mockResolvedValue(existing);
      mockPrisma.medicationCourse.updateMany.mockResolvedValue({ count: 1 });
      return app.inject({
        method: "PATCH",
        url: "/api/care/medication-courses/c1",
        headers: { authorization: `Bearer ${tokenOf()}` },
        payload,
      });
    }
    const dataOf = () => mockPrisma.medicationCourse.updateMany.mock.calls[0][0].data;

    it("종료일만 시작일 앞으로 보내면 시작일로 보정한다", async () => {
      const res = await patch(row(), { endDate: "2026-09-01T12:00:00+09:00" });
      expect(res.statusCode).toBe(200);
      expect(dataOf().endDate).toEqual(new Date("2026-09-05T03:00:00.000Z"));
    });

    it("시작일만 뒤로 옮겨 기존 종료일이 앞서게 되면 종료일을 보정한다", async () => {
      const res = await patch(row({ endDate: new Date("2026-09-10T03:00:00.000Z") }), {
        startDate: "2026-09-20T12:00:00+09:00",
      });
      expect(res.statusCode).toBe(200);
      expect(dataOf().endDate).toEqual(new Date("2026-09-20T03:00:00.000Z"));
    });

    it("날짜를 안 보내는 PATCH는 이미 역전된 기존 종료일을 건드리지 않는다", async () => {
      const res = await patch(row({ endDate: new Date("2026-09-01T03:00:00.000Z") }), { note: "메모" });
      expect(res.statusCode).toBe(200);
      expect(dataOf()).not.toHaveProperty("endDate");
      expect(dataOf()).not.toHaveProperty("startDate");
    });

    it("PATCH는 updateMany where에 householdId를 넣고 count 0이면 404 (K-1)", async () => {
      const res = await patch(row(), { note: "x" });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.medicationCourse.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "c1", householdId: HH } }),
      );
      mockPrisma.medicationCourse.updateMany.mockResolvedValue({ count: 0 });
      const gone = await app.inject({
        method: "PATCH",
        url: "/api/care/medication-courses/c1",
        headers: { authorization: `Bearer ${tokenOf()}` },
        payload: { note: "y" },
      });
      expect(gone.statusCode).toBe(404);
    });

    it("보관(DELETE)은 가구 조건을 넣는다", async () => {
      mockPrisma.medicationCourse.findFirst.mockResolvedValue(row());
      mockPrisma.medicationCourse.updateMany.mockResolvedValue({ count: 1 });
      const res = await app.inject({
        method: "DELETE",
        url: "/api/care/medication-courses/c1",
        headers: { authorization: `Bearer ${tokenOf()}` },
      });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.medicationCourse.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "c1", householdId: HH } }),
      );
    });

    it("복약 되돌리기는 이벤트 updateMany에 가구 조건을 넣는다", async () => {
      mockPrisma.medicationCourse.findFirst.mockResolvedValue(row());
      mockPrisma.event.findFirst.mockResolvedValue({ id: "ev1" });
      mockPrisma.event.updateMany.mockResolvedValue({ count: 1 });
      const res = await app.inject({
        method: "DELETE",
        url: "/api/care/medication-courses/c1/doses/latest",
        headers: { authorization: `Bearer ${tokenOf()}` },
      });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.event.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "ev1", householdId: HH } }),
      );
    });
  });
});
