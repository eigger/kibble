import { describe, expect, it } from "vitest";
import { createProductSchema, updateProductSchema } from "./product.js";

describe("createProductSchema", () => {
  it("requires only name and provides default category MEAL and isActive true", () => {
    const res = createProductSchema.safeParse({ name: "오리젠 캣앤키튼" });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.name).toBe("오리젠 캣앤키튼");
      expect(res.data.category).toBe("MEAL");
      expect(res.data.isActive).toBe(true);
    }
  });

  it("fails when name is empty", () => {
    expect(createProductSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createProductSchema.safeParse({}).success).toBe(false);
  });

  it("accepts all optional fields (dosage, ingredients, dates, cost, palatability, adverseReactions)", () => {
    const res = createProductSchema.safeParse({
      name: "닥터바이 안구 영양제",
      brand: "닥터바이",
      category: "SUPPLEMENT",
      dosage: "1일 1회 1포 식후 급여",
      ingredients: "루테인, 오메가3, 빌베리추출물",
      expiryDate: "2027-12-31T00:00:00.000Z",
      openedAt: "2026-09-01T00:00:00.000Z",
      purchaseDate: "2026-08-30T00:00:00.000Z",
      costKrw: 35000,
      purchaseUrl: "https://example.com/product/123",
      isActive: true,
      palatability: "HIGH",
      adverseReactions: ["눈물 완화", "기호성 좋음"],
      notes: "가루형태라 사료에 섞어주기 편함",
    });
    expect(res.success).toBe(true);
  });
});

describe("updateProductSchema", () => {
  it("rejects empty patch", () => {
    expect(updateProductSchema.safeParse({}).success).toBe(false);
  });

  it("accepts partial updates", () => {
    expect(updateProductSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateProductSchema.safeParse({ costKrw: 29000 }).success).toBe(true);
    expect(updateProductSchema.safeParse({ dosage: "1일 2회" }).success).toBe(true);
  });
});
