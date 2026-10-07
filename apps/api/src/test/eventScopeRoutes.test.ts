import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";
import { t } from "../lib/i18n.js";
import { hashApiToken } from "../lib/apiToken.js";

const HH = "household_a";
const USER = "user_a";
const PET = "pet_1";
const TYPE_A = "type_a";
const TYPE_B = "type_b";
const TOKEN = "kbl_scoped_event_token_value_abcdefgh";

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  pet: { findFirst: vi.fn() },
  preset: { findFirst: vi.fn() },
  eventType: { findFirst: vi.fn() },
  medicationCourse: { findFirst: vi.fn(), findMany: vi.fn() },
  event: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
  $executeRaw: vi.fn(async () => 0),
  $transaction: vi.fn(),
  apiToken: { findFirst: vi.fn(), update: vi.fn(async () => ({})) },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

describe("이벤트 생성 라우트 — 오류 매핑·토큰 스코프 배선", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateHouseholdCache(USER);
    invalidateTokenVersionCache(USER);
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma));
    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH, role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
    mockPrisma.pet.findFirst.mockResolvedValue({ id: PET });
    mockPrisma.apiToken.update.mockResolvedValue({});
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it("고정 eventTypeId 토큰이 다른 타입의 presetId를 보내면 403, 기록은 만들어지지 않는다", async () => {
    mockPrisma.apiToken.findFirst.mockImplementation(async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashApiToken(TOKEN)
        ? {
            id: "token_1",
            householdId: HH,
            scopes: ["event:create"],
            presetId: null,
            petId: null,
            eventTypeId: TYPE_A,
          }
        : null,
    );
    mockPrisma.preset.findFirst.mockResolvedValue({
      id: "preset_b",
      eventTypeId: TYPE_B,
      quantity: null,
      unit: null,
      petId: null,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { petId: PET, presetId: "preset_b" },
    });

    expect(res.statusCode).toBe(403);
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it("고정 petId 토큰이 다른 반려동물 기록의 dedupeKey를 보내면 403, 반환도 복원도 없다", async () => {
    mockPrisma.apiToken.findFirst.mockImplementation(async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashApiToken(TOKEN)
        ? {
            id: "token_1",
            householdId: HH,
            scopes: ["event:create"],
            presetId: null,
            petId: PET,
            eventTypeId: null,
          }
        : null,
    );
    mockPrisma.event.findFirst.mockResolvedValue({
      id: "event_other",
      petId: "pet_other",
      eventTypeId: TYPE_A,
      deletedAt: new Date(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { eventTypeId: TYPE_A, dedupeKey: "shared-key" },
    });

    expect(res.statusCode).toBe(403);
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it("보관된(없는) 반려동물로 복약을 기록하면 petNotFound 404", async () => {
    const jwt = app.jwt.sign({ sub: USER, role: "ADMIN", tv: 1 }, { expiresIn: "1h" });
    mockPrisma.medicationCourse.findFirst.mockResolvedValue({
      id: "course_1",
      petId: PET,
      dosesPerDay: 1,
      doseTimes: [],
    });
    mockPrisma.event.findMany.mockResolvedValue([]);
    mockPrisma.eventType.findFirst.mockResolvedValue({
      id: "type_med",
      key: "medication",
      scaleType: null,
    });
    // 보관된 pet은 archivedAt: null 조건에 걸려 조회되지 않는다
    mockPrisma.pet.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/care/medication-courses/course_1/doses",
      headers: { authorization: `Bearer ${jwt}` },
      payload: {},
    });

    expect(res.statusCode).toBe(404);
    expect([t("petNotFound", "ko"), t("petNotFound", "en")]).toContain(res.json().error);
  });
});
