import { describe, expect, it } from "vitest";
import { serializeTodayEvent, type TodayEventRow } from "./todayEvents.js";

function row(overrides: Partial<TodayEventRow>): TodayEventRow {
  return {
    id: "e1",
    occurredAt: new Date("2026-10-07T01:00:00.000Z"),
    quantity: null,
    quantityOffered: null,
    unit: null,
    scaleValue: null,
    productName: null,
    note: null,
    doseSlotIndex: null,
    eventType: { key: "meal", label: "eventType.meal" },
    preset: { label: "eventType.meal" },
    product: null,
    course: null,
    ...overrides,
  };
}

describe("serializeTodayEvent", () => {
  it("keeps raw keys and adds labels resolved for the request locale", () => {
    const ko = serializeTodayEvent(row({}), "ko");
    expect(ko).toMatchObject({ label: "eventType.meal", presetName: "eventType.meal" });
    expect(ko.eventTypeLabel).toBe("사료");
    expect(ko.presetLabel).toBe("사료");
    expect(serializeTodayEvent(row({}), "en").eventTypeLabel).toBe("Meal");
  });

  it("passes custom labels through unchanged", () => {
    const e = serializeTodayEvent(
      row({ eventType: { key: "x", label: "산책 코스" }, preset: { label: "아침 산책" } }),
      "en",
    );
    expect(e.eventTypeLabel).toBe("산책 코스");
    expect(e.presetLabel).toBe("아침 산책");
  });

  it("splits tag-type productName into productTags and keeps productName raw", () => {
    const e = serializeTodayEvent(
      row({
        eventType: { key: "care", label: "eventType.care" },
        preset: null,
        productName: "brushing, 귀 청소",
      }),
      "ko",
    );
    expect(e.productName).toBe("brushing, 귀 청소");
    expect(e.productTags).toEqual(["brushing", "귀 청소"]);
    expect(e.productLabel).toBeNull();
    expect(e.presetLabel).toBeNull();
  });

  it("uses the product name for name-valued types", () => {
    const e = serializeTodayEvent(row({ product: { name: "사료A" } }), "ko");
    expect(e.productLabel).toBe("사료A");
    expect(e.productTags).toEqual([]);
  });
});
