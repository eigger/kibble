import {
  dueMedicationPushKinds,
  formatDoseTime,
  intlLocale,
  kstDayKey,
  normalizeDoseTimes,
  parseMedicationReminderPrefs,
  resolveDoseTimeOccurredAt,
  type MedicationPushKind,
} from "@kibble/shared";
import type { PrismaClient } from "@prisma/client";
import { sendPushToHousehold } from "./push.js";
import { prisma } from "./prisma.js";
import { t } from "./i18n.js";

type Db = Pick<
  PrismaClient,
  "setting" | "medicationCourse" | "event" | "medicationPushSent" | "pet"
>;

export function pushCopy(
  kind: MedicationPushKind,
  locale: "ko" | "en",
  petName: string,
  courseName: string,
  time: string,
): { title: string; body: string } {
  const timeLabel = formatDoseTime(time, intlLocale(locale));
  const title =
    kind === "lead"
      ? t("medicationReminderLeadTitle", locale)
      : t("medicationReminderOverdueTitle", locale);
  const body = t("medicationReminderBody", locale, { petName, courseName, timeLabel });
  return { title, body };
}

/**
 * 이 슬롯이 알릴 만한가. 처방을 만든 시각보다 앞선 오늘의 슬롯은 알리지 않는다 — 오후에 처방을
 * 만들었는데 아침 슬롯의 "기록이 없어요"가 바로 날아가면 안 된다(시작일을 과거로 잡아도 마찬가지).
 */
export function isReminderSlotEligible(course: { createdAt: Date }, doseAt: Date): boolean {
  return doseAt.getTime() >= course.createdAt.getTime();
}

export async function processMedicationReminderPushes(
  db: Db = prisma,
  now = new Date(),
): Promise<number> {
  const dayKey = kstDayKey(now);
  const since = new Date(`${dayKey}T00:00:00+09:00`);

  const settings = await db.setting.findMany({
    where: { key: { startsWith: "household:" } },
    select: { key: true, value: true },
  });
  const prefsByHousehold = new Map<string, ReturnType<typeof parseMedicationReminderPrefs>>();
  for (const row of settings) {
    const suffix = ":medicationReminder";
    if (!row.key.startsWith("household:") || !row.key.endsWith(suffix)) continue;
    const householdId = row.key.slice("household:".length, row.key.length - suffix.length);
    if (!householdId) continue;
    prefsByHousehold.set(householdId, parseMedicationReminderPrefs(row.value));
  }

  let sentCount = 0;

  for (const [householdId, prefs] of prefsByHousehold) {
    if (!prefs.enabled) continue;

    const courses = await db.medicationCourse.findMany({
      where: {
        householdId,
        archivedAt: null,
        // 시작 전 처방과 보관된 반려동물에는 알리지 않는다
        startDate: { lte: now },
        pet: { archivedAt: null },
        doseTimes: { isEmpty: false },
        OR: [{ endDate: null }, { endDate: { gte: since } }],
      },
      include: { pet: { select: { name: true } } },
    });
    if (courses.length === 0) continue;

    const courseIds = courses.map((c) => c.id);
    const [todayEvents, sentRows] = await Promise.all([
      db.event.findMany({
        where: {
          householdId,
          medicationCourseId: { in: courseIds },
          deletedAt: null,
          occurredAt: { gte: since },
        },
        select: { medicationCourseId: true, doseSlotIndex: true },
      }),
      db.medicationPushSent.findMany({
        where: { courseId: { in: courseIds }, dayKey },
        select: { courseId: true, doseSlotIndex: true, kind: true },
      }),
    ]);

    const loggedSlots = new Set<string>();
    for (const event of todayEvents) {
      if (!event.medicationCourseId || event.doseSlotIndex == null) continue;
      loggedSlots.add(`${event.medicationCourseId}:${event.doseSlotIndex}`);
    }

    const sentBySlot = new Map<string, Set<MedicationPushKind>>();
    for (const row of sentRows) {
      const key = `${row.courseId}:${row.doseSlotIndex}`;
      const set = sentBySlot.get(key) ?? new Set<MedicationPushKind>();
      set.add(row.kind as MedicationPushKind);
      sentBySlot.set(key, set);
    }

    for (const course of courses) {
      const doseTimes = normalizeDoseTimes(course.doseTimes, course.dosesPerDay);
      for (let index = 0; index < doseTimes.length; index++) {
        const time = doseTimes[index];
        const slotKey = `${course.id}:${index}`;
        const logged = loggedSlots.has(slotKey);
        const sentKinds = sentBySlot.get(slotKey) ?? new Set<MedicationPushKind>();
        const doseAt = resolveDoseTimeOccurredAt(time, now);
        if (!isReminderSlotEligible(course, doseAt)) continue;
        const kinds = dueMedicationPushKinds({
          now,
          doseAt,
          logged,
          prefs,
          sentKinds,
        });
        if (kinds.length === 0) continue;

        for (const kind of kinds) {
          // 구독마다 그 기기의 언어로 (K-9)
          const sent = await sendPushToHousehold(householdId, (locale) => ({
            ...pushCopy(kind, locale, course.pet.name, course.name, time),
            url: "/care",
          }));
          try {
            await db.medicationPushSent.create({
              data: { courseId: course.id, doseSlotIndex: index, kind, dayKey },
            });
            sentCount += sent;
          } catch {
            /* duplicate — already sent this slot/kind today */
          }
        }
      }
    }
  }

  return sentCount;
}
