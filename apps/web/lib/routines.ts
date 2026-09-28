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

/** 투약 항목인가 — 처방을 참조하고, 슬롯은 서버가 고른다 (§7.24) */
export function isMedicationItem(item: RoutineItem): boolean {
  return item.eventType.key === "medication";
}

/** 실행해도 기록되지 않을 항목 — 처방이 끝났거나 지워진 투약 항목 */
export function isRoutineItemSkipped(item: RoutineItem): boolean {
  return isMedicationItem(item) && (!item.course || item.course.ended);
}

/** 항목 한 줄 — "로얄캐닌 10g", "물 5.5ml", "영양제", 투약은 처방 이름("아침약") */
export function routineItemSummary(
  item: RoutineItem,
  tLabel: (labelOrKey: string) => string,
): string {
  if (isMedicationItem(item) && item.course) return item.course.name;
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

/** 루틴 한 번에 보낼 이벤트 한 건과 그 출처 항목 — 409(오늘 이미 기록)를 항목 이름으로 알리려고 */
export interface RoutineEventBody {
  item: RoutineItem;
  body: CreateEventInput;
}

/**
 * 루틴 한 번 = 이벤트 N건. 시트의 여러 제품 저장과 같은 규칙(§7.22):
 * 같은 `entryId`(둘 이상일 때만), 항목별 `dedupeKey`, 순서는 **뒤에서부터** — 타임라인은 같은
 * 시각이면 id 내림차순이라 이렇게 해야 첫 항목이 맨 위로 읽힌다.
 *
 * 처방이 끝난 투약 항목은 보내지 않고 `skipped`로 돌려준다. 투약 항목은 처방만 싣고
 * 슬롯은 비워 둔다 — 서버가 그날 빈 슬롯 중 가장 가까운 것을 고른다 (§7.24).
 */
export function buildRoutineEventBodies(
  routine: Routine,
  petId: string,
  occurredAt: string,
  suffix: string,
): { events: RoutineEventBody[]; skipped: RoutineItem[] } {
  const runnable = routine.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !isRoutineItemSkipped(item));
  const skipped = routine.items.filter(isRoutineItemSkipped);
  const entryId = runnable.length > 1 ? `entry:${suffix}` : undefined;
  const events: RoutineEventBody[] = [];
  for (let i = runnable.length - 1; i >= 0; i -= 1) {
    const { item, index } = runnable[i];
    const medication = isMedicationItem(item);
    events.push({
      item,
      body: {
        petId,
        presetId: item.presetId ?? undefined,
        eventTypeId: item.presetId ? undefined : item.eventTypeId,
        source: "QUICK",
        occurredAt,
        entryId,
        dedupeKey: `routine:${petId}:${routine.id}:${suffix}:${index}`,
        quantity: medication ? undefined : (item.quantity ?? undefined),
        unit: medication ? undefined : (item.unit ?? undefined),
        productId: medication ? undefined : (item.productId ?? undefined),
        productName: medication ? undefined : (item.productName ?? undefined),
        medicationCourseId: medication ? (item.course?.id ?? undefined) : undefined,
      },
    });
  }
  return { events, skipped };
}
