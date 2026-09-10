import { defaultDoseTimes, isDoseTime, kstDayKey, normalizeDoseTimes } from "@kibble/shared";
import type { MedicationCourseProgress, MedicationCourseRow } from "./types";

export type MedicationCourseDraft = {
  name: string;
  ingredients: string;
  dosage: string;
  dosesPerDay: string;
  doseTimes: string[];
  totalDoses: string;
  startDate: string;
  endDate: string;
  note: string;
};

export function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

export function dateInputToIso(date: string): string {
  return new Date(`${date}T12:00:00+09:00`).toISOString();
}

export function emptyMedicationCourseDraft(): MedicationCourseDraft {
  // KST 기준 오늘. UTC로 자르면 한국 아침(09:00 이전)에 어제 날짜가 들어간다
  const today = kstDayKey(new Date());
  return {
    name: "",
    ingredients: "",
    dosage: "",
    dosesPerDay: "1",
    doseTimes: defaultDoseTimes(1),
    totalDoses: "",
    startDate: today,
    endDate: "",
    note: "",
  };
}

export function courseToDraft(
  course: MedicationCourseRow | MedicationCourseProgress,
): MedicationCourseDraft {
  return {
    name: course.name,
    ingredients: course.ingredients ?? "",
    dosage: course.dosage ?? "",
    dosesPerDay: String(course.dosesPerDay),
    doseTimes: [...course.doseTimes],
    totalDoses: course.totalDoses != null ? String(course.totalDoses) : "",
    startDate: toDateInputValue(course.startDate),
    endDate: course.endDate ? toDateInputValue(course.endDate) : "",
    note: course.note ?? "",
  };
}

/**
 * "새 처방으로 이어가기"의 초안 — 이전 처방의 값을 그대로 물려받고 기간만 오늘부터 새로.
 * 보통 바뀌는 건 성분 한 줄이라, 사용자는 그것만 고치면 된다 (§7.19).
 */
export function continueCourseDraft(
  course: MedicationCourseRow | MedicationCourseProgress,
): MedicationCourseDraft {
  return {
    ...courseToDraft(course),
    startDate: emptyMedicationCourseDraft().startDate,
    endDate: "",
  };
}

export function syncDoseTimesForCount(current: string[], dosesPerDay: number): string[] {
  return normalizeDoseTimes(current, dosesPerDay);
}

export function updateDoseTimeAt(
  current: string[],
  index: number,
  value: string,
  dosesPerDay: number,
): string[] {
  const next = syncDoseTimesForCount(current, dosesPerDay);
  if (index < 0 || index >= next.length) return next;
  next[index] = value;
  return next;
}

export function parseMedicationCourseDraft(draft: MedicationCourseDraft): {
  ok: true;
  name: string;
  ingredients: string | null;
  dosage: string | null;
  dosesPerDay: number;
  doseTimes: string[];
  totalDoses: number | null;
  startDate: string;
  endDate: string | null;
  note: string | null;
} | {
  ok: false;
  reason: "name" | "dosesPerDay" | "doseTimes";
} {
  const name = draft.name.trim();
  if (!name) return { ok: false, reason: "name" };

  const dosesPerDay = Number.parseInt(draft.dosesPerDay, 10);
  if (!Number.isFinite(dosesPerDay) || dosesPerDay < 1) {
    return { ok: false, reason: "dosesPerDay" };
  }

  const doseTimes = normalizeDoseTimes(draft.doseTimes, dosesPerDay);
  if (doseTimes.length !== dosesPerDay || doseTimes.some((time) => !isDoseTime(time))) {
    return { ok: false, reason: "doseTimes" };
  }

  const totalDoses = draft.totalDoses.trim() ? Number.parseInt(draft.totalDoses, 10) : null;

  return {
    ok: true,
    name,
    ingredients: draft.ingredients.trim() || null,
    dosage: draft.dosage.trim() || null,
    dosesPerDay,
    doseTimes,
    totalDoses,
    startDate: dateInputToIso(draft.startDate),
    endDate: draft.endDate ? dateInputToIso(draft.endDate) : null,
    note: draft.note.trim() || null,
  };
}
