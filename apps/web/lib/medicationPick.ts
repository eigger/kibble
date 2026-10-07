export interface PickableCourse {
  id: string;
  dosesPerDay: number;
  dosesGivenToday: number;
}

/** 오늘 몫을 다 먹였나. 오프라인 스냅샷은 `dosesGivenToday`가 0이라 항상 아니다 — 서버가 409로 판정한다. */
export function isCourseDoneToday(course: PickableCourse): boolean {
  return course.dosesGivenToday >= course.dosesPerDay;
}

export type MedicationPickPlan<T extends PickableCourse> =
  /** 진행 중 처방이 없다 */
  | { kind: "none" }
  /** 전부 오늘 몫을 마쳤다 */
  | { kind: "allDone" }
  /** 오늘 남은 처방이 하나뿐이다 — 시트를 건너뛰고 바로 그 처방으로 */
  | { kind: "auto"; course: T }
  /** 고를 처방이 둘 이상이다 (끝난 처방은 시트에서 표시만) */
  | { kind: "pick" };

export function planMedicationPick<T extends PickableCourse>(courses: T[]): MedicationPickPlan<T> {
  if (courses.length === 0) return { kind: "none" };
  const remaining = courses.filter((course) => !isCourseDoneToday(course));
  if (remaining.length === 0) return { kind: "allDone" };
  if (remaining.length === 1) return { kind: "auto", course: remaining[0] };
  return { kind: "pick" };
}
