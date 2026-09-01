import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";

const HH_A = "household_a";
const ADMIN_A = "admin_a";
const ADMIN_OTHER = "admin_other_hh";
const GENERAL_OTHER = "general_other_hh";
const ADMIN_SAME = "admin_same_hh";

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn(), findUnique: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  pet: { count: vi.fn() },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

const USERS: Record<string, { id: string; role: "ADMIN" | "GENERAL" }> = {
  [ADMIN_A]: { id: ADMIN_A, role: "ADMIN" },
  [ADMIN_OTHER]: { id: ADMIN_OTHER, role: "ADMIN" },
  [GENERAL_OTHER]: { id: GENERAL_OTHER, role: "GENERAL" },
  [ADMIN_SAME]: { id: ADMIN_SAME, role: "ADMIN" },
};

/** HH_A의 멤버는 요청자와 ADMIN_SAME 둘뿐 — 나머지는 다른 가구 소속이다. */
const HH_A_MEMBERS = new Set([ADMIN_A, ADMIN_SAME]);

function signJwt(app: FastifyInstance, userId = ADMIN_A, tv = 1): string {
  return app.jwt.sign({ sub: userId, role: "ADMIN", tv }, { expiresIn: "1h" });
}

function authHeaders(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

describe("admin user routes — 가구 밖 ADMIN 권한 상승 차단 (WORKPLAN §7.12)", () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    for (const id of Object.keys(USERS)) invalidateTokenVersionCache(id);
    invalidateHouseholdCache(ADMIN_A);

    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH_A, role: "OWNER" });
    mockPrisma.householdMember.findUnique.mockImplementation(
      async ({ where }: { where: { householdId_userId: { householdId: string; userId: string } } }) => {
        const { householdId, userId } = where.householdId_userId;
        return householdId === HH_A && HH_A_MEMBERS.has(userId) ? { role: "OWNER" } : null;
      },
    );
    // authenticate(tokenVersion) · requireAdmin(role) · 라우트의 대상 조회가 모두 이 목을 탄다.
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const row = USERS[where.id];
      return row ? { ...row, tokenVersion: 1, name: "n", email: `${row.id}@example.com` } : null;
    });
    mockPrisma.user.update.mockResolvedValue({ tokenVersion: 2 });
    mockPrisma.user.delete.mockResolvedValue({ id: "deleted" });

    app = await buildApp({ logger: false });
    token = signJwt(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("DELETE /api/auth/users/:id returns 403 for an ADMIN in another household", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/auth/users/${ADMIN_OTHER}`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(403);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it("POST /api/auth/users/:id/reset-password returns 403 for an ADMIN in another household", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/auth/users/${ADMIN_OTHER}/reset-password`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(403);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("still manages a GENERAL account in another household (§7.12 SEPARATE 계정 관리)", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/auth/users/${GENERAL_OTHER}`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(204);
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: GENERAL_OTHER } });
  });

  it("still resets an ADMIN who shares the requester's household", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/auth/users/${ADMIN_SAME}/reset-password`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().temporaryPassword).toEqual(expect.any(String));
  });
});
