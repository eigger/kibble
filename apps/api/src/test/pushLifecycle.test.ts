import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";
import { pushLocale } from "../lib/push.js";

const HH = "household_a";
const USER = "user_a";

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
  pushSubscription: { findUnique: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

describe("푸시 구독 수명주기", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateHouseholdCache(USER);
    invalidateTokenVersionCache(USER);
    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH, role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
    mockPrisma.user.update.mockResolvedValue({ tokenVersion: 2 });
    mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  const auth = () => ({
    authorization: `Bearer ${app.jwt.sign({ sub: USER, role: "ADMIN", tv: 1 }, { expiresIn: "1h" })}`,
  });

  it("logout-all removes every subscription of that user", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/logout-all", headers: auth() });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: USER } });
  });

  it("deletes only the caller's own subscription by endpoint", async () => {
    mockPrisma.pushSubscription.findUnique.mockResolvedValue({ userId: "someone_else" });
    const res = await app.inject({
      method: "DELETE",
      url: "/api/push/subscribe",
      headers: auth(),
      payload: { endpoint: "https://push.example/abc" },
    });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.pushSubscription.delete).not.toHaveBeenCalled();

    mockPrisma.pushSubscription.findUnique.mockResolvedValue({ userId: USER });
    const own = await app.inject({
      method: "DELETE",
      url: "/api/push/subscribe",
      headers: auth(),
      payload: { endpoint: "https://push.example/abc" },
    });
    expect(own.statusCode).toBe(200);
    expect(mockPrisma.pushSubscription.delete).toHaveBeenCalledWith({
      where: { endpoint: "https://push.example/abc" },
    });
  });
});

describe("pushLocale", () => {
  it("defaults to ko for unknown values", () => {
    expect(pushLocale("en")).toBe("en");
    expect(pushLocale("ko")).toBe("ko");
    expect(pushLocale("fr")).toBe("ko");
    expect(pushLocale(null)).toBe("ko");
  });
});
