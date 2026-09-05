import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { invalidateHouseholdCache } from "../lib/householdScope.js";
import { invalidateTokenVersionCache } from "../lib/tokenVersion.js";

const HH = "household_a";
const USER = "user_a";
const PET = "pet_1";
const PRODUCT_ID = "product_1";

const mockPrisma = vi.hoisted(() => ({
  householdMember: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  pet: { findFirst: vi.fn() },
  eventType: { findFirst: vi.fn() },
  product: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  event: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

function jwt(app: FastifyInstance): string {
  return app.jwt.sign({ sub: USER, role: "ADMIN", tv: 1 }, { expiresIn: "1h" });
}

describe("productRoutes — 제품 등록 및 조회 API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateHouseholdCache(USER);
    invalidateTokenVersionCache(USER);

    mockPrisma.householdMember.findFirst.mockResolvedValue({ householdId: HH, role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });

    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/products는 가구의 제품 목록을 반환한다", async () => {
    const now = new Date();
    mockPrisma.product.findMany.mockResolvedValue([
      {
        id: PRODUCT_ID,
        householdId: HH,
        petId: null,
        name: "오리젠 캣앤키튼",
        brand: "오리젠",
        category: "MEAL",
        photoPath: null,
        purchaseUrl: "https://example.com",
        dosage: "1일 50g",
        ingredients: "닭고기, 연어",
        expiryDate: null,
        openedAt: null,
        purchaseDate: null,
        costKrw: 42000,
        isActive: true,
        palatability: "HIGH",
        adverseReactions: [],
        notes: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        pet: null,
      },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/products",
      headers: { authorization: `Bearer ${jwt(app)}` },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json).toHaveLength(1);
    expect(json[0].name).toBe("오리젠 캣앤키튼");
    expect(json[0].dosage).toBe("1일 50g");
  });

  it("POST /api/products는 제품을 등록한다", async () => {
    const now = new Date();
    mockPrisma.product.create.mockResolvedValue({
      id: PRODUCT_ID,
      householdId: HH,
      petId: null,
      name: "유산균 영양제",
      brand: null,
      category: "SUPPLEMENT",
      photoPath: null,
      purchaseUrl: null,
      dosage: "1일 1포",
      ingredients: "프로바이오틱스",
      expiryDate: null,
      openedAt: null,
      purchaseDate: null,
      costKrw: 25000,
      isActive: true,
      palatability: null,
      adverseReactions: [],
      notes: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      pet: null,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/products",
      headers: { authorization: `Bearer ${jwt(app)}` },
      payload: {
        name: "유산균 영양제",
        category: "SUPPLEMENT",
        dosage: "1일 1포",
        ingredients: "프로바이오틱스",
        costKrw: 25000,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(mockPrisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: HH,
          name: "유산균 영양제",
          category: "SUPPLEMENT",
          dosage: "1일 1포",
          costKrw: 25000,
        }),
      }),
    );
  });

  it("PATCH /api/products/:id는 제품 정보를 수정한다", async () => {
    const now = new Date();
    mockPrisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, householdId: HH });
    mockPrisma.product.update.mockResolvedValue({
      id: PRODUCT_ID,
      householdId: HH,
      name: "오리젠 수정본",
      category: "MEAL",
      isActive: false,
      createdAt: now,
      updatedAt: now,
      pet: null,
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/products/${PRODUCT_ID}`,
      headers: { authorization: `Bearer ${jwt(app)}` },
      payload: { name: "오리젠 수정본", isActive: false },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PRODUCT_ID },
        data: expect.objectContaining({ name: "오리젠 수정본", isActive: false }),
      }),
    );
  });

  it("DELETE /api/products/:id는 제품을 보관(soft-delete) 처리한다", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, householdId: HH });
    mockPrisma.product.update.mockResolvedValue({});

    const res = await app.inject({
      method: "DELETE",
      url: `/api/products/${PRODUCT_ID}`,
      headers: { authorization: `Bearer ${jwt(app)}` },
    });

    expect(res.statusCode).toBe(204);
    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PRODUCT_ID },
        data: expect.objectContaining({ isActive: false }),
      }),
    );
  });
});
