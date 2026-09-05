import { parseOptionalNumber } from "./datetimeLocal";

/** 병원비 안쪽 ± (천 원). */
export const COST_KRW_STEP = 1000;
/** 병원비 바깥 ± (만 원). 자리가 있을 때만 같이 둔다. */
export const COST_KRW_STEP_LARGE = 10000;

/**
 * 기본 ± 한 칸. 슬라이더는 쓰지 않는다 (R85).
 * g·ml은 10, kg는 0.1, 산책 분은 5, 그 외(개·회)는 1.
 */
export function quantityStep(unit: string | null | undefined, eventTypeKey?: string | null): number {
  const u = (unit ?? "").trim().toLowerCase();
  if (u === "kg") return 0.1;
  if (u === "g" || u === "ml") return 10;
  if (u === "min") return 5;
  if (u === "개" || u === "회") return 1;
  // 사용자가 쓴 단위를 모르면 타입 기본값(사료 10g)을 들이대지 않는다.
  if (u !== "") return 1;
  const key = eventTypeKey ?? "";
  if (key === "weight") return 0.1;
  if (key === "water" || key === "meal" || key === "treat" || key === "supplement") return 10;
  if (key === "walk" || key === "play") return 5;
  return 1;
}

/**
 * 자리가 있을 때 같이 두는 작은(또는 큰) 칸.
 * 사료·물 1, 체중 1, 산책 1. 기본 칸과 같으면 생략한다.
 */
export function quantityExtraStep(
  unit: string | null | undefined,
  eventTypeKey?: string | null,
): number | null {
  const u = (unit ?? "").trim().toLowerCase();
  if (u === "kg") return 1;
  if (u === "g" || u === "ml") return 1;
  if (u === "min") return 1;
  if (u !== "") return null;
  const key = eventTypeKey ?? "";
  if (key === "weight") return 1;
  if (key === "water" || key === "meal" || key === "treat" || key === "supplement") return 1;
  if (key === "walk" || key === "play") return 1;
  return null;
}

/** 작은 칸이 입력 옆, 큰 칸이 바깥. 값이 하나면 ±만. */
export function quantityStepperSteps(
  unit: string | null | undefined,
  eventTypeKey?: string | null,
): number[] {
  const main = quantityStep(unit, eventTypeKey);
  const extra = quantityExtraStep(unit, eventTypeKey);
  if (extra == null || extra === main) return [main];
  return extra < main ? [extra, main] : [main, extra];
}

export function costStepperSteps(): number[] {
  return [COST_KRW_STEP, COST_KRW_STEP_LARGE];
}

/** 빈 칸에서 + 하면 한 칸부터. 0 아래로 내려가지 않는다. */
export function stepQuantityValue(raw: string, delta: number): string {
  const parsed = parseOptionalNumber(raw);
  const current = parsed.ok && parsed.value != null ? parsed.value : 0;
  const next = Math.max(0, Number((current + delta).toFixed(6)));
  return String(next);
}
