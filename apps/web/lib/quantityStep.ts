import { parseOptionalNumber } from "./datetimeLocal";

/** 병원비 ± 단위. 원 단위 직접 입력은 그대로 두고, 버튼만 천 원 칸으로 움직인다. */
export const COST_KRW_STEP = 1000;

/**
 * 수량 ± 한 칸. 슬라이더는 쓰지 않는다 — 40g처럼 정확한 값에 불리하다.
 * g·ml은 10, kg는 0.1, 산책 분은 5, 그 외(개·회)는 1.
 */
export function quantityStep(unit: string | null | undefined, eventTypeKey?: string | null): number {
  const u = (unit ?? "").trim().toLowerCase();
  if (u === "kg") return 0.1;
  if (u === "g" || u === "ml") return 10;
  if (u === "min") return 5;
  if (u === "개" || u === "회") return 1;
  const key = eventTypeKey ?? "";
  if (key === "weight") return 0.1;
  if (key === "water" || key === "meal" || key === "treat" || key === "supplement") return 10;
  if (key === "walk" || key === "play") return 5;
  return 1;
}

/** 빈 칸에서 + 하면 한 칸부터. 0 아래로 내려가지 않는다. */
export function stepQuantityValue(raw: string, delta: number): string {
  const parsed = parseOptionalNumber(raw);
  const current = parsed.ok && parsed.value != null ? parsed.value : 0;
  const next = Math.max(0, Number((current + delta).toFixed(6)));
  return String(next);
}
