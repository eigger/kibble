import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";

const HH = "household_a";
const USER = "user_a";
const EVENT_ID = "event_1";

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  event: { updateMany: vi.fn(), findFirst: vi.fn() },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

function jwt(app: FastifyInstance): string {
  return app.jwt.sign({ sub: USER, role: "ADMIN", tv: 1 }, { expiresIn: "1h" });
}

describe("PATCH /api/events/:id — 최종 수정자 기록 (WORKLOG 작성자·최종 수정 표기)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateHouseholdCache(USER);
    invalidateTokenVersionCache(USER);

    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH, role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
    mockPrisma.event.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.event.findFirst.mockResolvedValue({ id: EVENT_ID, contact: null });

    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  // PATCH가 어떤 필드를 바꾸든, 이 요청을 보낸 세션 사용자가 "마지막으로 고친 사람"이다.
  it("바뀐 필드와 무관하게 updatedById를 요청자로 세팅한다", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/events/${EVENT_ID}`,
      headers: { authorization: `Bearer ${jwt(app)}` },
      payload: { note: "메모만 고침" },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ updatedById: USER, note: "메모만 고침" }),
      }),
    );
  });
});
