import type { PrismaClient } from "@prisma/client";
import { householdWhere } from "./householdScope.js";
import { startOfTodayBoundary, PHASE1_TODAY_UTC_OFFSET_MINUTES } from "./kstClock.js";

export { PHASE1_TODAY_UTC_OFFSET_MINUTES, startOfTodayBoundary };

/**
 * 단위 하나에 대한 오늘 합계. 같은 타입에 g과 개가 섞여 들어온 날에는 항목이 둘이 되고,
 * 화면은 그럴 때 합계 대신 횟수를 보여준다 (§7.17). 여기서 섞인 것을 더해 버리면
 * 화면이 고를 수 없다.
 */
export type TodayUnitTotal = {
  unit: string | null;
  count: number;
  quantity: number | null;
  quantityOffered: number | null;
};

export type TodaySummaryRow = {
  eventTypeKey: string;
  label: string;
  /** 표시 규칙은 타입 키가 아니라 이 셋으로 정한다 — K-8 */
  category: string;
  scaleType: string | null;
  defaultUnit: string | null;
  count: number;
  totals: TodayUnitTotal[];
  lastOccurredAt: string | null;
  lastScaleValue: number | null;
};

/**
 * 마지막 척도값을 찾을 때 훑는 오늘 이벤트 수. 척도가 붙는 기록(배변·활력 등)은
 * 하루 수 건이라 넉넉하다. 넘치면 척도가 안 보일 뿐 합계는 groupBy가 정확히 낸다.
 */
const SCALE_LOOKBACK = 100;

/** Prisma Decimal · number · null을 하나로 받는다. 0은 값이므로 살린다. */
function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && "toNumber" in (value as Record<string, unknown>)) {
    const parsed = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

export async function todaySummaryForPet(
  db: PrismaClient,
  householdId: string,
  petId: string,
  now = new Date(),
): Promise<TodaySummaryRow[]> {
  const since = startOfTodayBoundary(now);
  const scope = {
    ...householdWhere(householdId),
    petId,
    deletedAt: null,
    occurredAt: { gte: since },
  };

  // 단위까지 묶어야 합계가 거짓말을 하지 않는다. 마지막 시각도 여기서 같이 나온다.
  const grouped = await db.event.groupBy({
    by: ["eventTypeId", "unit"],
    where: scope,
    _count: { _all: true },
    _sum: { quantity: true, quantityOffered: true },
    _max: { occurredAt: true },
  });

  if (grouped.length === 0) return [];

  const typeIds = [...new Set(grouped.map((g) => g.eventTypeId))];
  // K-1: typeIds는 위 householdWhere 스코프 이벤트에서만 나온다. EventType은 시스템(householdId null) 또는 동일 가구 행만 FK로 연결된다.
  const [types, scaleEvents] = await Promise.all([
    db.eventType.findMany({
      where: { id: { in: typeIds } },
      select: {
        id: true,
        key: true,
        label: true,
        category: true,
        scaleType: true,
        defaultUnit: true,
        sortOrder: true,
      },
    }),
    db.event.findMany({
      where: { ...scope, scaleValue: { not: null } },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: SCALE_LOOKBACK,
      select: { eventTypeId: true, scaleValue: true },
    }),
  ]);

  const typeById = new Map(types.map((type) => [type.id, type]));

  // 내림차순이므로 타입별로 처음 만나는 것이 가장 최근 값이다.
  const lastScaleByType = new Map<string, number>();
  for (const event of scaleEvents) {
    if (event.scaleValue == null) continue;
    if (!lastScaleByType.has(event.eventTypeId)) {
      lastScaleByType.set(event.eventTypeId, event.scaleValue);
    }
  }

  type Accumulated = TodaySummaryRow & { sortOrder: number };
  const byType = new Map<string, Accumulated>();

  for (const group of grouped) {
    const type = typeById.get(group.eventTypeId);
    if (!type) continue;

    let row = byType.get(group.eventTypeId);
    if (!row) {
      row = {
        eventTypeKey: type.key,
        label: type.label,
        category: type.category,
        scaleType: type.scaleType ?? null,
        defaultUnit: type.defaultUnit ?? null,
        count: 0,
        totals: [],
        lastOccurredAt: null,
        lastScaleValue: lastScaleByType.get(group.eventTypeId) ?? null,
        sortOrder: type.sortOrder,
      };
      byType.set(group.eventTypeId, row);
    }

    const count = group._count?._all ?? 0;
    row.count += count;
    row.totals.push({
      unit: group.unit ?? null,
      count,
      quantity: toNumber(group._sum?.quantity),
      quantityOffered: toNumber(group._sum?.quantityOffered),
    });

    const last = toIso(group._max?.occurredAt);
    if (last && (row.lastOccurredAt == null || last > row.lastOccurredAt)) {
      row.lastOccurredAt = last;
    }
  }

  return [...byType.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map(({ sortOrder: _sortOrder, ...row }) => ({
      ...row,
      totals: [...row.totals].sort((a, b) => b.count - a.count || (a.unit ?? "").localeCompare(b.unit ?? "")),
    }));
}
