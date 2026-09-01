import { kstDateTime } from "./kstClock.js";

export type DateRange = { gte: Date; lt: Date };

/** KST 달력 기준 반개구간 [gte, lt). garage parsePeriodRange와 동일한 period 형식. */
export function parseKstPeriodRange(period: string): DateRange | null {
  if (/^\d{4}$/.test(period)) {
    const year = Number(period);
    if (!Number.isFinite(year)) return null;
    const gte = kstDateTime(new Date(Date.UTC(year, 0, 1, 12, 0, 0)), 0, 0, 0);
    const lt = kstDateTime(new Date(Date.UTC(year + 1, 0, 1, 12, 0, 0)), 0, 0, 0);
    return { gte, lt };
  }

  if (/^\d{4}-\d{2}$/.test(period)) {
    const year = Number(period.slice(0, 4));
    const month = Number(period.slice(5, 7));
    if (month < 1 || month > 12) return null;
    const gte = kstDateTime(new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)), 0, 0, 0);
    const lt = kstDateTime(new Date(Date.UTC(year, month, 1, 12, 0, 0)), 0, 0, 0);
    return { gte, lt };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    const year = Number(period.slice(0, 4));
    const month = Number(period.slice(5, 7));
    const day = Number(period.slice(8, 10));
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (anchor.getUTCFullYear() !== year || anchor.getUTCMonth() !== month - 1 || anchor.getUTCDate() !== day) {
      return null;
    }
    const gte = kstDateTime(anchor, 0, 0, 0);
    const lt = kstDateTime(anchor, 0, 0, 1);
    return { gte, lt };
  }

  return null;
}

export function periodRangeFromQuery(query: { period?: string; date?: string }): DateRange | null {
  const raw = query.period?.trim() || query.date?.trim();
  if (!raw) return null;
  return parseKstPeriodRange(raw);
}
