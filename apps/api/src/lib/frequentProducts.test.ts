import { describe, expect, it, vi } from "vitest";
import {
  eventTypeSupportsProductName,
  productNameIsTagList,
  productSuggestionsForPet,
} from "./frequentProducts.js";

describe("eventTypeSupportsProductName", () => {
  it("includes meal, treat, supplement, and remedy", () => {
    expect(eventTypeSupportsProductName("meal")).toBe(true);
    expect(eventTypeSupportsProductName("treat")).toBe(true);
    expect(eventTypeSupportsProductName("supplement")).toBe(true);
    expect(eventTypeSupportsProductName("remedy")).toBe(true);
  });

  it("includes care — 위생용품(모래·샴푸·치약)을 잇는다 (§7.20)", () => {
    expect(eventTypeSupportsProductName("care")).toBe(true);
  });

  it("excludes other types", () => {
    expect(eventTypeSupportsProductName("water")).toBe(false);
    expect(eventTypeSupportsProductName("poop")).toBe(false);
    expect(eventTypeSupportsProductName("observation")).toBe(false);
  });
});

describe("productNameIsTagList", () => {
  it("태그 타입에서는 productName이 slug 목록이라 제품 이름으로 채우지 않는다", () => {
    expect(productNameIsTagList("care")).toBe(true);
    expect(productNameIsTagList("observation")).toBe(true);
    expect(productNameIsTagList("vomit")).toBe(true);
  });

  it("이름 타입은 스냅샷 동기화(R92)를 그대로 받는다", () => {
    expect(productNameIsTagList("meal")).toBe(false);
    expect(productNameIsTagList("remedy")).toBe(false);
  });
});

describe("productSuggestionsForPet — query path", () => {
  function mockDb() {
    const db = {
      eventType: { findFirst: vi.fn(async () => ({ id: "et-id" })) },
      event: {
        findFirst: vi.fn(async () => ({
          productName: "toilet_clean,litter_change",
          productId: "p-litter",
          product: { id: "p-litter", name: "벤토나이트", dosage: null },
        })),
        findMany: vi.fn(async () => [{ productName: "dental,bath" }, { productName: "dental" }]),
      },
      product: {
        findMany: vi.fn(async () => [
          { id: "p-litter", name: "벤토나이트", brand: null, category: "HYGIENE", dosage: null, isActive: true },
        ]),
      },
    };
    return db;
  }

  it("care: HYGIENE 등록 제품만 주고, 이름 제안·빈도는 태그 CSV라 세지 않는다 (R149)", async () => {
    const db = mockDb();
    const result = await productSuggestionsForPet(db as never, {
      householdId: "hh",
      petId: "pet",
      eventTypeKey: "care",
      userId: "u1",
    });

    expect(db.product.findMany).toHaveBeenCalledTimes(1);
    const where = db.product.findMany.mock.calls[0][0].where as { category?: string; householdId?: string };
    expect(where.category).toBe("HYGIENE");
    expect(where.householdId).toBe("hh");
    expect(result.activeProducts.map((p) => p.id)).toEqual(["p-litter"]);

    expect(db.event.findFirst).not.toHaveBeenCalled();
    expect(db.event.findMany).not.toHaveBeenCalled();
    expect(result.lastProduct).toBeNull();
    expect(result.lastProductId).toBeNull();
    expect(result.frequent).toEqual([]);
  });

  it("meal: 이름 제안·빈도·MEAL 제품을 전부 준다", async () => {
    const db = mockDb();
    const result = await productSuggestionsForPet(db as never, {
      householdId: "hh",
      petId: "pet",
      eventTypeKey: "meal",
      userId: "u1",
    });

    const where = db.product.findMany.mock.calls[0][0].where as { category?: string };
    expect(where.category).toBe("MEAL");
    expect(result.lastProductId).toBe("p-litter");
    expect(result.lastItems).toHaveLength(1);
    expect(result.frequent[0]).toEqual({ productName: "dental,bath", count: 1 });
  });

  it("마지막 이벤트가 묶음이면 lastItems는 그 묶음 전부를 기록 순으로 준다 (§7.22)", async () => {
    const db = mockDb();
    db.event.findFirst = vi.fn(async () => ({
      id: "e2",
      entryId: "entry-1",
      productName: "오메가3",
      productId: "p-omega",
      quantity: "1",
      quantityOffered: null,
      unit: "정",
      product: { id: "p-omega", name: "오메가3", dosage: "하루 1정" },
    }));
    db.event.findMany = vi.fn(async (args: { where?: { entryId?: string } }) => {
      if (args.where?.entryId === "entry-1") {
        return [
          {
            id: "e1",
            entryId: "entry-1",
            productName: "유산균",
            productId: "p-lacto",
            quantity: { toNumber: () => 2 },
            quantityOffered: null,
            unit: "g",
            product: { id: "p-lacto", name: "유산균", dosage: null },
          },
          {
            id: "e2",
            entryId: "entry-1",
            productName: "오메가3",
            productId: "p-omega",
            quantity: "1",
            quantityOffered: null,
            unit: "정",
            product: { id: "p-omega", name: "오메가3", dosage: "하루 1정" },
          },
        ];
      }
      return [{ productName: "유산균" }];
    });

    const result = await productSuggestionsForPet(db as never, {
      householdId: "hh",
      petId: "pet",
      eventTypeKey: "supplement",
      userId: "u1",
    });

    const groupedCall = db.event.findMany.mock.calls.find(
      (c) => (c[0] as { where?: { entryId?: string } }).where?.entryId === "entry-1",
    );
    expect(groupedCall).toBeDefined();
    const where = (groupedCall![0] as { where: Record<string, unknown> }).where;
    expect(where.householdId).toBe("hh");
    expect(where.petId).toBe("pet");

    expect(result.lastItems).toEqual([
      { productId: "p-lacto", productName: "유산균", dosage: null, quantity: 2, quantityOffered: null, unit: "g" },
      { productId: "p-omega", productName: "오메가3", dosage: "하루 1정", quantity: 1, quantityOffered: null, unit: "정" },
    ]);
    // 옛 필드는 첫 항목과 같다
    expect(result.lastProduct).toBe("유산균");
    expect(result.lastProductId).toBe("p-lacto");
  });
});
