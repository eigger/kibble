import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";

const HH = "household_a";
const USER = "user_a";
const PET = "pet_a";

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
  routine: { findMany: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

function row(id: string, sortOrder: number) {
  return { id, petId: PET, label: id, sortOrder, items: [] };
}

function writes(): Array<[string, number]> {
  return mockPrisma.routine.updateMany.mock.calls.map((c) => [c[0].where.id, c[0].data.sortOrder]);
}

describe("PUT /api/routines/order", () => {
  let app: FastifyInstance;
  let role: string;

  const put = (payload: unknown) =>
    app.inject({
      method: "PUT",
      url: "/api/routines/order",
      headers: { authorization: `Bearer ${app.jwt.sign({ sub: USER, role: "ADMIN", tv: 1 })}` },
      payload: payload as object,
    });

  beforeEach(async () => {
    vi.clearAllMocks();
    role = "OWNER";
    invalidateHouseholdCache(USER);
    invalidateTokenVersionCache(USER);
    mockPrisma.householdMember.findFirst.mockImplementation(async () => ({ householdId: HH, role }));
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) =>
      fn(mockPrisma),
    );
    mockPrisma.routine.updateMany.mockResolvedValue({ count: 1 });
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it("renumbers to 0..n-1 in the requested order and returns the list", async () => {
    mockPrisma.routine.findMany
      .mockResolvedValueOnce([
        { id: "a", sortOrder: 0 },
        { id: "b", sortOrder: 1 },
        { id: "c", sortOrder: 2 },
      ])
      .mockResolvedValueOnce([row("c", 0), row("a", 1), row("b", 2)]);

    const res = await put({ petId: PET, ids: ["c", "a", "b"] });

    expect(res.statusCode).toBe(200);
    expect(res.json().map((r: { id: string }) => r.id)).toEqual(["c", "a", "b"]);
    expect(writes()).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);
    for (const call of mockPrisma.routine.updateMany.mock.calls) {
      expect(call[0].where).toEqual(
        expect.objectContaining({ householdId: HH, petId: PET, archivedAt: null }),
      );
    }
  });

  it("takes a per-pet advisory lock before the first query, keyed by household and pet", async () => {
    mockPrisma.routine.findMany.mockResolvedValue([{ id: "a", sortOrder: 0 }]);
    await put({ petId: PET, ids: ["a"] });

    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    const [, ...values] = mockPrisma.$executeRaw.mock.calls[0]!;
    expect(values[0]).toContain(HH);
    expect(values[0]).toContain(PET);
    expect(mockPrisma.$executeRaw.mock.invocationCallOrder[0]!).toBeLessThan(
      mockPrisma.routine.findMany.mock.invocationCallOrder[0]!,
    );
  });

  it("reads the response list in sortOrder, createdAt order", async () => {
    mockPrisma.routine.findMany
      .mockResolvedValueOnce([{ id: "a", sortOrder: 0 }])
      .mockResolvedValueOnce([row("a", 0)]);
    await put({ petId: PET, ids: ["a"] });

    const last = mockPrisma.routine.findMany.mock.calls.at(-1)![0];
    expect(last.orderBy).toEqual([{ sortOrder: "asc" }, { createdAt: "asc" }]);
  });

  it("keeps unlisted routines after the listed ones in their existing relative order", async () => {
    mockPrisma.routine.findMany
      .mockResolvedValueOnce([
        { id: "a", sortOrder: 0 },
        { id: "b", sortOrder: 1 },
        { id: "x", sortOrder: 2 },
        { id: "y", sortOrder: 3 },
      ])
      .mockResolvedValueOnce([]);

    const res = await put({ petId: PET, ids: ["b", "a"] });

    expect(res.statusCode).toBe(200);
    // x, y는 이미 2, 3이라 쓰기가 필요 없다
    expect(writes()).toEqual([
      ["b", 0],
      ["a", 1],
    ]);
  });

  it("pushes unlisted routines back even when they were in front", async () => {
    mockPrisma.routine.findMany
      .mockResolvedValueOnce([
        { id: "x", sortOrder: 0 },
        { id: "a", sortOrder: 1 },
        { id: "b", sortOrder: 2 },
      ])
      .mockResolvedValueOnce([]);

    await put({ petId: PET, ids: ["b", "a"] });

    expect(writes()).toEqual([
      ["b", 0],
      ["x", 2],
    ]);
  });

  it("ignores duplicate ids (first occurrence wins)", async () => {
    mockPrisma.routine.findMany
      .mockResolvedValueOnce([
        { id: "a", sortOrder: 0 },
        { id: "b", sortOrder: 1 },
      ])
      .mockResolvedValueOnce([]);

    const res = await put({ petId: PET, ids: ["b", "a", "b"] });

    expect(res.statusCode).toBe(200);
    expect(writes()).toEqual([
      ["b", 0],
      ["a", 1],
    ]);
  });

  it("404s on an id that is unknown, archived, or on another pet/household — without writing", async () => {
    mockPrisma.routine.findMany.mockResolvedValue([{ id: "a", sortOrder: 0 }]);

    for (const bad of ["other_hh", "archived", "other_pet"]) {
      const res = await put({ petId: PET, ids: ["a", bad] });
      expect(res.statusCode).toBe(404);
    }
    expect(mockPrisma.routine.updateMany).not.toHaveBeenCalled();
  });

  it("400s on an empty ids list", async () => {
    expect((await put({ petId: PET, ids: [] })).statusCode).toBe(400);
  });

  it("rejects a VIEWER with 403", async () => {
    role = "VIEWER";
    const res = await put({ petId: PET, ids: ["a"] });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/routines/order",
      payload: { petId: PET, ids: ["a"] },
    });
    expect(res.statusCode).toBe(401);
  });
});
