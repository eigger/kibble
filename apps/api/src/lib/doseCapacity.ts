export type DoseConflict = "DOSE_SLOT_TAKEN" | "DOSE_LIMIT_REACHED";

/**
 * 그날 몫이 이미 찼는가 — 기록(`createEvent`)과 복원(`restoreEvent`)이 같은 규칙을 쓴다.
 *
 * - 시간대(슬롯)가 있는 처방: **슬롯 번호가 있는 기록만** 찬 칸으로 센다. 요청한 슬롯이 이미 찼으면
 *   TAKEN, 슬롯을 지정하지 않았는데(null) 빈 칸이 하나도 없으면 LIMIT. 슬롯 없는 옛 기록은 칸을
 *   차지하지 않는다.
 * - 슬롯이 없는 처방: 그날 기록 수가 `dosesPerDay`에 닿으면 LIMIT.
 *
 * `sameDay`는 대상 기록 자신을 뺀, 살아 있는 그날 기록이다. 슬롯 번호 범위 검증은 호출자 몫이다.
 */
export function doseConflict(params: {
  doseSlotCount: number;
  dosesPerDay: number;
  sameDay: { doseSlotIndex: number | null }[];
  requestedSlot: number | null;
}): DoseConflict | null {
  const { doseSlotCount, dosesPerDay, sameDay, requestedSlot } = params;
  if (doseSlotCount <= 0) {
    return sameDay.length >= dosesPerDay ? "DOSE_LIMIT_REACHED" : null;
  }
  const filled = new Set(
    sameDay.map((e) => e.doseSlotIndex).filter((index): index is number => index != null),
  );
  if (requestedSlot != null) return filled.has(requestedSlot) ? "DOSE_SLOT_TAKEN" : null;
  for (let index = 0; index < doseSlotCount; index += 1) {
    if (!filled.has(index)) return null;
  }
  return "DOSE_LIMIT_REACHED";
}
