import { describe, expect, it } from "vitest";
import { applyPosterStatuses, pendingPosterIds } from "./videoPosterRefresh";
import type { EventAttachment, TimelineEvent } from "./types";

function attachment(over: Partial<EventAttachment> & { id: string }): EventAttachment {
  return {
    path: "events/x",
    mime: "video/mp4",
    size: 1,
    width: null,
    height: null,
    posterPath: null,
    transcodeStatus: "pending",
    ...over,
  };
}

function timelineEvent(id: string, attachments: EventAttachment[]): TimelineEvent {
  return { id, attachments } as unknown as TimelineEvent;
}

describe("pendingPosterIds", () => {
  it("collects video attachments that still have no poster", () => {
    const events = [
      timelineEvent("e1", [attachment({ id: "b" }), attachment({ id: "a" })]),
      timelineEvent("e2", [attachment({ id: "c", posterPath: "events/c-poster.jpg" })]),
      timelineEvent("e3", [attachment({ id: "d", mime: "image/jpeg" })]),
    ];
    expect(pendingPosterIds(events)).toEqual(["a", "b"]);
  });

  it("keeps asking for failed transcodes — the poster is extracted separately", () => {
    const events = [timelineEvent("e1", [attachment({ id: "a", transcodeStatus: "failed" })])];
    expect(pendingPosterIds(events)).toEqual(["a"]);
  });

  it("returns nothing when there are no attachments", () => {
    expect(pendingPosterIds([{ id: "e1" } as TimelineEvent])).toEqual([]);
  });
});

describe("applyPosterStatuses", () => {
  it("fills the poster in place without touching other events", () => {
    const events = [
      timelineEvent("e1", [attachment({ id: "a" })]),
      timelineEvent("e2", [attachment({ id: "b" })]),
    ];
    const next = applyPosterStatuses(events, [
      { id: "a", posterPath: "events/a-poster.jpg", transcodeStatus: "ready" },
    ]);

    expect(next[0].attachments?.[0]).toMatchObject({
      posterPath: "events/a-poster.jpg",
      transcodeStatus: "ready",
    });
    // 손대지 않은 이벤트는 같은 참조로 남는다
    expect(next[1]).toBe(events[1]);
  });

  it("returns the same array when nothing changed", () => {
    const events = [timelineEvent("e1", [attachment({ id: "a" })])];
    expect(applyPosterStatuses(events, [{ id: "a", posterPath: null, transcodeStatus: "pending" }])).toBe(
      events,
    );
    expect(applyPosterStatuses(events, [])).toBe(events);
  });

  it("ignores ids that are not on screen", () => {
    const events = [timelineEvent("e1", [attachment({ id: "a" })])];
    expect(applyPosterStatuses(events, [{ id: "zzz", posterPath: "events/z.jpg" }])).toBe(events);
  });
});
