import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";

const HH_A = "household_a";
const USER_A = "user_a";
const PET_OTHER = "pet_other_hh";
const EVENT_OTHER = "event_other_hh";
const PRESET_OTHER = "preset_other_hh";

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  pet: { findFirst: vi.fn(), findMany: vi.fn() },
  preset: { findFirst: vi.fn(), findMany: vi.fn() },
  event: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    groupBy: vi.fn(),
  },
  eventType: { findFirst: vi.fn() },
  apiToken: { findFirst: vi.fn(), update: vi.fn() },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

function signJwt(app: FastifyInstance, userId = USER_A, tv = 1): string {
  return app.jwt.sign({ sub: userId, role: "ADMIN", tv }, { expiresIn: "1h" });
}

function authHeaders(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

function setupHouseholdA(): void {
  mockPrisma.householdMember.findFirst.mockResolvedValue({
    householdId: HH_A,
    role: "OWNER",
  });
  mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
}

describe("household isolation (K-3)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateHouseholdCache(USER_A);
    invalidateTokenVersionCache(USER_A);
    setupHouseholdA();
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/events returns 404 for another household's pet", async () => {
    mockPrisma.pet.findFirst.mockResolvedValue(null);

    const token = signJwt(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/events?petId=${PET_OTHER}`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.pet.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: PET_OTHER, householdId: HH_A }),
      }),
    );
  });

  it("PATCH /api/events/:id returns 404 for another household's event", async () => {
    mockPrisma.event.updateMany.mockResolvedValue({ count: 0 });

    const token = signJwt(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/events/${EVENT_OTHER}`,
      headers: authHeaders(token),
      payload: { note: "nope" },
    });

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: EVENT_OTHER, householdId: HH_A }),
      }),
    );
  });

  it("DELETE /api/events/:id returns 404 for another household's event", async () => {
    mockPrisma.event.updateMany.mockResolvedValue({ count: 0 });

    const token = signJwt(app);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/events/${EVENT_OTHER}`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: EVENT_OTHER, householdId: HH_A }),
      }),
    );
  });

  it("POST /api/events returns 404 when preset belongs to another household", async () => {
    mockPrisma.pet.findFirst.mockResolvedValue({ id: "pet_a" });
    mockPrisma.preset.findFirst.mockResolvedValue(null);

    const token = signJwt(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: authHeaders(token),
      payload: { petId: "pet_a", presetId: PRESET_OTHER },
    });

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.preset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: PRESET_OTHER, householdId: HH_A }),
      }),
    );
  });

  it("GET /api/home rejects ApiToken on routes without allowApiToken (K-5)", async () => {
    const token = "kbl_" + "a".repeat(48);
    const res = await app.inject({
      method: "GET",
      url: "/api/home",
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(403);
    expect(mockPrisma.apiToken.findFirst).not.toHaveBeenCalled();
  });
});
