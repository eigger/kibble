import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";
import { hashApiToken } from "../lib/apiToken.js";

const HH = "household_a";
const USER = "user_a";
const PET = "pet_a";
const PET_OTHER = "pet_other";

const PLAINTEXT_READ = "kbl_state_read_token_value_abcdefgh";
const PLAINTEXT_WRITE_ONLY = "kbl_write_only_token_value_abcdefgh";

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  pet: { findFirst: vi.fn() },
  event: { groupBy: vi.fn(), findMany: vi.fn() },
  eventType: { findMany: vi.fn() },
  medicationCourse: { findMany: vi.fn() },
  reminder: { findMany: vi.fn() },
  // update는 touchApiTokenLastUsed가 .catch()를 체인하므로 Promise를 돌려줘야 한다.
  apiToken: { findFirst: vi.fn(), update: vi.fn(async () => ({})) },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

function jwt(app: FastifyInstance): string {
  return app.jwt.sign({ sub: USER, role: "ADMIN", tv: 1 }, { expiresIn: "1h" });
}

/** scopes와 petId를 지정한 토큰 행을 authenticate가 찾도록 심는다. */
function seedToken(opts: { scopes: string[]; petId?: string | null }) {
  mockPrisma.apiToken.findFirst.mockImplementation(async ({ where }: { where: { tokenHash: string } }) => {
    if (where.tokenHash !== hashApiToken(PLAINTEXT_READ) && where.tokenHash !== hashApiToken(PLAINTEXT_WRITE_ONLY)) {
      return null;
    }
    return {
      id: "token_1",
      householdId: HH,
      scopes: opts.scopes,
      presetId: null,
      petId: opts.petId ?? null,
      eventTypeId: null,
      expiresAt: null,
      revokedAt: null,
    };
  });
}

describe("GET /api/states — 역방향 읽기 (WORKPLAN P2-04)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateHouseholdCache(USER);
    invalidateTokenVersionCache(USER);

    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH, role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
    mockPrisma.pet.findFirst.mockResolvedValue({ id: PET, name: "콩", species: "DOG" });
    mockPrisma.event.groupBy.mockResolvedValue([]);
    mockPrisma.event.findMany.mockResolvedValue([]);
    mockPrisma.eventType.findMany.mockResolvedValue([]);
    mockPrisma.medicationCourse.findMany.mockResolvedValue([]);
    mockPrisma.reminder.findMany.mockResolvedValue([]);
    mockPrisma.apiToken.update.mockResolvedValue({});

    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it("로그인 세션으로 읽을 수 있다", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/states?petId=${PET}`,
      headers: { authorization: `Bearer ${jwt(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ pet: { id: PET, name: "콩" } });
  });

  // 기존 토큰은 event:create만 갖고 있다 — 배포만으로 읽기 권한이 생기면 안 된다.
  it("event:create만 있는 토큰은 403", async () => {
    seedToken({ scopes: ["event:create"] });
    const res = await app.inject({
      method: "GET",
      url: "/api/states",
      headers: { authorization: `Bearer ${PLAINTEXT_WRITE_ONLY}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("state:read 토큰은 읽을 수 있다", async () => {
    seedToken({ scopes: ["state:read"] });
    const res = await app.inject({
      method: "GET",
      url: "/api/states",
      headers: { authorization: `Bearer ${PLAINTEXT_READ}` },
    });
    expect(res.statusCode).toBe(200);
  });

  // 개체 스코프 토큰이 다른 반려동물을 물으면 가구 안이라도 막는다.
  it("개체 스코프 토큰이 다른 petId를 물으면 403", async () => {
    seedToken({ scopes: ["state:read"], petId: PET });
    const res = await app.inject({
      method: "GET",
      url: `/api/states?petId=${PET_OTHER}`,
      headers: { authorization: `Bearer ${PLAINTEXT_READ}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("가구 밖 반려동물은 404 (K-1)", async () => {
    mockPrisma.pet.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "GET",
      url: `/api/states?petId=${PET_OTHER}`,
      headers: { authorization: `Bearer ${jwt(app)}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("인증 없이는 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/states" });
    expect(res.statusCode).toBe(401);
  });
});
