import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";

const HH = "household_a";
const USER = "user_a";
const PET = "pet_1";
const ET = "et_meal";
const PRESET = "preset_1";
const ARCHIVED = "product_archived";
const ACTIVE = "product_active";

type Where = {
  id: { in: string[] };
  archivedAt?: null;
  AND?: { OR: ({ archivedAt: null } | { id: { in: string[] } })[] }[];
};

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  eventType: { findMany: vi.fn() },
  preset: { findMany: vi.fn() },
  product: { count: vi.fn() },
  routine: { findFirst: vi.fn(), updateMany: vi.fn() },
  routineItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

/** where를 해석한다 — 보관된 제품은 최상위 archivedAt: null이 없고 AND 절이 그 id를 허용할 때만 센다. */
function countProducts({ where }: { where: Where }): number {
  const allowed = (id: string) => {
    if (id !== ARCHIVED) return true;
    if (where.archivedAt === null) return false;
    return (where.AND ?? []).every((group) =>
      group.OR.some((cond) => "id" in cond && cond.id.in.includes(id)),
    );
  };
  return where.id.in.filter(allowed).length;
}

describe("루틴 저장 — 보관된 제품 (이미 연결된 항목)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateHouseholdCache(USER);
    invalidateTokenVersionCache(USER);
    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH, role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
    mockPrisma.eventType.findMany.mockResolvedValue([{ id: ET, key: "meal" }]);
    mockPrisma.preset.findMany.mockResolvedValue([{ id: PRESET, eventTypeId: ET }]);
    mockPrisma.product.count.mockImplementation(async (args: { where: Where }) => countProducts(args));
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma));
    mockPrisma.routine.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.routineItem.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.routineItem.createMany.mockResolvedValue({ count: 1 });
    // PATCH가 읽는 기존 루틴 — 첫 호출은 existing, 이후 호출은 직렬화용 행
    mockPrisma.routine.findFirst.mockImplementation(async (args: { select: { items?: { select: object } } }) =>
      args.select.items && "productId" in (args.select.items as { select: object }).select
        ? { id: "r1", petId: PET, items: [{ medicationCourseId: null, productId: ARCHIVED }] }
        : { id: "r1", petId: PET, label: "x", sortOrder: 0, items: [] },
    );
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  function patch(productId: string) {
    const token = app.jwt.sign({ sub: USER, role: "ADMIN", tv: 1 }, { expiresIn: "1h" });
    return app.inject({
      method: "PATCH",
      url: "/api/routines/r1",
      headers: { authorization: `Bearer ${token}` },
      payload: { label: "이름만 변경", items: [{ eventTypeId: ET, presetId: PRESET, productId }] },
    });
  }

  it("이미 연결된 보관 제품은 그대로 저장된다", async () => {
    const res = await patch(ARCHIVED);
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.routineItem.createMany).toHaveBeenCalled();
    // K-1 — 보관 예외를 열어도 가구·반려동물 범위는 그대로다
    const { where } = mockPrisma.product.count.mock.calls[0][0] as {
      where: { householdId: string; OR: object[] };
    };
    expect(where.householdId).toBe(HH);
    expect(where.OR).toEqual([{ petId: null }, { petId: PET }]);
  });

  it("새로 연결하려는 보관 제품은 거절된다 (productNotFound 404)", async () => {
    mockPrisma.routine.findFirst.mockImplementation(async (args: { select: { items?: object } }) =>
      args.select.items && "productId" in (args.select.items as { select: object }).select
        ? { id: "r1", petId: PET, items: [{ medicationCourseId: null, productId: ACTIVE }] }
        : null,
    );
    const res = await patch(ARCHIVED);
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.routineItem.createMany).not.toHaveBeenCalled();
  });
});
