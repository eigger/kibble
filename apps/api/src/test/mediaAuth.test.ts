import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";
import { MEDIA_COOKIE_NAME, signMediaToken } from "../lib/mediaAuth.js";

const HH_A = "household_a";
const USER_A = "user_a";
const CURRENT_TV = 3;

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  attachment: { findFirst: vi.fn() },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

function getFile(app: FastifyInstance, cookie: string) {
  return app.inject({
    method: "GET",
    url: "/api/attachments/file/events/whatever.jpg",
    cookies: { [MEDIA_COOKIE_NAME]: cookie },
  });
}

describe("media cookie honours tokenVersion", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateHouseholdCache(USER_A);
    invalidateTokenVersionCache(USER_A);
    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH_A, role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: CURRENT_TV });
    // 인증을 통과했는지만 본다 — 첨부 행이 없으면 404, 막히면 401.
    mockPrisma.attachment.findFirst.mockResolvedValue(null);
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it("passes auth when tv matches the current tokenVersion", async () => {
    const res = await getFile(app, signMediaToken(app, USER_A, CURRENT_TV));
    expect(res.statusCode).toBe(404);
  });

  it("rejects a cookie minted before /logout-all bumped tokenVersion", async () => {
    const res = await getFile(app, signMediaToken(app, USER_A, CURRENT_TV - 1));
    expect(res.statusCode).toBe(401);
    expect(mockPrisma.attachment.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a legacy cookie that carries no tv claim", async () => {
    const legacy = app.jwt.sign({ sub: USER_A, purpose: "media" }, { expiresIn: "24h" });
    const res = await getFile(app, legacy);
    expect(res.statusCode).toBe(401);
    expect(mockPrisma.attachment.findFirst).not.toHaveBeenCalled();
  });
});
