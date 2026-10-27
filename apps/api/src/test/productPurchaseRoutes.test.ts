import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";

const HH = "household_a";
const USER = "user_a";
const PRODUCT_ID = "product_1";

const mockPrisma = vi.hoisted(() => {
  const client = {
    householdMember: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    pet: { findFirst: vi.fn() },
    product: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    productPurchase: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    $transaction: vi.fn(),
  };
  return client;
});

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

function jwt(app: FastifyInstance): string {
  return app.jwt.sign({ sub: USER, role: "ADMIN", tv: 1 }, { expiresIn: "1h" });
}

const d = (iso: string) => new Date(`${iso}T03:00:00.000Z`);

function purchaseRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    householdId: HH,
    productId: PRODUCT_ID,
    purchasedAt: d("2026-03-01"),
    costKrw: 20000,
    weightG: null,
    store: null,
    purchaseUrl: null,
    manufacturedAt: null,
    expiryDate: null,
    openedAt: null,
    createdAt: d("2026-03-01"),
    updatedAt: d("2026-03-01"),
    ...over,
  };
}

function productRow(over: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    householdId: HH,
    petId: null,
    name: "사료",
    brand: null,
    category: "MEAL",
    photoPath: null,
    purchaseUrl: null,
    origin: null,
    form: null,
    kibbleSize: null,
    weightG: null,
    flavor: null,
    ingredientRegistrationNo: null,
    registeredIngredients: null,
    importer: null,
    manufacturedAt: null,
    storage: null,
    usage: null,
    dosage: null,
    mainIngredients: null,
    ingredients: null,
    expiryDate: null,
    openedAt: null,
    purchaseDate: d("2026-01-01"),
    costKrw: 15000,
    isActive: true,
    palatability: null,
    adverseReactions: [],
    notes: null,
    archivedAt: null,
    createdAt: d("2026-01-01"),
    updatedAt: d("2026-01-01"),
    pet: null,
    _count: { purchases: 1 },
    ...over,
  };
}

describe("productPurchase routes — 다시 구매", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateHouseholdCache(USER);
    invalidateTokenVersionCache(USER);
    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH, role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma));
    mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.productPurchase.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.productPurchase.deleteMany.mockResolvedValue({ count: 1 });
    app = await buildApp({ logger: false });
  });

  function req(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) {
    return app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${jwt(app)}` },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
  }

  it("POST: 구매 행을 만들고 같은 트랜잭션에서 스냅샷을 다시 계산한다", async () => {
    mockPrisma.product.findFirst
      .mockResolvedValueOnce({ id: PRODUCT_ID, archivedAt: null })
      .mockResolvedValueOnce(productRow({ costKrw: 18000, _count: { purchases: 2 } }));
    const created = purchaseRow("p2", { costKrw: 18000, weightG: 2000, purchaseUrl: "https://shop.example/a" });
    mockPrisma.productPurchase.create.mockResolvedValue(created);
    mockPrisma.productPurchase.findMany.mockResolvedValue([purchaseRow("p1", { purchasedAt: d("2026-01-01") }), created]);

    const res = await req("POST", `/api/products/${PRODUCT_ID}/purchases`, {
      purchasedAt: "2026-03-01T03:00:00.000Z",
      costKrw: 18000,
      weightG: 2000,
      purchaseUrl: "https://shop.example/a",
    });

    expect(res.statusCode).toBe(201);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.productPurchase.create.mock.calls[0][0].data).toMatchObject({
      householdId: HH,
      productId: PRODUCT_ID,
      costKrw: 18000,
    });
    // 스냅샷: 최신 구매의 가격, 최신이므로 규격(중량·링크)도 Product로 옮긴다
    expect(mockPrisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID, householdId: HH },
      data: expect.objectContaining({ costKrw: 18000, weightG: 2000, purchaseUrl: "https://shop.example/a" }),
    });
    expect(res.json().product.purchaseCount).toBe(2);
  });

  it("POST: 본문이 비어도 저장된다 — 구매일은 지금 (K-12)", async () => {
    mockPrisma.product.findFirst
      .mockResolvedValueOnce({ id: PRODUCT_ID, archivedAt: null })
      .mockResolvedValueOnce(productRow());
    mockPrisma.productPurchase.create.mockResolvedValue(purchaseRow("p2"));
    mockPrisma.productPurchase.findMany.mockResolvedValue([purchaseRow("p2")]);

    const res = await req("POST", `/api/products/${PRODUCT_ID}/purchases`, {});
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.productPurchase.create.mock.calls[0][0].data.purchasedAt).toBeInstanceOf(Date);
  });

  it("POST: 구매일을 명시적 null로 보내면 모름으로 저장한다", async () => {
    mockPrisma.product.findFirst
      .mockResolvedValueOnce({ id: PRODUCT_ID, archivedAt: null })
      .mockResolvedValueOnce(productRow());
    mockPrisma.productPurchase.create.mockResolvedValue(purchaseRow("p2", { purchasedAt: null }));
    mockPrisma.productPurchase.findMany.mockResolvedValue([purchaseRow("p2", { purchasedAt: null })]);

    const res = await req("POST", `/api/products/${PRODUCT_ID}/purchases`, { purchasedAt: null });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.productPurchase.create.mock.calls[0][0].data.purchasedAt).toBeNull();
  });

  it("POST: 보관된 제품을 다시 사면 복원한다", async () => {
    mockPrisma.product.findFirst
      .mockResolvedValueOnce({ id: PRODUCT_ID, archivedAt: d("2026-02-01") })
      .mockResolvedValueOnce(productRow());
    mockPrisma.productPurchase.create.mockResolvedValue(purchaseRow("p2"));
    mockPrisma.productPurchase.findMany.mockResolvedValue([purchaseRow("p2")]);

    const res = await req("POST", `/api/products/${PRODUCT_ID}/purchases`, {});
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID, householdId: HH },
      data: { archivedAt: null, isActive: true },
    });
  });

  it("POST: 음수 가격은 400", async () => {
    const res = await req("POST", `/api/products/${PRODUCT_ID}/purchases`, { costKrw: -1 });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.productPurchase.create).not.toHaveBeenCalled();
  });

  it("GET: 최신순으로 내려주고 쓰지 않는다 (K-7)", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID });
    mockPrisma.productPurchase.findMany.mockResolvedValue([
      purchaseRow("old", { purchasedAt: d("2025-01-01") }),
      purchaseRow("new", { purchasedAt: d("2026-05-01") }),
      purchaseRow("unknown", { purchasedAt: null }),
    ]);

    const res = await req("GET", `/api/products/${PRODUCT_ID}/purchases`);
    expect(res.statusCode).toBe(200);
    expect(res.json().map((r: { id: string }) => r.id)).toEqual(["new", "old", "unknown"]);
    expect(mockPrisma.productPurchase.create).not.toHaveBeenCalled();
    expect(mockPrisma.productPurchase.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("DELETE: 지우고 스냅샷을 다시 계산한다 — 마지막 구매면 null로", async () => {
    mockPrisma.productPurchase.findFirst.mockResolvedValue({ id: "p1" });
    mockPrisma.productPurchase.findMany.mockResolvedValue([]);

    const res = await req("DELETE", `/api/products/${PRODUCT_ID}/purchases/p1`);
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID, householdId: HH },
      data: {
        purchaseDate: null,
        costKrw: null,
        manufacturedAt: null,
        expiryDate: null,
        openedAt: null,
      },
    });
  });

  it("PATCH(구매): 오래된 구매를 고쳐도 최신 구매의 규격은 건드리지 않는다", async () => {
    mockPrisma.productPurchase.findFirst
      .mockResolvedValueOnce({ id: "old" })
      .mockResolvedValueOnce(purchaseRow("old", { weightG: 500 }));
    mockPrisma.product.findFirst.mockResolvedValue(productRow());
    mockPrisma.productPurchase.findMany.mockResolvedValue([
      purchaseRow("old", { purchasedAt: d("2025-01-01"), weightG: 500 }),
      purchaseRow("new", { purchasedAt: d("2026-05-01") }),
    ]);

    const res = await req("PATCH", `/api/products/${PRODUCT_ID}/purchases/old`, { weightG: 500 });
    expect(res.statusCode).toBe(200);
    const data = mockPrisma.product.updateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("weightG");
  });
});

describe("products PATCH/POST — 구매 이력과의 동기화", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateHouseholdCache(USER);
    invalidateTokenVersionCache(USER);
    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH, role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma));
    mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.productPurchase.updateMany.mockResolvedValue({ count: 1 });
    app = await buildApp({ logger: false });
  });

  function patch(payload: object) {
    return app.inject({
      method: "PATCH",
      url: `/api/products/${PRODUCT_ID}`,
      headers: { authorization: `Bearer ${jwt(app)}` },
      payload,
    });
  }

  it("구매가 2건 이상이면 구매·기한 5칸을 무시한다 (거부하지 않는다)", async () => {
    mockPrisma.product.findFirst.mockResolvedValue(productRow({ _count: { purchases: 2 } }));
    mockPrisma.productPurchase.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);

    const res = await patch({ name: "새 이름", costKrw: 1, purchaseDate: "2026-06-01T03:00:00.000Z", expiryDate: null });
    expect(res.statusCode).toBe(200);
    const data = mockPrisma.product.updateMany.mock.calls[0][0].data;
    expect(data).toEqual({ name: "새 이름" });
    expect(mockPrisma.productPurchase.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.productPurchase.create).not.toHaveBeenCalled();
  });

  it("구매가 1건이면 바뀐 필드만 그 행에 옮긴다", async () => {
    mockPrisma.product.findFirst.mockResolvedValue(productRow());
    mockPrisma.productPurchase.findMany.mockResolvedValue([{ id: "only" }]);

    const res = await patch({ costKrw: 17000, purchaseDate: "2026-01-01T03:00:00.000Z" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.productPurchase.updateMany).toHaveBeenCalledWith({
      where: { id: "only", productId: PRODUCT_ID, householdId: HH },
      data: { costKrw: 17000 },
    });
    // Product에는 보낸 값 그대로
    expect(mockPrisma.product.updateMany.mock.calls[0][0].data.costKrw).toBe(17000);
  });

  it("바뀐 값이 없는 저장(이름만 고침, 같은 날짜 재전송)은 구매 행을 건드리지 않는다", async () => {
    mockPrisma.product.findFirst.mockResolvedValue(productRow());
    mockPrisma.productPurchase.findMany.mockResolvedValue([{ id: "only" }]);

    // 저장된 값은 09:00(KST) 시각이어도 같은 KST 날짜면 같은 값이다
    const res = await patch({ name: "이름만", costKrw: 15000, purchaseDate: "2026-01-01T12:00:00+09:00" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.productPurchase.updateMany).not.toHaveBeenCalled();
  });

  it("구매가 없던 제품이 처음 값을 얻으면 첫 구매 1행을 만든다 (구매일은 모름)", async () => {
    mockPrisma.product.findFirst.mockResolvedValue(
      productRow({ purchaseDate: null, costKrw: null, _count: { purchases: 0 } }),
    );
    mockPrisma.productPurchase.findMany.mockResolvedValue([]);

    const res = await patch({ costKrw: 9900 });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.productPurchase.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.productPurchase.create.mock.calls[0][0].data).toMatchObject({
      householdId: HH,
      productId: PRODUCT_ID,
      costKrw: 9900,
      purchasedAt: null,
    });
  });

  it("구매가 없는데 값을 비우기만 하면 행을 만들지 않는다", async () => {
    mockPrisma.product.findFirst.mockResolvedValue(
      productRow({ purchaseDate: null, costKrw: 100, _count: { purchases: 0 } }),
    );
    mockPrisma.productPurchase.findMany.mockResolvedValue([]);

    const res = await patch({ costKrw: null });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.productPurchase.create).not.toHaveBeenCalled();
  });

  it("POST: 구매 값을 넣어 만든 제품은 첫 구매 행을 함께 만든다", async () => {
    mockPrisma.product.create.mockResolvedValue(productRow());
    const res = await app.inject({
      method: "POST",
      url: "/api/products",
      headers: { authorization: `Bearer ${jwt(app)}` },
      payload: { name: "사료", costKrw: 12000, purchaseDate: "2026-02-01T03:00:00.000Z" },
    });
    expect(res.statusCode).toBe(201);
    const data = mockPrisma.product.create.mock.calls[0][0].data;
    expect(data.purchases.create).toMatchObject({ householdId: HH, costKrw: 12000 });
  });

  it("POST: 구매 값이 없으면 구매 행을 만들지 않는다", async () => {
    mockPrisma.product.create.mockResolvedValue(productRow());
    await app.inject({
      method: "POST",
      url: "/api/products",
      headers: { authorization: `Bearer ${jwt(app)}` },
      payload: { name: "장난감", category: "OTHER" },
    });
    expect(mockPrisma.product.create.mock.calls[0][0].data).not.toHaveProperty("purchases");
  });
});
