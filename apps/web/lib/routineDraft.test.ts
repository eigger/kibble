import { describe, expect, it } from "vitest";
import {
  buildItemPayload,
  draftFromItem,
  isRoutineTagType,
  isTagOnlyType,
  itemHasAmount,
  resetOnTypeChange,
  type ItemDraft,
} from "./routineDraft";
import type { PresetDetail, RoutineItem } from "./types";

function preset(key: string, id = `p_${key}`): PresetDetail {
  return {
    id,
    eventTypeId: `et_${key}`,
    label: `eventType.${key}`,
    eventType: { key, label: `eventType.${key}` },
  } as unknown as PresetDetail;
}

function draft(overrides: Partial<ItemDraft> = {}): ItemDraft {
  return {
    key: "k",
    presetId: "p",
    quantity: "",
    quantityOffered: "",
    unit: "",
    productId: "",
    courseId: "",
    tagIds: [],
    tagCustom: "",
    ...overrides,
  };
}

describe("routine tag types", () => {
  it("covers care/observation/vomit but not temperature or meal", () => {
    expect(isRoutineTagType("care")).toBe(true);
    expect(isRoutineTagType("observation")).toBe(true);
    expect(isRoutineTagType("vomit")).toBe(true);
    expect(isRoutineTagType("temperature")).toBe(false);
    expect(isRoutineTagType("meal")).toBe(false);
  });

  it("links products only for care", () => {
    expect(isTagOnlyType("care")).toBe(false);
    expect(isTagOnlyType("observation")).toBe(true);
    expect(isTagOnlyType("meal")).toBe(false);
  });

  it("hides amounts for tag types only", () => {
    expect(itemHasAmount("care")).toBe(false);
    expect(itemHasAmount("meal")).toBe(true);
    expect(itemHasAmount("temperature")).toBe(true);
  });
});

describe("buildItemPayload", () => {
  it("encodes tags and links the product for care", () => {
    const out = buildItemPayload(
      draft({ tagIds: ["litter_topup", "toilet_clean"], productId: "prod" }),
      preset("care"),
      "CAT",
    );
    expect(out.productName).toBe("litter_topup,toilet_clean");
    expect(out.productId).toBe("prod");
  });

  it("drops stale amount and unit that the form no longer shows", () => {
    const out = buildItemPayload(
      draft({ tagIds: ["litter_topup"], quantity: "10", unit: "g", quantityOffered: "12" }),
      preset("care"),
      "CAT",
    );
    expect(out.quantity).toBeNull();
    expect(out.quantityOffered).toBeNull();
    expect(out.unit).toBeNull();
  });

  it("drops tags hidden for the pet's species but keeps unknown custom text", () => {
    const out = buildItemPayload(
      draft({ tagIds: ["litter_topup", "toilet_clean"], tagCustom: "옛 메모" }),
      preset("care"),
      "DOG",
    );
    expect(out.productName).toBe("toilet_clean,옛 메모");
  });

  it("keeps every tag when the species is unknown", () => {
    const out = buildItemPayload(draft({ tagIds: ["litter_topup"] }), preset("care"), null);
    expect(out.productName).toBe("litter_topup");
  });

  it("sends null productName for non-tag types and keeps their amounts", () => {
    const out = buildItemPayload(
      draft({ quantity: "10", quantityOffered: "12", unit: "g", tagIds: ["x"] }),
      preset("meal"),
    );
    expect(out).toMatchObject({ productName: null, quantity: 10, quantityOffered: 12, unit: "g" });
  });

  it("sends only the course for medication", () => {
    expect(buildItemPayload(draft({ courseId: "c" }), preset("medication"))).toEqual({
      eventTypeId: "et_medication",
      presetId: "p_medication",
      medicationCourseId: "c",
    });
  });
});

describe("resetOnTypeChange", () => {
  it("clears type-specific values when the type changes", () => {
    expect(resetOnTypeChange(preset("meal"), preset("care"))).toMatchObject({
      tagIds: [],
      productId: "",
      quantity: "",
    });
  });

  it("keeps values when only the chip changes within the same type", () => {
    expect(resetOnTypeChange(preset("care", "a"), preset("care", "b"))).toEqual({});
  });
});

describe("draftFromItem", () => {
  const item = {
    id: "i",
    sortOrder: 0,
    eventTypeId: "et_care",
    presetId: "p_care",
    productId: null,
    productName: "litter_topup,옛값",
    quantity: null,
    quantityOffered: null,
    unit: null,
    eventType: { key: "care", label: "eventType.care", category: "CARE", defaultUnit: null },
    preset: null,
    product: null,
    medicationCourseId: null,
    course: null,
  } as RoutineItem;

  it("splits productName into known tags and custom text", () => {
    const d = draftFromItem(item, "k", "p_care");
    expect(d.tagIds).toEqual(["litter_topup"]);
    expect(d.tagCustom).toBe("옛값");
  });

  it("does not parse productName of non-tag types", () => {
    const d = draftFromItem(
      { ...item, eventType: { ...item.eventType, key: "meal" }, productName: "로얄캐닌" },
      "k",
      "p",
    );
    expect(d.tagIds).toEqual([]);
    expect(d.tagCustom).toBe("");
  });
});
