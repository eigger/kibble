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
});
