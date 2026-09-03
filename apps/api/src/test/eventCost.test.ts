import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";

const HH = "household_a";
const USER = "user_a";
const PET = "pet_1";
const EVENT_TYPE = "event_type_vet_visit";
const EVENT_ID = "event_1";

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  pet: { findFirst: vi.fn() },
  eventType: { findFirst: vi.fn() },
  event: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

function jwt(app: FastifyInstance): string {
  return app.jwt.sign({ sub: USER, role: "ADMIN", tv: 1 }, { expiresIn: "1h" });
}

describe("costKrw — 병원 방문 이벤트 비용 (WORKLOG 2026-09-04)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateHouseholdCache(USER);
    invalidateTokenVersionCache(USER);

    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH, role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });

    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST /api/events는 costKrw를 저장하고 응답에 돌려준다", async () => {
    mockPrisma.pet.findFirst.mockResolvedValue({ id: PET });
    mockPrisma.eventType.findFirst.mockResolvedValue({ id: EVENT_TYPE, scaleType: null });
    mockPrisma.event.create.mockResolvedValue({ id: EVENT_ID, costKrw: 35000 });
    mockPrisma.event.findFirst.mockResolvedValue({ id: EVENT_ID, costKrw: 35000 });

    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { authorization: `Bearer ${jwt(app)}` },
      payload: { petId: PET, eventTypeId: EVENT_TYPE, costKrw: 35000 },
    });

    expect(res.statusCode).toBe(201);
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ costKrw: 35000 }) }),
    );
    expect(res.json().costKrw).toBe(35000);
  });

  it("음수 costKrw는 400으로 거절된다", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { authorization: `Bearer ${jwt(app)}` },
      payload: { petId: PET, eventTypeId: EVENT_TYPE, costKrw: -1 },
    });

    expect(res.statusCode).toBe(400);
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it("Postgres INTEGER 상한을 넘는 costKrw는 400으로 거절된다 (500 대신)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { authorization: `Bearer ${jwt(app)}` },
      payload: { petId: PET, eventTypeId: EVENT_TYPE, costKrw: 9_999_999_999 },
    });

    expect(res.statusCode).toBe(400);
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it("PATCH /api/events/:id는 costKrw를 갱신한다", async () => {
    mockPrisma.event.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.event.findFirst.mockResolvedValue({ id: EVENT_ID, costKrw: 12000 });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/events/${EVENT_ID}`,
      headers: { authorization: `Bearer ${jwt(app)}` },
      payload: { costKrw: 12000 },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ costKrw: 12000 }) }),
    );
  });

  it("PATCH /api/events/:id에 costKrw: null을 보내면 비용을 지운다", async () => {
    mockPrisma.event.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.event.findFirst.mockResolvedValue({ id: EVENT_ID, costKrw: null });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/events/${EVENT_ID}`,
      headers: { authorization: `Bearer ${jwt(app)}` },
      payload: { costKrw: null },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ costKrw: null }) }),
    );
  });
});
