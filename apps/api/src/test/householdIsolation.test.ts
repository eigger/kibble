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
  pet: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
  preset: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  eventTypeAlias: { findMany: vi.fn(), upsert: vi.fn() },
  attachment: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
  event: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    groupBy: vi.fn(),
  },
  eventType: { findFirst: vi.fn(), findMany: vi.fn() },
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

  it("GET /api/pets/:id returns 404 for another household's pet", async () => {
    mockPrisma.pet.findFirst.mockResolvedValue(null);

    const token = signJwt(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/pets/${PET_OTHER}`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.pet.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: PET_OTHER, householdId: HH_A }),
      }),
    );
  });

  it("PATCH /api/pets/:id returns 404 for another household's pet", async () => {
    mockPrisma.pet.updateMany.mockResolvedValue({ count: 0 });

    const token = signJwt(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/pets/${PET_OTHER}`,
      headers: authHeaders(token),
      payload: { name: "nope" },
    });

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.pet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: PET_OTHER, householdId: HH_A }),
      }),
    );
  });

  it("DELETE /api/pets/:id returns 404 for another household's pet", async () => {
    mockPrisma.pet.findFirst.mockResolvedValue(null);

    const token = signJwt(app);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/pets/${PET_OTHER}`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.pet.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: PET_OTHER, householdId: HH_A }),
      }),
    );
  });

  it("DELETE /api/pets/:id/photo returns 404 for another household's pet", async () => {
    mockPrisma.pet.findFirst.mockResolvedValue(null);

    const token = signJwt(app);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/pets/${PET_OTHER}/photo`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.pet.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: PET_OTHER, householdId: HH_A }),
      }),
    );
  });

  it("PATCH /api/presets/:id returns 404 for another household's preset", async () => {
    mockPrisma.preset.updateMany.mockResolvedValue({ count: 0 });

    const token = signJwt(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/presets/${PRESET_OTHER}`,
      headers: authHeaders(token),
      payload: { hidden: true },
    });

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.preset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: PRESET_OTHER, householdId: HH_A }),
      }),
    );
  });

  it("DELETE /api/presets/:id returns 404 for another household's preset", async () => {
    mockPrisma.preset.updateMany.mockResolvedValue({ count: 0 });

    const token = signJwt(app);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/presets/${PRESET_OTHER}`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.preset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: PRESET_OTHER, householdId: HH_A }),
      }),
    );
  });

  it("PATCH /api/event-types/:key/aliases scopes upsert to household", async () => {
    mockPrisma.eventType.findFirst.mockResolvedValue({ key: "meal" });
    mockPrisma.eventTypeAlias.upsert.mockResolvedValue({ eventTypeKey: "meal", aliases: ["밥"] });

    const token = signJwt(app);
    const res = await app.inject({
      method: "PATCH",
      url: "/api/event-types/meal/aliases",
      headers: authHeaders(token),
      payload: { aliases: ["밥"] },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.eventTypeAlias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { householdId_eventTypeKey: { householdId: HH_A, eventTypeKey: "meal" } },
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

  it("POST /api/attachments returns 404 for another household's event", async () => {
    mockPrisma.event.findFirst.mockResolvedValue(null);

    const token = signJwt(app);
    const boundary = "----kibbletest";
    const res = await app.inject({
      method: "POST",
      url: `/api/attachments?eventId=${EVENT_OTHER}`,
      headers: {
        ...authHeaders(token),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload:
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="a.jpg"\r\n` +
        `Content-Type: image/jpeg\r\n\r\n` +
        `fake\r\n` +
        `--${boundary}--\r\n`,
    });

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: EVENT_OTHER, householdId: HH_A }),
      }),
    );
  });

  it("DELETE /api/attachments/:id returns 404 for another household's attachment", async () => {
    mockPrisma.attachment.findFirst.mockResolvedValue({
      id: "att_other",
      path: "events/x.jpg",
      event: { householdId: "household_other" },
    });

    const token = signJwt(app);
    const res = await app.inject({
      method: "DELETE",
      url: "/api/attachments/att_other",
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(404);
    expect(mockPrisma.attachment.delete).not.toHaveBeenCalled();
  });
});
