import { kstDayKey } from "./kstClock.js";

/** HH:mm (24h, KST) */
export const DOSE_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** parseEntry RELATIVE_SLOT 시각과 동일 — 레거시 키 변환용 */
export const LEGACY_DOSE_SLOT_HOUR_KST: Record<string, number> = {
  dawn: 4,
  morning: 8,
  noon: 12,
  afternoon: 15,
  evening: 19,
  night: 22,
};

const COMMON_PRESET_TIMES: Record<number, string[]> = {
  1: ["08:00"],
  2: ["08:00", "19:00"],
  3: ["08:00", "12:00", "19:00"],
};

const FALLBACK_TIMES = ["08:00", "12:00", "19:00", "22:00", "15:00", "04:00"];

export function isDoseTime(value: string): boolean {
  return DOSE_TIME_RE.test(value);
}

export function legacySlotKeyToTime(key: string): string | null {
  const hour = LEGACY_DOSE_SLOT_HOUR_KST[key];
  if (hour == null) return null;
  return `${String(hour).padStart(2, "0")}:00`;
}

export function coerceDoseTime(value: string): string | null {
  const trimmed = value.trim();
  if (isDoseTime(trimmed)) return trimmed;
  return legacySlotKeyToTime(trimmed);
}

export function defaultDoseTimes(dosesPerDay: number): string[] {
  const n = Math.max(1, Math.min(24, Math.trunc(dosesPerDay)));
  if (COMMON_PRESET_TIMES[n]) return [...COMMON_PRESET_TIMES[n]];
  return FALLBACK_TIMES.slice(0, n);
}

/** 길이를 dosesPerDay에 맞추고, 비어 있는 회차는 기본 시각으로 채운다. */
export function normalizeDoseTimes(
  times: string[] | undefined | null,
  dosesPerDay: number,
): string[] {
  const n = Math.max(1, Math.min(24, Math.trunc(dosesPerDay)));
  const defaults = defaultDoseTimes(n);
  const result: string[] = [];
  for (let i = 0; i < n; i++) {
    const raw = times?.[i];
    const coerced = raw ? coerceDoseTime(raw) : null;
    result.push(coerced ?? defaults[i] ?? "12:00");
  }
  return result;
}

/** 복약 슬롯 기본 시각(KST). 아직 슬롯 시각 전이면 now를 쓴다(조기 복약). */
export function resolveDoseTimeOccurredAt(time: string, now = new Date()): Date {
  const coerced = coerceDoseTime(time) ?? "12:00";
  const [hh, mm] = coerced.split(":").map(Number);
  const dayKey = kstDayKey(now);
  const slotTime = new Date(
    `${dayKey}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`,
  );
  return slotTime.getTime() > now.getTime() ? now : slotTime;
}

export function formatDoseTime(time: string, localeTag = "ko-KR"): string {
  const coerced = coerceDoseTime(time);
  if (!coerced) return time;
  const [hh, mm] = coerced.split(":").map(Number);
  const dayKey = kstDayKey(new Date());
  const d = new Date(`${dayKey}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`);
  return new Intl.DateTimeFormat(localeTag, {
    hour: "numeric",
    minute: "2-digit",
    hour12: localeTag.startsWith("en"),
    timeZone: "Asia/Seoul",
  }).format(d);
}

// 레거시 import 호환
export const normalizeDoseSlotKeys = normalizeDoseTimes;
export const defaultDoseSlotKeys = defaultDoseTimes;
export const resolveDoseSlotOccurredAt = (key: string, now?: Date) =>
  resolveDoseTimeOccurredAt(key, now);
