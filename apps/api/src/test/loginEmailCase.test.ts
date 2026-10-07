import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

function row(id: string, email: string, password: string, createdAt: string) {
  return {
    id,
    email,
    name: id,
    role: "GENERAL",
    tokenVersion: 0,
    createdAt: new Date(createdAt),
    passwordHash: bcrypt.hashSync(password, 4),
  };
}

describe("로그인 이메일 대소문자", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([]);
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  const login = (email: string, password: string) =>
    app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });

  it("normalizes the typed email (case, spaces) before looking it up", async () => {
    mockPrisma.user.findMany.mockResolvedValue([row("u1", "mom@example.com", "pw-12345678", "2026-01-01")]);
    const res = await login("  Mom@Example.COM ", "pw-12345678");
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: { equals: "mom@example.com", mode: "insensitive" } } }),
    );
  });

  it("keeps the older mixed-case account reachable when a lowercase duplicate exists", async () => {
    // A(Mom@, 옛 계정, 예전엔 정확한 대소문자로 로그인) · B(mom@, 새 계정)
    mockPrisma.user.findMany.mockResolvedValue([
      row("A", "Mom@Example.com", "a-password", "2026-01-01"),
      row("B", "mom@example.com", "b-password", "2026-03-01"),
    ]);
    const asA = await login("mom@example.com", "a-password");
    expect(asA.statusCode).toBe(200);
    expect(asA.json().user.id).toBe("A");
    const asB = await login("Mom@Example.com", "b-password");
    expect(asB.json().user.id).toBe("B");
  });

  it("finds a legacy row stored with mixed case via a case-insensitive lookup", async () => {
    mockPrisma.user.findMany.mockResolvedValue([row("u1", "Mom@Example.com", "pw-12345678", "2026-01-01")]);
    const res = await login("mom@example.com", "pw-12345678");
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: { equals: "mom@example.com", mode: "insensitive" } } }),
    );
  });

  it("logs in the row whose password matches when case-only duplicates already exist", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      row("old", "Mom@Example.com", "old-password", "2026-01-01"),
      row("new", "MOM@example.com", "new-password", "2026-02-01"),
    ]);
    const res = await login("mom@example.com", "new-password");
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe("new");
  });

  it("rejects a wrong password and an unknown email the same way", async () => {
    mockPrisma.user.findMany.mockResolvedValue([row("u1", "Mom@Example.com", "pw-12345678", "2026-01-01")]);
    const wrong = await login("mom@example.com", "nope");
    mockPrisma.user.findMany.mockResolvedValue([]);
    const unknown = await login("ghost@example.com", "nope");
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });
});
