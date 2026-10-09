import { describe, expect, it } from "vitest";
import { timelineEventSelect } from "../services/createEvent.js";

// 이력(GET /api/events)과 빠른 기록(GET /api/home)이 같은 select를 쓴다 — 여기서 빠지면 양쪽이 같이 빠진다
describe("timelineEventSelect", () => {
  it("제품 연결·묶음·비용·진료처 좌표·복약 슬롯을 싣는다", () => {
    expect(timelineEventSelect).toMatchObject({
      productId: true,
      productName: true,
      entryId: true,
      costKrw: true,
      doseSlotIndex: true,
      doseOrdinal: true,
    });
    expect(timelineEventSelect.product.select).toMatchObject({ id: true, name: true, category: true });
    expect(timelineEventSelect.contact.select).toMatchObject({
      latitude: true,
      longitude: true,
      placeUrl: true,
    });
    expect(timelineEventSelect.eventType.select).toMatchObject({ key: true, color: true });
  });
});
