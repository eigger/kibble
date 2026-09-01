import { describe, expect, it } from "vitest";
import {
  avgDailyQuantity,
  filterEventsByPeriod,
  groupedQuantitySums,
  latestWeight,
  periodStartDate,
  weightChartPoints,
} from "./petMetrics";
import type { MetricEvent } from "./petMetrics";

function ev(
  key: string,
  occurredAt: string,
  quantity: number | null,
  quantityOffered: number | null = null,
): MetricEvent {
  return {
    id: occurredAt,
    occurredAt,
    quantity,
    quantityOffered,
    scaleValue: null,
    eventType: { key },
  };
}

describe("petMetrics", () => {
  it("filters events by 1w period", () => {
    const now = new Date("2026-09-01T12:00:00+09:00");
    const events = [
      ev("weight", "2026-08-20T10:00:00+09:00", 4),
      ev("weight", "2026-08-28T10:00:00+09:00", 4.1),
    ];
    const filtered = filterEventsByPeriod(events, "1w", now);
    expect(filtered).toHaveLength(1);
  });

  it("builds weight chart points in chronological order", () => {
    const points = weightChartPoints(
      [
        ev("weight", "2026-08-02T10:00:00+09:00", 4.2),
        ev("weight", "2026-08-01T10:00:00+09:00", 4.1),
      ],
      "ko-KR",
    );
    expect(points).toHaveLength(2);
    expect(points[0].weight).toBe(4.1);
    expect(points[1].weight).toBe(4.2);
  });

  it("groups meal quantities by day", () => {
    const grouped = groupedQuantitySums(
      [
        ev("meal", "2026-08-01T08:00:00+09:00", 30, 50),
        ev("meal", "2026-08-01T20:00:00+09:00", 40, 50),
      ],
      "meal",
      "day",
      "ko-KR",
      { includeOffered: true },
    );
    expect(grouped).toHaveLength(1);
    expect(grouped[0].consumed).toBe(70);
    expect(grouped[0].offered).toBe(100);
  });

  it("computes latest weight and avg daily water", () => {
    const events = [
      ev("weight", "2026-08-01T10:00:00+09:00", 4),
      ev("weight", "2026-08-03T10:00:00+09:00", 4.2),
      ev("water", "2026-08-01T10:00:00+09:00", 100),
      ev("water", "2026-08-02T10:00:00+09:00", 80),
    ];
    expect(latestWeight(events)).toBe(4.2);
    expect(avgDailyQuantity(events, "water")).toBe(90);
  });

  it("periodStartDate returns null for all", () => {
    expect(periodStartDate("all")).toBeNull();
  });
});
