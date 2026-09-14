import type { CreateEventInput } from "@kibble/shared";
import type { Routine, RoutineItem } from "./types";

/** `/q` 입력 바의 모드 — 기록 칩 / 루틴. 기기별로 마지막 모드를 기억한다 (§7.24) */
export type QuickMode = "chips" | "routines";

const MODE_KEY = "kibble:quick-mode";

export function loadQuickMode(): QuickMode {
  try {
    return localStorage.getItem(MODE_KEY) === "routines" ? "routines" : "chips";
  } catch {
    return "chips";
  }
}

export function saveQuickMode(mode: QuickMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // 시크릿 창 등 — 기억 못 해도 동작에는 지장 없다
  }
}

/** 하단 내비의 기록 탭을 `/q`에서 다시 누르면 이 이벤트로 모드를 토글한다 */
export const QUICK_MODE_TOGGLE_EVENT = "kibble-quick-mode-toggle";

function formatQuantity(quantity: number, unit: string | null): string {
  const n = Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(2)));
  return unit ? `${n}${unit}` : n;
}

/** 항목 한 줄 — "로얄캐닌 10g", "물 5.5ml", "영양제" */
export function routineItemSummary(
  item: RoutineItem,
  tLabel: (labelOrKey: string) => string,
): string {
  const name =
    item.product?.name ?? item.productName ?? tLabel(item.preset?.label ?? item.eventType.label);
  if (item.quantity == null) return name;
  return `${name} ${formatQuantity(item.quantity, item.unit ?? item.eventType.defaultUnit)}`;
}

/** 버튼 아래 요약 — 항목이 많으면 "사료 10g · 영양제 · +2" */
export function routineSummary(
  routine: Routine,
  tLabel: (labelOrKey: string) => string,
  maxItems = 2,
): string {
  const parts = routine.items.slice(0, maxItems).map((item) => routineItemSummary(item, tLabel));
  const rest = routine.items.length - parts.length;
  if (rest > 0) parts.push(`+${rest}`);
  return parts.join(" · ");
}

/**
 * 루틴 한 번 = 이벤트 N건. 시트의 여러 제품 저장과 같은 규칙(§7.22):
 * 같은 `entryId`(둘 이상일 때만), 항목별 `dedupeKey`, 순서는 **뒤에서부터** — 타임라인은 같은
 * 시각이면 id 내림차순이라 이렇게 해야 첫 항목이 맨 위로 읽힌다.
 */
export function buildRoutineEventBodies(
  routine: Routine,
  petId: string,
  occurredAt: string,
  suffix: string,
): CreateEventInput[] {
  const entryId = routine.items.length > 1 ? `entry:${suffix}` : undefined;
  const bodies: CreateEventInput[] = [];
  for (let i = routine.items.length - 1; i >= 0; i -= 1) {
    const item = routine.items[i];
    bodies.push({
      petId,
      presetId: item.presetId ?? undefined,
      eventTypeId: item.presetId ? undefined : item.eventTypeId,
      source: "QUICK",
      occurredAt,
      entryId,
      dedupeKey: `routine:${petId}:${routine.id}:${suffix}:${i}`,
      quantity: item.quantity ?? undefined,
      unit: item.unit ?? undefined,
      productId: item.productId ?? undefined,
      productName: item.productName ?? undefined,
    });
  }
  return bodies;
}
