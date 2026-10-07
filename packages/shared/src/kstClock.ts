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

/**
 * 오늘(KST) 안에 시작했거나 이미 시작한 처방의 시작일 상한 — `startDate < 이 값`. 처방 시작일은 그날
 * KST 정오로 저장되므로 시각이 아니라 날짜로 본다. 서버(진행 중 목록·리마인더)와 오프라인 스냅샷을
 * 그리는 클라이언트가 같은 규칙을 쓴다.
 */
export function courseStartsByTodayBefore(now = new Date()): Date {
  return new Date(startOfTodayBoundary(now).getTime() + 86_400_000);
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
