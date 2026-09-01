import { describe, expect, it } from "vitest";
import {
  TIMELINE_PAGE_SIZE,
  appendTimelinePage,
  insertTimelineEvent,
  timelineHasMore,
} from "./timeline.js";

describe("timeline pagination helpers", () => {
  it("appendTimelinePage dedupes by id", () => {
    const existing = [{ id: "a", occurredAt: "2026-01-02T00:00:00.000Z" }];
    const page = [
      { id: "a", occurredAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", occurredAt: "2026-01-01T00:00:00.000Z" },
    ];
    const { events, appended } = appendTimelinePage(existing, page);
    expect(appended).toBe(1);
    expect(events.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("timelineHasMore is false for short page", () => {
    expect(timelineHasMore(TIMELINE_PAGE_SIZE - 1)).toBe(false);
    expect(timelineHasMore(TIMELINE_PAGE_SIZE)).toBe(true);
  });

  it("insertTimelineEvent keeps sort order", () => {
    const events = [
      { id: "b", occurredAt: "2026-01-02T12:00:00.000Z" },
      { id: "c", occurredAt: "2026-01-01T12:00:00.000Z" },
    ];
    const restored = insertTimelineEvent(events, {
      id: "a",
      occurredAt: "2026-01-03T12:00:00.000Z",
    });
    expect(restored.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
});
