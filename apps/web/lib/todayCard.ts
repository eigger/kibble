import type { TodaySummaryRow, TodayUnitTotal } from "./types";
import type { TranslationKey } from "./i18n/translations";

/**
 * 오늘 카드가 크게 보여줄 값 (§7.17).
 *
 * 무엇을 보여줄지는 **이벤트 타입 키로 정하지 않는다** — 양이 있으면 합계, 없으면 횟수다.
 * 타입을 하나 늘릴 때 이 파일을 고쳐야 하면 모델이 틀린 것이다 (K-8).
 */
export type TodayCardValue =
  | { kind: "offeredConsumed"; offered: number; consumed: number; unit: string }
  | { kind: "amount"; value: number; unit: string }
  | { kind: "count"; count: number };

function hasAmount(total: TodayUnitTotal): boolean {
  return total.quantity != null || total.quantityOffered != null;
}

export function todayCardValue(row: TodaySummaryRow): TodayCardValue {
  const withAmount = row.totals.filter(hasAmount);

  // 단위가 섞인 날(같은 타입에 g과 개가 함께 들어온 날)에는 더하지 않는다.
  // 합쳐서 내면 거짓말이 되므로 조용히 횟수로 떨어진다 — 입력을 막지는 않는다 (K-12).
  if (withAmount.length !== 1) return { kind: "count", count: row.count };

  const total = withAmount[0];
  const unit = total.unit ?? row.defaultUnit ?? "";

  if (total.quantityOffered != null && total.quantity != null) {
    return {
      kind: "offeredConsumed",
      offered: total.quantityOffered,
      consumed: total.quantity,
      unit,
    };
  }
  if (total.quantityOffered != null) {
    return { kind: "amount", value: total.quantityOffered, unit };
  }
  return { kind: "amount", value: total.quantity as number, unit };
}

/** 합계는 Decimal에서 와서 `90.00`이 되기 쉽다. 뒤의 0은 떼고 보여준다. */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/**
 * "마지막 언제". 확인하러 앱을 여는 사람에게는 합계보다 이 값이 먼저다 (§7.17).
 *
 * 앞선 시각으로 적어 둔 기록(미래)은 `null`을 돌려준다 — 화면이 절대 시각으로
 * 되돌아간다. "-3분 전"이나 "방금"이라고 하면 둘 다 거짓이다.
 */
export function relativeSince(
  iso: string,
  now: Date = new Date(),
): { key: TranslationKey; params?: Record<string, string> } | null {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return null;

  const diff = now.getTime() - at;
  if (diff < 0) return null;
  if (diff < MINUTE_MS) return { key: "homeTodayJustNow" };
  if (diff < HOUR_MS) {
    return { key: "homeTodayMinutesAgo", params: { n: String(Math.floor(diff / MINUTE_MS)) } };
  }
  return { key: "homeTodayHoursAgo", params: { n: String(Math.floor(diff / HOUR_MS)) } };
}
