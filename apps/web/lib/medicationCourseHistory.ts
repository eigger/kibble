import type { MedicationCourseHistoryRow, MedicationCourseProgress } from "./types";

/**
 * 지난 처방 화면의 한 줄. 진행 중인 처방도 같은 묶음에 들어간다 — "아침약"의 계보가
 * 진행 중인 것에서 끊기면 안 된다 (WORKPLAN §7.19).
 */
export type CourseHistoryEntry = {
  id: string;
  name: string;
  ingredients: string | null;
  dosage: string | null;
  startDate: string;
  endedAt: string | null;
  ongoing: boolean;
  dosesGivenTotal: number;
  totalDoses: number | null;
  /** 같은 묶음의 직전(더 오래된) 처방과 성분이 다르다. 맨 처음 처방은 false */
  ingredientsChanged: boolean;
  source: MedicationCourseHistoryRow | MedicationCourseProgress;
};

export type CourseHistoryGroup = {
  name: string;
  entries: CourseHistoryEntry[];
};

/** 이름은 계보의 키다. 앞뒤 공백만 걷고 대소문자·띄어쓰기는 건드리지 않는다 — 추측하지 않는다 */
export function courseGroupKey(name: string): string {
  return name.trim();
}

function normalizeIngredients(value: string | null): string {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

/**
 * 진행 중 + 지난 처방을 이름별로 묶는다. 묶음은 가장 최근 시작일 순, 묶음 안은 시작일
 * 내림차순(진행 중이 맨 위). 성분 변경 마커는 묶음 안의 직전 행과 비교한다 — 평평한
 * 목록에서 비교하면 "아침약 → 저녁약 → 아침약" 순서로 섞여 엉뚱한 비교가 된다.
 */
export function groupCourseHistory(
  active: MedicationCourseProgress[],
  past: MedicationCourseHistoryRow[],
): CourseHistoryGroup[] {
  const entries: CourseHistoryEntry[] = [
    ...active.map<CourseHistoryEntry>((course) => ({
      id: course.id,
      name: course.name,
      ingredients: course.ingredients,
      dosage: course.dosage,
      startDate: course.startDate,
      endedAt: null,
      ongoing: true,
      dosesGivenTotal: course.dosesGivenTotal,
      totalDoses: course.totalDoses,
      ingredientsChanged: false,
      source: course,
    })),
    ...past.map<CourseHistoryEntry>((course) => ({
      id: course.id,
      name: course.name,
      ingredients: course.ingredients,
      dosage: course.dosage,
      startDate: course.startDate,
      endedAt: course.endedAt,
      ongoing: false,
      dosesGivenTotal: course.dosesGivenTotal,
      totalDoses: course.totalDoses,
      ingredientsChanged: false,
      source: course,
    })),
  ];

  const byName = new Map<string, CourseHistoryEntry[]>();
  for (const entry of entries) {
    const key = courseGroupKey(entry.name);
    const list = byName.get(key) ?? [];
    list.push(entry);
    byName.set(key, list);
  }

  const groups: CourseHistoryGroup[] = [];
  for (const [name, list] of byName) {
    // 오래된 것부터 훑어야 "직전"과 비교할 수 있다
    list.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
    for (let i = 1; i < list.length; i += 1) {
      list[i].ingredientsChanged =
        normalizeIngredients(list[i].ingredients) !==
        normalizeIngredients(list[i - 1].ingredients);
    }
    list.reverse();
    groups.push({ name, entries: list });
  }

  groups.sort((a, b) => b.entries[0].startDate.localeCompare(a.entries[0].startDate));
  return groups;
}
