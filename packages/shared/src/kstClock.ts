/** Phase 1 일 경계·파싱 시각 — WORKPLAN §7.11. KST(UTC+9) 고정. */
export const PHASE1_TODAY_UTC_OFFSET_MINUTES = 9 * 60;

export function startOfTodayBoundary(
  now = new Date(),
  offsetMinutes = PHASE1_TODAY_UTC_OFFSET_MINUTES,
): Date {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  return new Date(Date.UTC(y, m, d) - offsetMinutes * 60_000);
}

/** KST 달력 날짜(base) + dayOffset일의 hour:minute → UTC instant */
export function kstDateTime(
  base: Date,
  hour: number,
  minute: number,
  dayOffset = 0,
  offsetMinutes = PHASE1_TODAY_UTC_OFFSET_MINUTES,
): Date {
  const shifted = new Date(base.getTime() + offsetMinutes * 60_000);
  const anchor = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  );
  const kstMidnightUtc = anchor.getTime() - offsetMinutes * 60_000;
  const dayMs = dayOffset * 86_400_000;
  return new Date(kstMidnightUtc + dayMs + hour * 3_600_000 + minute * 60_000);
}

export function kstCalendarParts(base: Date, offsetMinutes = PHASE1_TODAY_UTC_OFFSET_MINUTES) {
  const shifted = new Date(base.getTime() + offsetMinutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
  };
}

/** KST 달력 날짜 키 — journal distinct-day 집계·낙관적 갱신용 */
export function kstDayKey(base: Date, offsetMinutes = PHASE1_TODAY_UTC_OFFSET_MINUTES): string {
  const p = kstCalendarParts(base, offsetMinutes);
  const month = String(p.month + 1).padStart(2, "0");
  const date = String(p.date).padStart(2, "0");
  return `${p.year}-${month}-${date}`;
}

/** KST 달력 날짜 기준 두 날짜 간의 일수 차이 (target - base) */
export function kstDayDiff(target: Date, base = new Date()): number {
  const targetKey = kstDayKey(target);
  const baseKey = kstDayKey(base);
  const targetMidnight = new Date(`${targetKey}T00:00:00.000Z`).getTime();
  const baseMidnight = new Date(`${baseKey}T00:00:00.000Z`).getTime();
  return Math.round((targetMidnight - baseMidnight) / 86_400_000);
}
