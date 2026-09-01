import type { MedicationCourse, PrismaClient } from "@prisma/client";
import { kstDayKey, normalizeDoseTimes, resolveDoseTimeOccurredAt } from "@kibble/shared";
import { householdWhere } from "./householdScope.js";
import { startOfTodayBoundary } from "./kstClock.js";

export type DoseSlotToday = {
  index: number;
  time: string;
  eventId: string | null;
  occurredAt: string | null;
};

export type MedicationCourseProgress = {
  id: string;
  name: string;
  dosesPerDay: number;
  doseTimes: string[];
  totalDoses: number | null;
  startDate: string;
  endDate: string | null;
  note: string | null;
  dosesGivenTotal: number;
  dosesGivenToday: number;
  dosesRemaining: number | null;
  todayComplete: boolean;
  daysOnCourse: number;
  canUndoToday: boolean;
  dosesToday: { id: string; occurredAt: string; doseSlotIndex: number | null }[];
  doseSlotsToday: DoseSlotToday[];
};

export type MedicationCourseRow = {
  id: string;
  petId: string;
  name: string;
  dosesPerDay: number;
  doseTimes: string[];
  totalDoses: number | null;
  startDate: string;
  endDate: string | null;
  note: string | null;
  archivedAt: string | null;
};

function daysOnCourse(startDate: Date, now: Date): number {
  const startKey = kstDayKey(startDate);
  const todayKey = kstDayKey(now);
  const startMs = new Date(`${startKey}T00:00:00+09:00`).getTime();
  const todayMs = new Date(`${todayKey}T00:00:00+09:00`).getTime();
  return Math.max(1, Math.floor((todayMs - startMs) / 86_400_000) + 1);
}

function serializeDoseTimes(course: MedicationCourse): string[] {
  if (course.doseTimes.length > 0) {
    return normalizeDoseTimes(course.doseTimes, course.dosesPerDay);
  }
  return normalizeDoseTimes([], course.dosesPerDay);
}

function serializeCourse(course: MedicationCourse): MedicationCourseRow {
  return {
    id: course.id,
    petId: course.petId,
    name: course.name,
    dosesPerDay: course.dosesPerDay,
    doseTimes: serializeDoseTimes(course),
    totalDoses: course.totalDoses,
    startDate: course.startDate.toISOString(),
    endDate: course.endDate?.toISOString() ?? null,
    note: course.note,
    archivedAt: course.archivedAt?.toISOString() ?? null,
  };
}

function buildDoseSlotsToday(
  doseTimes: string[],
  todayEvents: { id: string; occurredAt: Date; doseSlotIndex: number | null }[],
): DoseSlotToday[] {
  const byIndex = new Map<number, { id: string; occurredAt: Date }>();
  for (const event of todayEvents) {
    if (event.doseSlotIndex == null) continue;
    byIndex.set(event.doseSlotIndex, { id: event.id, occurredAt: event.occurredAt });
  }
  return doseTimes.map((time, index) => {
    const hit = byIndex.get(index);
    return {
      index,
      time,
      eventId: hit?.id ?? null,
      occurredAt: hit?.occurredAt.toISOString() ?? null,
    };
  });
}

export async function listMedicationCourses(
  db: Pick<PrismaClient, "medicationCourse">,
  householdId: string,
  petId: string,
  includeArchived = false,
): Promise<MedicationCourseRow[]> {
  const courses = await db.medicationCourse.findMany({
    where: {
      ...householdWhere(householdId),
      petId,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ archivedAt: "asc" }, { startDate: "desc" }, { name: "asc" }],
  });
  return courses.map(serializeCourse);
}

export async function medicationCoursesWithProgress(
  db: Pick<PrismaClient, "medicationCourse" | "event">,
  householdId: string,
  petId: string,
  now = new Date(),
): Promise<MedicationCourseProgress[]> {
  const since = startOfTodayBoundary(now);
  const courses = await db.medicationCourse.findMany({
    where: {
      ...householdWhere(householdId),
      petId,
      archivedAt: null,
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    orderBy: [{ startDate: "desc" }, { name: "asc" }],
  });

  if (courses.length === 0) return [];

  const courseIds = courses.map((c) => c.id);
  const [totalCounts, todayEvents] = await Promise.all([
    db.event.groupBy({
      by: ["medicationCourseId"],
      where: {
        ...householdWhere(householdId),
        petId,
        medicationCourseId: { in: courseIds },
        deletedAt: null,
      },
      _count: { _all: true },
    }),
    db.event.findMany({
      where: {
        ...householdWhere(householdId),
        petId,
        medicationCourseId: { in: courseIds },
        deletedAt: null,
        occurredAt: { gte: since },
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        occurredAt: true,
        medicationCourseId: true,
        doseSlotIndex: true,
      },
    }),
  ]);

  const totalByCourse = new Map(
    totalCounts
      .filter((row) => row.medicationCourseId)
      .map((row) => [row.medicationCourseId!, row._count._all]),
  );
  const dosesTodayByCourse = new Map<
    string,
    { id: string; occurredAt: string; doseSlotIndex: number | null }[]
  >();
  for (const event of todayEvents) {
    if (!event.medicationCourseId) continue;
    const list = dosesTodayByCourse.get(event.medicationCourseId) ?? [];
    list.push({
      id: event.id,
      occurredAt: event.occurredAt.toISOString(),
      doseSlotIndex: event.doseSlotIndex,
    });
    dosesTodayByCourse.set(event.medicationCourseId, list);
  }

  return courses.map((course) =>
    toProgress(course, totalByCourse, dosesTodayByCourse, now),
  );
}

function toProgress(
  course: MedicationCourse,
  totalByCourse: Map<string, number>,
  dosesTodayByCourse: Map<
    string,
    { id: string; occurredAt: string; doseSlotIndex: number | null }[]
  >,
  now: Date,
): MedicationCourseProgress {
  const dosesGivenTotal = totalByCourse.get(course.id) ?? 0;
  const dosesToday = dosesTodayByCourse.get(course.id) ?? [];
  const doseTimes = serializeDoseTimes(course);
  const usesSlots = course.doseTimes.length > 0;
  const doseSlotsToday = usesSlots
    ? buildDoseSlotsToday(
        doseTimes,
        dosesToday.map((d) => ({
          id: d.id,
          occurredAt: new Date(d.occurredAt),
          doseSlotIndex: d.doseSlotIndex,
        })),
      )
    : [];
  const dosesGivenToday = usesSlots
    ? doseSlotsToday.filter((slot) => slot.eventId != null).length
    : dosesToday.length;
  const dosesRemaining =
    course.totalDoses != null ? Math.max(0, course.totalDoses - dosesGivenTotal) : null;

  return {
    id: course.id,
    name: course.name,
    dosesPerDay: course.dosesPerDay,
    doseTimes,
    totalDoses: course.totalDoses,
    startDate: course.startDate.toISOString(),
    endDate: course.endDate?.toISOString() ?? null,
    note: course.note,
    dosesGivenTotal,
    dosesGivenToday,
    dosesRemaining,
    todayComplete: dosesGivenToday >= course.dosesPerDay,
    daysOnCourse: daysOnCourse(course.startDate, now),
    canUndoToday: dosesGivenToday > 0,
    dosesToday,
    doseSlotsToday,
  };
}

export function resolveMedicationDoseLog(
  course: Pick<MedicationCourse, "dosesPerDay" | "doseTimes">,
  todayEvents: { doseSlotIndex: number | null }[],
  requestedIndex: number | undefined,
  now = new Date(),
): { doseSlotIndex: number | null; occurredAt: Date } | { error: "limit" | "slotTaken" | "invalidSlot" } {
  const usesSlots = course.doseTimes.length > 0;
  if (!usesSlots) {
    if (todayEvents.length >= course.dosesPerDay) return { error: "limit" };
    return { doseSlotIndex: null, occurredAt: now };
  }

  const doseTimes = normalizeDoseTimes(course.doseTimes, course.dosesPerDay);
  const filled = new Set(
    todayEvents
      .map((e) => e.doseSlotIndex)
      .filter((index): index is number => index != null),
  );

  if (filled.size >= doseTimes.length) return { error: "limit" };

  let doseSlotIndex: number;
  if (requestedIndex !== undefined) {
    if (requestedIndex < 0 || requestedIndex >= doseTimes.length) {
      return { error: "invalidSlot" };
    }
    if (filled.has(requestedIndex)) return { error: "slotTaken" };
    doseSlotIndex = requestedIndex;
  } else {
    const pending = doseTimes.findIndex((_, index) => !filled.has(index));
    if (pending < 0) return { error: "limit" };
    doseSlotIndex = pending;
  }

  return {
    doseSlotIndex,
    occurredAt: resolveDoseTimeOccurredAt(doseTimes[doseSlotIndex], now),
  };
}

export { serializeCourse };
