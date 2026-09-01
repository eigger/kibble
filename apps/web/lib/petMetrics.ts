/** garage analytics/page.tsx 패턴 — 클라이언트 집계용 순수 함수 */

export type AnalyticsPeriod = "1w" | "1m" | "6m" | "1y" | "all";

export type ChartGranularity = "day" | "week" | "month";

export type MetricEvent = {
  id: string;
  occurredAt: string;
  quantity: number | null;
  quantityOffered: number | null;
  scaleValue: number | null;
  eventType: { key: string; scaleType?: string | null };
};

export function periodStartDate(period: AnalyticsPeriod, now = new Date()): Date | null {
  if (period === "all") return null;
  const start = new Date(now);
  if (period === "1w") start.setDate(start.getDate() - 7);
  else if (period === "1m") start.setMonth(start.getMonth() - 1);
  else if (period === "6m") start.setMonth(start.getMonth() - 6);
  else if (period === "1y") start.setFullYear(start.getFullYear() - 1);
  return start;
}

export function granularityForPeriod(period: AnalyticsPeriod): ChartGranularity {
  if (period === "1w") return "day";
  if (period === "1m") return "week";
  return "month";
}

export function filterEventsByPeriod<T extends { occurredAt: string }>(
  events: T[],
  period: AnalyticsPeriod,
  now = new Date(),
): T[] {
  const start = periodStartDate(period, now);
  if (!start) return events;
  return events.filter((e) => new Date(e.occurredAt) >= start);
}

export function getGroupKey(d: Date, granularity: ChartGranularity): string {
  if (granularity === "day") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (granularity === "week") {
    const tmp = new Date(d);
    tmp.setHours(0, 0, 0, 0);
    tmp.setDate(tmp.getDate() - ((tmp.getDay() + 6) % 7));
    return `${tmp.getFullYear()}-${String(tmp.getMonth() + 1).padStart(2, "0")}-${String(tmp.getDate()).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatGroupLabel(
  key: string,
  granularity: ChartGranularity,
  localeTag: string,
): string {
  if (granularity === "day") {
    const [y, m, dd] = key.split("-").map(Number);
    return new Intl.DateTimeFormat(localeTag, { month: "numeric", day: "numeric" }).format(
      new Date(y, m - 1, dd),
    );
  }
  if (granularity === "week") {
    const [y, m, dd] = key.split("-").map(Number);
    const start = new Date(y, m - 1, dd);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const s = new Intl.DateTimeFormat(localeTag, { month: "numeric", day: "numeric" }).format(start);
    const e = new Intl.DateTimeFormat(localeTag, { month: "numeric", day: "numeric" }).format(end);
    return `${s}~${e}`;
  }
  const [y, mo] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(localeTag, { year: "2-digit", month: "short" }).format(
    new Date(y, mo - 1, 1),
  );
}

function decimalToNumber(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function weightChartPoints(
  events: MetricEvent[],
  localeTag: string,
): { label: string; weight: number }[] {
  return events
    .filter((e) => e.eventType.key === "weight" && decimalToNumber(e.quantity) != null)
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
    .map((e) => ({
      label: new Intl.DateTimeFormat(localeTag, { month: "numeric", day: "numeric" }).format(
        new Date(e.occurredAt),
      ),
      weight: decimalToNumber(e.quantity)!,
    }));
}

export function groupedQuantitySums(
  events: MetricEvent[],
  eventTypeKey: string,
  granularity: ChartGranularity,
  localeTag: string,
  options?: { includeOffered?: boolean },
): { label: string; consumed: number; offered: number | null }[] {
  const map = new Map<string, { consumed: number; offered: number }>();
  for (const e of events) {
    if (e.eventType.key !== eventTypeKey) continue;
    const consumed = decimalToNumber(e.quantity);
    const offered = decimalToNumber(e.quantityOffered);
    if (consumed == null && offered == null) continue;
    const key = getGroupKey(new Date(e.occurredAt), granularity);
    const entry = map.get(key) ?? { consumed: 0, offered: 0 };
    if (consumed != null) entry.consumed += consumed;
    if (offered != null) entry.offered += offered;
    map.set(key, entry);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, { consumed, offered }]) => ({
      label: formatGroupLabel(key, granularity, localeTag),
      consumed: Math.round(consumed * 10) / 10,
      offered: options?.includeOffered ? Math.round(offered * 10) / 10 : null,
    }));
}

export function groupedScaleAverage(
  events: MetricEvent[],
  eventTypeKey: string,
  granularity: ChartGranularity,
  localeTag: string,
): { label: string; avg: number }[] {
  const map = new Map<string, { sum: number; count: number }>();
  for (const e of events) {
    if (e.eventType.key !== eventTypeKey || e.scaleValue == null) continue;
    const key = getGroupKey(new Date(e.occurredAt), granularity);
    const entry = map.get(key) ?? { sum: 0, count: 0 };
    entry.sum += e.scaleValue;
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, { sum, count }]) => ({
      label: formatGroupLabel(key, granularity, localeTag),
      avg: Math.round((sum / count) * 10) / 10,
    }));
}

export function latestWeight(events: MetricEvent[]): number | null {
  const sorted = events
    .filter((e) => e.eventType.key === "weight" && decimalToNumber(e.quantity) != null)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return sorted.length > 0 ? decimalToNumber(sorted[0].quantity) : null;
}

export function avgDailyQuantity(events: MetricEvent[], eventTypeKey: string): number | null {
  const withQty = events.filter(
    (e) => e.eventType.key === eventTypeKey && decimalToNumber(e.quantity) != null,
  );
  if (withQty.length === 0) return null;
  const dayKeys = new Set(
    withQty.map((e) => getGroupKey(new Date(e.occurredAt), "day")),
  );
  const total = withQty.reduce((sum, e) => sum + decimalToNumber(e.quantity)!, 0);
  return Math.round((total / dayKeys.size) * 10) / 10;
}
