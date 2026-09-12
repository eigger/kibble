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
    expect(result.frequent[0]).toEqual({ productName: "dental,bath", count: 1 });
  });
});
