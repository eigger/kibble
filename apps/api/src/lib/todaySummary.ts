import type { PrismaClient } from "@prisma/client";
import { householdWhere } from "./householdScope.js";

/**
 * Phase 1 오늘 요약 일 경계 — WORKPLAN §7.11.
 * KST(UTC+9) 당일 00:00을 UTC instant로 반환한다.
 */
export const PHASE1_TODAY_UTC_OFFSET_MINUTES = 9 * 60;

export function startOfTodayBoundary(
  now = new Date(),
  offsetMinutes = PHASE1_TODAY_UTC_OFFSET_MINUTES,
): Date {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  return new Date(Date.UTC(y, m, d) - offsetMinutes * 60_000);
}

export type TodaySummaryRow = {
  eventTypeKey: string;
  label: string;
  count: number;
};

export async function todaySummaryForPet(
  db: PrismaClient,
  householdId: string,
  petId: string,
  now = new Date(),
): Promise<TodaySummaryRow[]> {
  const since = startOfTodayBoundary(now);
  const grouped = await db.event.groupBy({
    by: ["eventTypeId"],
    where: {
      ...householdWhere(householdId),
      petId,
      deletedAt: null,
      occurredAt: { gte: since },
    },
    _count: { _all: true },
  });

  if (grouped.length === 0) return [];

  const typeIds = grouped.map((g) => g.eventTypeId);
  // K-1: typeIds는 위 householdWhere 스코프 이벤트에서만 나온다. EventType은 시스템(householdId null) 또는 동일 가구 행만 FK로 연결된다.
  const types = await db.eventType.findMany({
    where: { id: { in: typeIds } },
    select: { id: true, key: true, label: true, sortOrder: true },
  });
  const typeById = new Map(types.map((t) => [t.id, t]));

  type RowWithOrder = TodaySummaryRow & { sortOrder: number };

  return grouped
    .map((g) => {
      const type = typeById.get(g.eventTypeId);
      if (!type) return null;
      return {
        eventTypeKey: type.key,
        label: type.label,
        count: g._count._all,
        sortOrder: type.sortOrder,
      };
    })
    .filter((row): row is RowWithOrder => row !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map(({ eventTypeKey, label, count }) => ({ eventTypeKey, label, count }));
}
