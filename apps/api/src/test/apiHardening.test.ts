import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";

const USER = "user_a";
const OTHER = "user_b";
const HH = "household_a";

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(async () => 0),
  user: { count: vi.fn(async () => 0), create: vi.fn() },
  household: { create: vi.fn() },
  householdMember: { create: vi.fn(async () => ({})) },
}));

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  pushSubscription: { findUnique: vi.fn(), upsert: vi.fn(async () => ({})) },
  $transaction: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../lib/vapid.js", () => ({
  getVapidKeys: vi.fn(async () => ({ publicKey: "pub", privateKey: "priv", subject: "mailto:a@b.c" })),
  generateAndStoreVapidKeys: vi.fn(),
}));

function bearer(app: FastifyInstance, sub = USER): { authorization: string } {
  return { authorization: `Bearer ${app.jwt.sign({ sub, role: "GENERAL", tv: 1 }, { expiresIn: "1h" })}` };
}

async function makeApp(): Promise<FastifyInstance> {
  const app = await buildApp({ logger: false });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidateTokenVersionCache(USER);
  invalidateHouseholdCache(USER);
  mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH, role: "OWNER" });
  mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.pushSubscription.findUnique.mockResolvedValue(null);
});

describe("TRUST_PROXY — rate limit이 클라이언트 IP 기준으로 나뉜다", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app.close();
    delete process.env.TRUST_PROXY;
  });

  const login = (ip: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "x-forwarded-for": ip },
      payload: { email: "a@example.com", password: "pw" },
    });

  it("with TRUST_PROXY set each forwarded client has its own login budget", async () => {
    process.env.TRUST_PROXY = "loopback";
    app = await makeApp();
    for (let i = 0; i < 10; i++) expect((await login("203.0.113.1")).statusCode).toBe(401);
    expect((await login("203.0.113.1")).statusCode).toBe(429);
    expect((await login("203.0.113.2")).statusCode).toBe(401);
  });

  it("unset TRUST_PROXY uses the private-range default (each client its own bucket)", async () => {
    app = await makeApp();
    for (let i = 0; i < 10; i++) expect((await login("203.0.113.1")).statusCode).toBe(401);
    expect((await login("203.0.113.1")).statusCode).toBe(429);
    expect((await login("203.0.113.2")).statusCode).toBe(401);
  });

  it("with TRUST_PROXY=false the header is ignored (no spoofing, one shared bucket)", async () => {
    process.env.TRUST_PROXY = "false";
    app = await makeApp();
    for (let i = 0; i < 10; i++) expect((await login(`203.0.113.${i}`)).statusCode).toBe(401);
    expect((await login("198.51.100.9")).statusCode).toBe(429);
  });
});

describe("POST /api/push/subscribe", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await makeApp();
  });
  afterEach(async () => {
    await app.close();
  });

  const subscribe = (endpoint: string, sub = USER) =>
    app.inject({
      method: "POST",
      url: "/api/push/subscribe",
      headers: bearer(app, sub),
      payload: { endpoint, keys: { p256dh: "k", auth: "a" } },
    });

  it("rejects SSRF-able endpoints", async () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/x",
      "https://169.254.169.254/latest",
      "https://localhost/x",
      "https://api:8080/x",
    ]) {
      expect((await subscribe(endpoint)).statusCode).toBe(400);
    }
    expect(mockPrisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it("stores a normal push-service endpoint", async () => {
    const res = await subscribe("https://fcm.googleapis.com/fcm/send/abc");
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.pushSubscription.upsert).toHaveBeenCalledTimes(1);
  });

  it("does not take over a subscription owned by another user", async () => {
    mockPrisma.pushSubscription.findUnique.mockResolvedValue({ userId: OTHER });
    const res = await subscribe("https://fcm.googleapis.com/fcm/send/abc");
    expect(res.statusCode).toBe(409);
    expect(mockPrisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it("refreshes the keys of the owner's own subscription without touching userId", async () => {
    mockPrisma.pushSubscription.findUnique.mockResolvedValue({ userId: USER });
    const res = await subscribe("https://fcm.googleapis.com/fcm/send/abc");
    expect(res.statusCode).toBe(200);
    const call = mockPrisma.pushSubscription.upsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect(call.update).not.toHaveProperty("userId");
  });
});

describe("body limits", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await makeApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it("rejects an oversized JSON body globally", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ email: "a@example.com", password: "x".repeat(3 * 1024 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
  });

  it("still accepts an 8MB upload chunk (route-level limit) and rejects > 16MB", async () => {
    const put = (bytes: number) =>
      app.inject({
        method: "PUT",
        url: "/api/attachments/uploads/missing/chunks/0",
        headers: { ...bearer(app), "content-type": "application/octet-stream" },
        payload: Buffer.alloc(bytes),
      });
    // 한도를 통과하면 라우트가 실행돼 "세션 없음" 404가 나온다
    expect((await put(8 * 1024 * 1024)).statusCode).toBe(404);
    expect((await put(17 * 1024 * 1024)).statusCode).toBe(413);
  });
});

describe("POST /api/auth/bootstrap/admin", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    tx.user.create.mockResolvedValue({ id: "u1", name: "n", email: "a@example.com", role: "ADMIN" });
    tx.household.create.mockResolvedValue({ id: "h1" });
    mockPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
    app = await makeApp();
  });
  afterEach(async () => {
    await app.close();
  });

  const bootstrap = (locale: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/bootstrap/admin",
      headers: { "x-locale": locale },
      payload: { name: "n", email: "a@example.com", password: "password-1234" },
    });

  it("takes an advisory lock before counting users and names the household by locale", async () => {
    const ko = await bootstrap("ko");
    expect(ko.statusCode).toBe(201);
    expect(tx.household.create).toHaveBeenLastCalledWith({ data: { name: "우리 집" } });
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.user.count.mock.invocationCallOrder[0]!);

    await bootstrap("en");
    expect(tx.household.create).toHaveBeenLastCalledWith({ data: { name: "Our household" } });
  });

  it("returns 409 when an admin appeared while waiting for the lock", async () => {
    tx.user.count.mockResolvedValueOnce(1);
    expect((await bootstrap("ko")).statusCode).toBe(409);
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});
