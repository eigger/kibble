import { kstDayKey } from "@kibble/shared";
import { courseStartsByTodayBefore } from "./medicationCourseProgress.js";

export type ContinuationPlan =
  /** 새 처방이 오늘(또는 과거부터) 시작한다 — 이전 처방은 지금 보관한다(기존 동작) */
  | { kind: "archiveNow" }
  /** 새 처방이 내일 이후 시작한다 — 이전 처방은 보관하지 않고 종료일만 맞춰 그날까지 오늘 대상으로 둔다 */
  | { kind: "endBeforeStart"; endDate: Date }
  /** 이전 처방이 이미 더 일찍 끝나도록 되어 있다 — 건드리지 않는다 */
  | { kind: "keep" };

/**
 * "새 처방으로 이어가기" 때 이전 처방을 어떻게 할지. 새 처방이 예정(upcoming)인데 이전 처방을 바로
 * 보관하면 시작일 전까지 오늘 복약 대상이 하나도 없어 복약을 기록할 수도, 알림을 받을 수도 없다.
 * 그래서 이전 처방의 종료일을 새 시작일 전날(KST 정오 — 웹이 저장하는 형식)로 정하고 보관하지 않는다.
 * 종료일이 지나면 기존 규칙대로 "지난 처방"이 된다. 이전 처방에 이미 더 이른 종료일이 있으면 덮어쓰지
 * 않는다.
 */
export function planContinuation(
  previous: { endDate: Date | null },
  newStartDate: Date,
  now: Date,
): ContinuationPlan {
  if (newStartDate < courseStartsByTodayBefore(now)) return { kind: "archiveNow" };
  const dayBefore = new Date(
    new Date(`${kstDayKey(newStartDate)}T12:00:00+09:00`).getTime() - 86_400_000,
  );
  if (previous.endDate && previous.endDate <= dayBefore) return { kind: "keep" };
  return { kind: "endBeforeStart", endDate: dayBefore };
}
