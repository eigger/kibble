import { defaultDoseTimes, isDoseTime, normalizeDoseTimes } from "@kibble/shared";
import type { MedicationCourseProgress, MedicationCourseRow } from "./types";

export type MedicationCourseDraft = {
  name: string;
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
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: "",
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
    dosesPerDay: String(course.dosesPerDay),
    doseTimes: [...course.doseTimes],
    totalDoses: course.totalDoses != null ? String(course.totalDoses) : "",
    startDate: toDateInputValue(course.startDate),
    endDate: course.endDate ? toDateInputValue(course.endDate) : "",
    note: course.note ?? "",
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
    dosesPerDay,
    doseTimes,
    totalDoses,
    startDate: dateInputToIso(draft.startDate),
    endDate: draft.endDate ? dateInputToIso(draft.endDate) : null,
    note: draft.note.trim() || null,
  };
}
