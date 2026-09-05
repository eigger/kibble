import { describe, expect, it } from "vitest";
import {
  createProductSchema,
  hasFormDetails,
  kibbleSizeForForm,
  nextPrimaryPhotoPath,
  formatWeightG,
  weightToInput,
  updateProductSchema,
  WEIGHT_G_MAX,
  weightToGrams,
} from "./product.js";

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

  it("rejects dangerous URL schemes for purchaseUrl", () => {
    expect(
      createProductSchema.safeParse({
        name: "Test",
        purchaseUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);

    expect(
      createProductSchema.safeParse({
        name: "Test",
        purchaseUrl: "java\nscript:alert(1)",
      }).success,
    ).toBe(false);

    expect(
      createProductSchema.safeParse({
        name: "Test",
        purchaseUrl: "blob:https://example.com/uuid",
      }).success,
    ).toBe(false);

    expect(
      createProductSchema.safeParse({
        name: "Test",
        purchaseUrl: "data:text/html,<script>alert(1)</script>",
      }).success,
    ).toBe(false);

    const valid = createProductSchema.safeParse({
      name: "Test",
      purchaseUrl: "https://coupang.com/vp/123",
    });
    expect(valid.success).toBe(true);

    const empty = createProductSchema.safeParse({
      name: "Test",
      purchaseUrl: "",
    });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.purchaseUrl).toBeNull();
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

describe("제형·입자크기·중량", () => {
  it("건식이 아니면 입자크기를 남기지 않는다", () => {
    expect(kibbleSizeForForm("DRY", "SMALL")).toBe("SMALL");
    expect(kibbleSizeForForm("WET", "SMALL")).toBeNull();
    expect(kibbleSizeForForm("CAPSULE", "LARGE")).toBeNull();
    expect(kibbleSizeForForm(null, "SMALL")).toBeNull();
    expect(kibbleSizeForForm("DRY", null)).toBeNull();
  });

  it("제형·중량은 사료·영양제·간식에만 묻는다", () => {
    expect(hasFormDetails("MEAL")).toBe(true);
    expect(hasFormDetails("SUPPLEMENT")).toBe(true);
    expect(hasFormDetails("TREAT")).toBe(true);
    expect(hasFormDetails("HYGIENE")).toBe(false);
    expect(hasFormDetails("DEVICE")).toBe(false);
    expect(hasFormDetails("OTHER")).toBe(false);
  });

  it("중량은 g 정수만 받는다", () => {
    expect(createProductSchema.safeParse({ name: "a", weightG: 2000 }).success).toBe(true);
    expect(createProductSchema.safeParse({ name: "a", weightG: -1 }).success).toBe(false);
    expect(createProductSchema.safeParse({ name: "a", weightG: 1.5 }).success).toBe(false);
    expect(createProductSchema.safeParse({ name: "a", weightG: WEIGHT_G_MAX + 1 }).success).toBe(false);
  });

  it("모르는 제형·입자크기는 거절한다", () => {
    expect(createProductSchema.safeParse({ name: "a", form: "FREEZE_DRIED" }).success).toBe(false);
    expect(createProductSchema.safeParse({ name: "a", kibbleSize: "TINY" }).success).toBe(false);
    expect(createProductSchema.safeParse({ name: "a", form: "WET" }).success).toBe(true);
  });
});

describe("weightToGrams / formatWeightG", () => {
  it("kg 입력을 g으로 바꾼다", () => {
    expect(weightToGrams("2", "kg")).toBe(2000);
    expect(weightToGrams("2.5", "kg")).toBe(2500);
    expect(weightToGrams("400", "g")).toBe(400);
  });

  it("비었거나 숫자가 아니면 null", () => {
    expect(weightToGrams("", "kg")).toBeNull();
    expect(weightToGrams("  ", "g")).toBeNull();
    expect(weightToGrams("abc", "kg")).toBeNull();
    expect(weightToGrams("-1", "kg")).toBeNull();
    expect(weightToGrams("0", "kg")).toBeNull();
  });

  it("상한을 넘지 않는다", () => {
    expect(weightToGrams("99999", "kg")).toBe(WEIGHT_G_MAX);
  });

  it("사람이 사는 단위로 되돌린다", () => {
    expect(formatWeightG(2000)).toBe("2kg");
    expect(formatWeightG(2500)).toBe("2.5kg");
    expect(formatWeightG(400)).toBe("400g");
    expect(formatWeightG(1250)).toBe("1.25kg");
    expect(formatWeightG(null)).toBeNull();
    expect(formatWeightG(0)).toBeNull();
  });

  it("입력 → 저장 → 표시가 왕복한다", () => {
    for (const [raw, unit] of [["2", "kg"], ["2.5", "kg"], ["400", "g"]] as const) {
      const g = weightToGrams(raw, unit);
      expect(formatWeightG(g)).toBe(`${raw}${unit}`);
    }
  });
});

describe("nextPrimaryPhotoPath", () => {
  it("남은 사진 중 정렬이 가장 앞선 것을 대표로 올린다", () => {
    expect(
      nextPrimaryPhotoPath([
        { path: "b.webp", sortOrder: 2 },
        { path: "a.webp", sortOrder: 1 },
      ]),
    ).toBe("a.webp");
  });

  it("남은 사진이 없으면 대표도 없다", () => {
    expect(nextPrimaryPhotoPath([])).toBeNull();
  });

  it("입력 배열을 뒤집지 않는다", () => {
    const rows = [
      { path: "b.webp", sortOrder: 2 },
      { path: "a.webp", sortOrder: 1 },
    ];
    nextPrimaryPhotoPath(rows);
    expect(rows[0].path).toBe("b.webp");
  });
});

describe("weightToInput", () => {
  it("소수점을 잃지 않고 입력 칸으로 되돌린다", () => {
    expect(weightToInput(2500)).toEqual({ value: "2.5", unit: "kg" });
    expect(weightToInput(1250)).toEqual({ value: "1.25", unit: "kg" });
    expect(weightToInput(2000)).toEqual({ value: "2", unit: "kg" });
    expect(weightToInput(400)).toEqual({ value: "400", unit: "g" });
    expect(weightToInput(null)).toEqual({ value: "", unit: "kg" });
  });

  it("입력 → 저장 → 입력이 왕복한다", () => {
    for (const [raw, unit] of [["2", "kg"], ["2.5", "kg"], ["1.25", "kg"], ["400", "g"]] as const) {
      const grams = weightToGrams(raw, unit);
      expect(weightToInput(grams)).toEqual({ value: raw, unit });
    }
  });
});
