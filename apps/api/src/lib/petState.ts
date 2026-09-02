import type { PrismaClient } from "@prisma/client";
import { householdWhere } from "./householdScope.js";
import { kstDateTime, startOfTodayBoundary } from "./kstClock.js";
import { medicationCoursesWithProgress } from "./medicationCourseProgress.js";

/** 마지막 기록 한 건 — 이벤트 타입별로 하나씩. */
export type LastEventState = {
  eventTypeKey: string;
  label: string;
  occurredAt: string;
  quantity: number | null;
  unit: string | null;
  scaleValue: number | null;
  /** 마지막 기록 이후 지난 시간(시간 단위, 소수 1자리). 알림 조건에 쓰기 쉽게. */
  hoursSince: number;
};

export type TodayTypeState = {
  eventTypeKey: string;
  label: string;
  count: number;
  /** 수량이 있는 타입만 — 오늘 합계 (급여량·음수량 등) */
  total: number | null;
  unit: string | null;
};

export type PetState = {
  pet: { id: string; name: string; species: string };
  generatedAt: string;
  /** 오늘 경계(KST 기준) — 합계가 어느 구간인지 밝힌다 */
  todaySince: string;
  lastEvents: LastEventState[];
  today: TodayTypeState[];
  medication: {
    activeCourses: number;
    dosesGivenToday: number;
    dosesPlannedToday: number;
    /** 시각이 지났는데 아직 안 먹인 슬롯 */
    overdueDoses: { courseId: string; courseName: string; time: string }[];
  };
  reminders: { id: string; label: string; nextDueAt: string; overdue: boolean }[];
};

function hoursBetween(from: Date, to: Date): number {
  return Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 10) / 10;
}

/**
 * 이벤트 타입을 코드에 나열하지 않는다 (K-8) — 기록이 있는 타입이 그대로 나온다.
 * 그래서 프리셋·타입을 데이터로 늘려도 이 응답이 저절로 따라간다.
 */
async function lastEventPerType(
  db: PrismaClient,
  householdId: string,
  petId: string,
  now: Date,
): Promise<LastEventState[]> {
  const base = { ...householdWhere(householdId), petId, deletedAt: null };

  const grouped = await db.event.groupBy({
    by: ["eventTypeId"],
    where: base,
    _max: { occurredAt: true },
  });
  if (grouped.length === 0) return [];

  const pairs = grouped
    .filter((row) => row._max.occurredAt != null)
    .map((row) => ({ eventTypeId: row.eventTypeId, occurredAt: row._max.occurredAt as Date }));

  const rows = await db.event.findMany({
    where: { ...base, OR: pairs },
    orderBy: { occurredAt: "desc" },
    select: {
      eventTypeId: true,
      occurredAt: true,
      quantity: true,
      unit: true,
      scaleValue: true,
      eventType: { select: { key: true, label: true, sortOrder: true } },
    },
  });

  // 같은 초에 두 건이 있으면 위 OR가 둘 다 집는다 — 타입당 첫 건만 남긴다.
  const seen = new Set<string>();
  const out: (LastEventState & { sortOrder: number })[] = [];
  for (const row of rows) {
    if (seen.has(row.eventTypeId)) continue;
    seen.add(row.eventTypeId);
    out.push({
      eventTypeKey: row.eventType.key,
      label: row.eventType.label,
      occurredAt: row.occurredAt.toISOString(),
      quantity: row.quantity != null ? Number(row.quantity) : null,
      unit: row.unit,
      scaleValue: row.scaleValue,
      hoursSince: hoursBetween(row.occurredAt, now),
      sortOrder: row.eventType.sortOrder,
    });
  }

  return out
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map(({ sortOrder: _sortOrder, ...rest }) => rest);
}

async function todayPerType(
  db: PrismaClient,
  householdId: string,
  petId: string,
  since: Date,
): Promise<TodayTypeState[]> {
  const grouped = await db.event.groupBy({
    by: ["eventTypeId"],
    where: { ...householdWhere(householdId), petId, deletedAt: null, occurredAt: { gte: since } },
    _count: { _all: true },
    _sum: { quantity: true },
  });
  if (grouped.length === 0) return [];

  const typeIds = grouped.map((row) => row.eventTypeId);
  // K-1: typeIds는 위 가구 스코프 이벤트에서만 나온다.
  const types = await db.eventType.findMany({
    where: { id: { in: typeIds } },
    select: { id: true, key: true, label: true, defaultUnit: true, sortOrder: true },
  });
  const byId = new Map(types.map((row) => [row.id, row]));

  // 단위는 실제 기록에 적힌 값을 우선한다 (사용자가 g 대신 개를 썼을 수 있다).
  const unitRows = await db.event.findMany({
    where: {
      ...householdWhere(householdId),
      petId,
      deletedAt: null,
      occurredAt: { gte: since },
      unit: { not: null },
    },
    distinct: ["eventTypeId"],
    orderBy: { occurredAt: "desc" },
    select: { eventTypeId: true, unit: true },
  });
  const unitByType = new Map(unitRows.map((row) => [row.eventTypeId, row.unit]));

  return grouped
    .map((row) => {
      const type = byId.get(row.eventTypeId);
      if (!type) return null;
      const total = row._sum.quantity != null ? Number(row._sum.quantity) : null;
      return {
        eventTypeKey: type.key,
        label: type.label,
        count: row._count._all,
        total,
        unit: total != null ? (unitByType.get(row.eventTypeId) ?? type.defaultUnit) : null,
        sortOrder: type.sortOrder,
      };
    })
    .filter((row): row is TodayTypeState & { sortOrder: number } => row !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map(({ sortOrder: _sortOrder, ...rest }) => rest);
}

export async function petStateFor(
  db: PrismaClient,
  params: { householdId: string; petId: string; now?: Date },
): Promise<PetState | null> {
  const now = params.now ?? new Date();
  const since = startOfTodayBoundary(now);

  const pet = await db.pet.findFirst({
    where: { id: params.petId, ...householdWhere(params.householdId), archivedAt: null },
    select: { id: true, name: true, species: true },
  });
  if (!pet) return null;

  const [lastEvents, today, courses, reminders] = await Promise.all([
    lastEventPerType(db, params.householdId, pet.id, now),
    todayPerType(db, params.householdId, pet.id, since),
    medicationCoursesWithProgress(db, params.householdId, pet.id),
    db.reminder.findMany({
      where: { petId: pet.id, active: true },
      orderBy: { nextDueAt: "asc" },
      select: { id: true, label: true, nextDueAt: true },
    }),
  ]);

  const nowMs = now.getTime();
  const overdueDoses: PetState["medication"]["overdueDoses"] = [];
  let dosesGivenToday = 0;
  let dosesPlannedToday = 0;

  for (const course of courses) {
    dosesGivenToday += course.dosesGivenToday;
    dosesPlannedToday += course.dosesPerDay;
    for (const slot of course.doseSlotsToday) {
      if (slot.eventId) continue;
      const [hh, mm] = slot.time.split(":").map(Number);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
      // 오늘(KST) 그 시각의 실제 instant. resolveDoseTimeOccurredAt는 미래 슬롯을 now로
      // 당겨버리므로(기록용) 지남 판정에는 쓸 수 없다.
      const due = kstDateTime(now, hh, mm);
      if (due.getTime() <= nowMs) {
        overdueDoses.push({ courseId: course.id, courseName: course.name, time: slot.time });
      }
    }
  }

  return {
    pet,
    generatedAt: now.toISOString(),
    todaySince: since.toISOString(),
    lastEvents,
    today,
    medication: {
      activeCourses: courses.length,
      dosesGivenToday,
      dosesPlannedToday,
      overdueDoses,
    },
    reminders: reminders.map((row) => ({
      id: row.id,
      label: row.label,
      nextDueAt: row.nextDueAt.toISOString(),
      overdue: row.nextDueAt.getTime() < nowMs,
    })),
  };
}
