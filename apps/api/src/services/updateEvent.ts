import type { Prisma, PrismaClient } from "@prisma/client";
import { kstDayKey, normalizeDoseTimes, startOfTodayBoundary } from "@kibble/shared";
import { doseConflict } from "../lib/doseCapacity.js";
import { householdWhere } from "../lib/householdScope.js";
import {
  CreateEventDoseConflictError,
  withMedicationCourseLock,
} from "./createEvent.js";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * PATCH의 쓰기. 처방에 연결된 복약의 `occurredAt`을 **KST 하루가 달라지게** 옮기면 `createEvent`·
 * 복원(`restoreEvent`)과 같은 처방 락 아래에서 도착일 기준으로 슬롯·하루 한도를 다시 본다 — 그렇지
 * 않으면 오늘 08:00 슬롯 복약을 어제로 옮겨 어제 같은 슬롯이 두 건이 된다. 충돌이면
 * `CreateEventDoseConflictError`(라우트가 409). 같은 날 안에서 시각만 바꾸거나 처방과 무관한 기록은
 * 검사 없이 그대로 쓴다.
 *
 * 날짜를 옮겨도 `doseSlotIndex`·`doseOrdinal`은 그대로 둔다(복원과 같은 원칙): 슬롯은 사용자가 기록한
 * 사실이고 회차는 "그때 몇 번째였나"라는 과거 사실이다. 슬롯이 이미 찼으면 임의로 다른 칸에 넣지 않고
 * 거절한다. 반환값은 갱신된 행 수(0이면 대상 없음).
 */
export async function applyEventUpdate(
  db: Db,
  params: { householdId: string; eventId: string; data: Prisma.EventUpdateManyMutationInput },
): Promise<number> {
  const where = { id: params.eventId, ...householdWhere(params.householdId), deletedAt: null };
  const plain = async (client: Db) =>
    (await client.event.updateMany({ where, data: params.data })).count;

  const newAt = params.data.occurredAt;
  if (!(newAt instanceof Date)) return plain(db);

  const current = await db.event.findFirst({
    where,
    select: { petId: true, occurredAt: true, medicationCourseId: true, doseSlotIndex: true },
  });
  if (!current || !current.medicationCourseId) return plain(db);
  if (kstDayKey(current.occurredAt) === kstDayKey(newAt)) return plain(db);

  const courseId = current.medicationCourseId;
  return withMedicationCourseLock(db, courseId, async (tx) => {
    // 락을 기다리는 사이 바뀌었을 수 있다 — 락 안에서 다시 본다
    const fresh = await tx.event.findFirst({
      where,
      select: { petId: true, medicationCourseId: true, doseSlotIndex: true },
    });
    if (!fresh || fresh.medicationCourseId !== courseId) return plain(tx);

    const course = await tx.medicationCourse.findFirst({
      where: { id: courseId, ...householdWhere(params.householdId) },
      select: { id: true, dosesPerDay: true, doseTimes: true },
    });
    if (course) {
      const dayStart = startOfTodayBoundary(newAt);
      const others = await tx.event.findMany({
        where: {
          ...householdWhere(params.householdId),
          petId: fresh.petId,
          medicationCourseId: course.id,
          deletedAt: null,
          id: { not: params.eventId },
          occurredAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) },
        },
        select: { doseSlotIndex: true },
      });
      const conflict = doseConflict({
        doseSlotCount:
          course.doseTimes.length > 0
            ? normalizeDoseTimes(course.doseTimes, course.dosesPerDay).length
            : 0,
        dosesPerDay: course.dosesPerDay,
        sameDay: others,
        requestedSlot: fresh.doseSlotIndex,
      });
      if (conflict) throw new CreateEventDoseConflictError(conflict);
    }
    return plain(tx);
  });
}
