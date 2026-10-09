import { describe, expect, it } from "vitest";
import { createdEventToTimeline, isGroupedWithPrevious } from "./timeline";
import { eventDetailLine } from "./eventDisplay";
import type { CreatedEvent, ProductSummary } from "./types";

const shampoo: ProductSummary = {
  id: "shampoo", name: "샴푸", brand: null, category: "HYGIENE",
  photoPath: null, dosage: null, isActive: true,
};
const conditioner: ProductSummary = { ...shampoo, id: "conditioner", name: "린스" };

function created(product?: ProductSummary): CreatedEvent {
  return {
    id: `event-${product?.id ?? "none"}`, petId: "pet", presetId: null,
    productId: product?.id, product, occurredAt: "2026-10-02T00:00:00Z",
    quantity: null, quantityOffered: null, unit: null,
    productName: product?.id === "shampoo" ? "bath" : null,
    entryId: "entry-care", costKrw: null, note: null, preset: null,
    eventType: { key: "care", label: "관리", icon: null },
  };
}

describe("createdEventToTimeline — 등록 직후 제품 연결", () => {
  it("관리 제품 두 건의 이름·연결과 묶음을 보존한다", () => {
    const rows = [shampoo, conditioner].map((product) => createdEventToTimeline(created(product)));
    expect(rows.map((row) => row.productId)).toEqual(["shampoo", "conditioner"]);
    expect(rows.map((row) => row.product)).toEqual([shampoo, conditioner]);
    expect(isGroupedWithPrevious(rows, 1)).toBe(true);
    expect(rows.map((row) => eventDetailLine(row, (key) => key))).toEqual([
      "eventTag.care.bath · 샴푸", "린스",
    ]);
  });

  it("저장 직후 다시 열어 수정해도 제품 ID가 null로 바뀌지 않는다", () => {
    const event = createdEventToTimeline(created(shampoo));
    const draftProductId = event.productId ?? null;
    expect(draftProductId).toBe("shampoo");
  });

  it("제품이 없는 기록은 연결을 만들지 않는다", () => {
    const event = createdEventToTimeline(created());
    expect(event.productId).toBeNull();
    expect(event.product).toBeNull();
    expect(eventDetailLine(event, (key) => key)).toBeNull();
  });

  it("복약 슬롯을 보존한다", () => {
    const event = createdEventToTimeline({ ...created(), doseSlotIndex: 2 });
    expect(event.doseSlotIndex).toBe(2);
    expect(createdEventToTimeline(created()).doseSlotIndex).toBeNull();
  });
});
