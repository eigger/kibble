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
  medicationCourse: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  routineItem: { updateMany: vi.fn() },
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
    const [call] = mockPrisma.medicationCourse.update.mock.calls;
    expect(call[0].where).toEqual({ id: "old" });
    expect(call[0].data.endDate).toBeInstanceOf(Date);
    expect(call[0].data.archivedAt).toBeUndefined();
  });

  it("archives the previous course when the new one starts today", async () => {
    const res = await cont(new Date().toISOString(), { endDate: null });
    expect(res.statusCode).toBe(201);
    const [call] = mockPrisma.medicationCourse.update.mock.calls;
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
    expect(mockPrisma.medicationCourse.update).not.toHaveBeenCalled();
  });
});
