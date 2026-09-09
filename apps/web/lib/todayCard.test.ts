import { describe, expect, it } from "vitest";
import { formatAmount, relativeSince, todayCardValue } from "./todayCard";
import type { TodaySummaryRow, TodayUnitTotal } from "./types";

function row(overrides: Partial<TodaySummaryRow> & { totals: TodayUnitTotal[] }): TodaySummaryRow {
  return {
    eventTypeKey: "meal",
    label: "eventType.meal",
    category: "FEEDING",
    scaleType: null,
    defaultUnit: "g",
    count: 3,
    lastOccurredAt: "2026-09-09T04:00:00.000Z",
    lastScaleValue: null,
    ...overrides,
  };
}

describe("todayCardValue", () => {
  it("shows offered and consumed together when both were recorded", () => {
    expect(
      todayCardValue(
        row({ totals: [{ unit: "g", count: 3, quantity: 90, quantityOffered: 120 }] }),
      ),
    ).toEqual({ kind: "offeredConsumed", offered: 120, consumed: 90, unit: "g" });
  });

  it("falls back to the event type's default unit when the rows carry none", () => {
    expect(
      todayCardValue(
        row({
          defaultUnit: "ml",
          totals: [{ unit: null, count: 2, quantity: 250, quantityOffered: null }],
        }),
      ),
    ).toEqual({ kind: "amount", value: 250, unit: "ml" });
  });

  it("shows the offered amount when nothing was measured as consumed", () => {
    expect(
      todayCardValue(row({ totals: [{ unit: "g", count: 1, quantity: null, quantityOffered: 40 }] })),
    ).toEqual({ kind: "amount", value: 40, unit: "g" });
  });

  it("drops to a count rather than adding mixed units together", () => {
    expect(
      todayCardValue(
        row({
          count: 3,
          totals: [
            { unit: "개", count: 2, quantity: 3, quantityOffered: null },
            { unit: "g", count: 1, quantity: 40, quantityOffered: 40 },
          ],
        }),
      ),
    ).toEqual({ kind: "count", count: 3 });
  });

  it("counts types that carry no amount at all", () => {
    expect(
      todayCardValue(
        row({
          category: "EXCRETION",
          defaultUnit: null,
          count: 2,
          totals: [{ unit: null, count: 2, quantity: null, quantityOffered: null }],
        }),
      ),
    ).toEqual({ kind: "count", count: 2 });
  });

  it("keeps a zero amount — 0 is a measurement, not a missing value", () => {
    expect(
      todayCardValue(row({ totals: [{ unit: "g", count: 1, quantity: 0, quantityOffered: 40 }] })),
    ).toEqual({ kind: "offeredConsumed", offered: 40, consumed: 0, unit: "g" });
  });
});

describe("formatAmount", () => {
  it("trims the trailing zeros a Decimal sum brings", () => {
    expect(formatAmount(90)).toBe("90");
    expect(formatAmount(12.5)).toBe("12.5");
    expect(formatAmount(12.004)).toBe("12");
  });
});

describe("relativeSince", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");

  it("reads recent records as just now", () => {
    expect(relativeSince("2026-09-09T11:59:30.000Z", now)).toEqual({ key: "homeTodayJustNow" });
  });

  it("counts minutes, then hours", () => {
    expect(relativeSince("2026-09-09T11:20:00.000Z", now)).toEqual({
      key: "homeTodayMinutesAgo",
      params: { n: "40" },
    });
    expect(relativeSince("2026-09-09T09:00:00.000Z", now)).toEqual({
      key: "homeTodayHoursAgo",
      params: { n: "3" },
    });
  });

  it("gives up on records dated ahead of now instead of guessing", () => {
    expect(relativeSince("2026-09-09T13:00:00.000Z", now)).toBeNull();
    expect(relativeSince("nonsense", now)).toBeNull();
  });
});
