import { kstDateTime } from "./kstClock.js";

/** P1-24 시각 빠른 버튼 — `docs/parsing-benchmark-public.md` 상대 시각 표와 동일 */
export type QuickTimeKey = "now" | "oneHourAgo" | "yesterdayEvening";

export function resolveQuickTime(key: QuickTimeKey, now = new Date()): Date {
  switch (key) {
    case "now":
      return now;
    case "oneHourAgo":
      return new Date(now.getTime() - 3_600_000);
    case "yesterdayEvening":
      return kstDateTime(now, 19, 0, -1);
  }
}
