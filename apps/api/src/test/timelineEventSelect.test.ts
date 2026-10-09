import { readFileSync } from "node:fs";
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
  });

  it("이벤트 타입은 목록 표시에 쓰는 필드를 전부 싣는다", () => {
    expect(timelineEventSelect.eventType.select).toEqual({
      key: true,
      label: true,
      icon: true,
      color: true,
      scaleType: true,
      category: true,
    });
  });

  // 원래 버그는 라우트가 자기 select를 따로 들고 있던 것이다 — 두 라우트가 공유 select를 쓰는지 고정한다
  it.each(["../routes/events.ts", "../routes/home.ts"])("%s는 timelineEventSelect를 쓴다", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source).toMatch(/select:\s*timelineEventSelect\b/);
  });
});
