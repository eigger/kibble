import { describe, expect, it, vi } from "vitest";
import { TIMELINE_PAGE_SIZE } from "@kibble/shared";
import { timelineEventsPath } from "./timeline";

vi.mock("./api", () => ({
  apiJson: vi.fn(),
}));

describe("timelineEventsPath", () => {
  it("builds cursor query for pagination", () => {
    const path = timelineEventsPath("pet1", { occurredAt: "2026-01-01T00:00:00.000Z", id: "evt9" });
    expect(path).toContain("petId=pet1");
    expect(path).toContain(`limit=${TIMELINE_PAGE_SIZE}`);
    expect(path).toContain("before=2026-01-01T00%3A00%3A00.000Z");
    expect(path).toContain("beforeId=evt9");
  });

  it("includes period filter when set", () => {
    const path = timelineEventsPath("pet1", undefined, TIMELINE_PAGE_SIZE, "2026-09");
    expect(path).toContain("period=2026-09");
  });
});

describe("timelineEventsPath — 종류 필터", () => {
  it("종류를 고르면 eventTypeKey를 싣는다", () => {
    const path = timelineEventsPath("pet1", undefined, 30, undefined, "meal");
    expect(path).toContain("eventTypeKey=meal");
  });

  it("안 고르면 파라미터를 안 붙인다", () => {
    expect(timelineEventsPath("pet1")).not.toContain("eventTypeKey");
    expect(timelineEventsPath("pet1", undefined, 30, undefined, "")).not.toContain("eventTypeKey");
  });

  it("더 보기(커서)에서도 종류가 유지된다 — 안 그러면 2페이지부터 필터가 풀린다", () => {
    const path = timelineEventsPath(
      "pet1",
      { occurredAt: "2026-09-05T00:00:00.000Z", id: "e1" },
      30,
      "2026-09",
      "poop",
    );
    expect(path).toContain("eventTypeKey=poop");
    expect(path).toContain("period=2026-09");
    expect(path).toContain("beforeId=e1");
  });
});
