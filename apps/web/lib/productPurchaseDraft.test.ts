import { describe, expect, it } from "vitest";
import {
  dayToIso,
  normalizePurchaseUrl,
  purchaseDraftFromRow,
  purchaseDraftToPayload,
  repurchaseDraft,
} from "./productPurchaseDraft";
import type { ProductPurchase } from "./types";

const row: ProductPurchase = {
  id: "p1",
  productId: "prod",
  purchasedAt: "2026-03-01T03:00:00.000Z",
  costKrw: 35000,
  weightG: 2000,
  store: "동네 마트",
  purchaseUrl: "https://shop.example/a",
  manufacturedAt: "2026-01-10T03:00:00.000Z",
  expiryDate: "2027-01-10T03:00:00.000Z",
  openedAt: "2026-03-05T03:00:00.000Z",
  createdAt: "2026-03-01T03:00:00.000Z",
  updatedAt: "2026-03-01T03:00:00.000Z",
};

describe("repurchaseDraft", () => {
  it("가격·구매처·링크·중량은 이어받고, 구매일은 오늘, 기한 3종은 비운다", () => {
    const draft = repurchaseDraft(
      { costKrw: 35000, store: "동네 마트", purchaseUrl: "https://shop.example/a", weightG: 2000 },
      "2026-10-27",
    );
    expect(draft).toEqual({
      purchasedAt: "2026-10-27",
      cost: "35000",
      store: "동네 마트",
      url: "https://shop.example/a",
      weight: "2",
      weightUnit: "kg",
      manufacturedAt: "",
      expiryDate: "",
      openedAt: "",
    });
  });

  it("이전 구매가 없어도 열린다 — 오늘 날짜만 채워진다", () => {
    const draft = repurchaseDraft(null, "2026-10-27");
    expect(draft.purchasedAt).toBe("2026-10-27");
    expect(draft.cost).toBe("");
    expect(draft.weightUnit).toBe("kg");
  });

  it("1.25kg 같은 소수 중량이 g으로 둔갑하지 않는다", () => {
    expect(repurchaseDraft({ costKrw: null, purchaseUrl: null, weightG: 1250 }, "2026-10-27").weight).toBe("1.25");
  });
});

describe("purchaseDraftFromRow", () => {
  it("저장된 구매를 그대로 보여 준다 (KST 날짜)", () => {
    const draft = purchaseDraftFromRow(row);
    expect(draft.purchasedAt).toBe("2026-03-01");
    expect(draft.expiryDate).toBe("2027-01-10");
    expect(draft.openedAt).toBe("2026-03-05");
    expect(draft.store).toBe("동네 마트");
  });

  it("구매일 모름은 빈 칸", () => {
    expect(purchaseDraftFromRow({ ...row, purchasedAt: null }).purchasedAt).toBe("");
  });
});

describe("purchaseDraftToPayload", () => {
  it("빈 칸은 null로 보낸다 (K-12: 거부할 입력이 없다)", () => {
    const payload = purchaseDraftToPayload(repurchaseDraft(null, "2026-10-27"), true);
    expect(payload).toMatchObject({
      costKrw: null,
      store: null,
      purchaseUrl: null,
      weightG: null,
      expiryDate: null,
      openedAt: null,
    });
    expect(payload.purchasedAt).toBe(new Date("2026-10-27T12:00:00+09:00").toISOString());
  });

  it("중량 칸이 없는 카테고리는 weightG를 보내지 않는다", () => {
    expect(purchaseDraftToPayload(repurchaseDraft(null, "2026-10-27"), false)).not.toHaveProperty("weightG");
  });

  it("kg 입력을 g로 바꾼다", () => {
    const draft = { ...repurchaseDraft(null, "2026-10-27"), weight: "2.5", cost: "41000" };
    const payload = purchaseDraftToPayload(draft, true);
    expect(payload.weightG).toBe(2500);
    expect(payload.costKrw).toBe(41000);
  });
});

describe("normalizePurchaseUrl / dayToIso", () => {
  it("스킴이 없으면 https를 붙이고 실행 가능한 스킴은 버린다", () => {
    expect(normalizePurchaseUrl("shop.example/a")).toBe("https://shop.example/a");
    expect(normalizePurchaseUrl("http://shop.example")).toBe("http://shop.example");
    expect(normalizePurchaseUrl("javascript:alert(1)")).toBeNull();
    expect(normalizePurchaseUrl("  ")).toBeNull();
  });

  it("날짜 칸이 비면 null", () => {
    expect(dayToIso("")).toBeNull();
    expect(dayToIso("2026-10-27")).toBe("2026-10-27T03:00:00.000Z");
  });
});
