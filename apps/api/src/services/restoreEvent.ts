import type { Prisma, PrismaClient } from "@prisma/client";
import { startOfTodayBoundary } from "@kibble/shared";
import { householdWhere } from "../lib/householdScope.js";
import {
  CreateEventDoseConflictError,
  CreateEventNotFoundError,
  eventSelect,
  withMedicationCourseLock,
  type CreatedEvent,
} from "./createEvent.js";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 삭제된 기록을 되살린다. 처방에 연결된 복약은 `createEvent`와 **같은 처방 락 아래에서** 그날
 * 슬롯·하루 한도를 다시 본다 — 삭제 → 같은 슬롯에 다시 기록 → 이전 기록 복원으로 같은 슬롯이
 * 두 건이 되는 길을 막는다. 충돌이면 `CreateEventDoseConflictError`(라우트가 409).
 *
 * `doseOrdinal`은 다시 매기지 않고 그대로 둔다: 이력의 회차는 "그때 몇 번째였나"라는 과거
 * 사실이고(R126), 새 회차는 삭제된 행까지 센 최댓값에서 이어지므로(`createEvent`의 채번) 그 사이에
 * 만든 기록과 번호가 겹치지 않는다.
 */
export async function restoreEvent(
  db: Db,
  params: { householdId: string; eventId: string },
): Promise<CreatedEvent> {
  const where = { id: params.eventId, ...householdWhere(params.householdId) };
  const deleted = await db.event.findFirst({
    where: { ...where, deletedAt: { not: null } },
    select: {
      id: true,
      petId: true,
      occurredAt: true,
      medicationCourseId: true,
      doseSlotIndex: true,
    },
  });
  if (!deleted) throw new CreateEventNotFoundError("event");

  const courseId = deleted.medicationCourseId;
  if (!courseId) {
    return db.event.update({ where: { id: deleted.id }, data: { deletedAt: null }, select: eventSelect });
  }

  return withMedicationCourseLock(db, courseId, async (tx) => {
    // 락을 기다리는 사이 다른 요청이 먼저 복원했을 수 있다 — 락 안에서 다시 본다
    const still = await tx.event.findFirst({
      where: { ...where, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!still) throw new CreateEventNotFoundError("event");

    const course = await tx.medicationCourse.findFirst({
      where: { id: courseId, ...householdWhere(params.householdId) },
      select: { id: true, dosesPerDay: true, doseTimes: true },
    });
    if (course) {
      const dayStart = startOfTodayBoundary(deleted.occurredAt);
      const others = await tx.event.findMany({
        where: {
          ...householdWhere(params.householdId),
          petId: deleted.petId,
          medicationCourseId: course.id,
          deletedAt: null,
          id: { not: deleted.id },
          occurredAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) },
        },
        select: { doseSlotIndex: true },
      });

      if (course.doseTimes.length > 0) {
        if (
          deleted.doseSlotIndex != null &&
          others.some((e) => e.doseSlotIndex === deleted.doseSlotIndex)
        ) {
          throw new CreateEventDoseConflictError("DOSE_SLOT_TAKEN");
        }
        if (deleted.doseSlotIndex == null && others.length >= course.doseTimes.length) {
          throw new CreateEventDoseConflictError("DOSE_LIMIT_REACHED");
        }
      } else if (others.length >= course.dosesPerDay) {
        throw new CreateEventDoseConflictError("DOSE_LIMIT_REACHED");
      }
    }

    return tx.event.update({ where: { id: deleted.id }, data: { deletedAt: null }, select: eventSelect });
  });
}
