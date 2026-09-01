import { kstDayKey } from "./kstClock.js";

export type JournalStats = {
  totalEventCount: number;
  /** KST distinct days; 4 = four or more (§3.8 copy only needs 1–3). */
  distinctDayCount: number;
};

export function journalInsightMessage(
  stats: JournalStats,
  t: (key: string, vars?: Record<string, string>) => string,
): string | null {
  if (stats.totalEventCount === 0) return null;
  if (stats.distinctDayCount === 3) return t("homeJournalInsightTrends");
  if (stats.distinctDayCount >= 4) return null;
  if (stats.totalEventCount === 1) return t("homeJournalInsightFirst");
  return t("homeJournalInsightProgress", { days: String(stats.distinctDayCount) });
}

/** 낙관적 갱신 — 최신 이벤트 시각만 알 때; 전체 일수는 서버 journalStats가 진실. */
export function bumpJournalStats(
  prev: JournalStats,
  occurredAt: string,
  latestOccurredAt: string | null,
): JournalStats {
  const totalEventCount = prev.totalEventCount + 1;
  if (prev.distinctDayCount >= 4) {
    return { totalEventCount, distinctDayCount: prev.distinctDayCount };
  }
  const newDay = kstDayKey(new Date(occurredAt));
  if (latestOccurredAt == null) {
    return { totalEventCount, distinctDayCount: 1 };
  }
  const latestDay = kstDayKey(new Date(latestOccurredAt));
  if (newDay === latestDay) {
    return { totalEventCount, distinctDayCount: prev.distinctDayCount };
  }
  return {
    totalEventCount,
    distinctDayCount: Math.min(prev.distinctDayCount + 1, 4),
  };
}
