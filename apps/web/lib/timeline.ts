import { apiJson } from "./api";
import { TIMELINE_PAGE_SIZE } from "@kibble/shared";
import type { TimelineEvent } from "./types";

export { TIMELINE_PAGE_SIZE };

export type TimelineCursor = {
  occurredAt: string;
  id: string;
};

export function timelineEventsPath(
  petId: string,
  cursor?: TimelineCursor,
  limit = TIMELINE_PAGE_SIZE,
  period?: string,
  eventTypeKey?: string,
  medicationCourseId?: string,
): string {
  const params = new URLSearchParams({
    petId,
    limit: String(limit),
  });
  if (cursor) {
    params.set("before", cursor.occurredAt);
    params.set("beforeId", cursor.id);
  }
  if (period) {
    params.set("period", period);
  }
  if (eventTypeKey) {
    params.set("eventTypeKey", eventTypeKey);
  }
  if (medicationCourseId) {
    params.set("medicationCourseId", medicationCourseId);
  }
  return `/api/events?${params.toString()}`;
}

export async function fetchTimelinePage(
  petId: string,
  cursor?: TimelineCursor,
  limit = TIMELINE_PAGE_SIZE,
  period?: string,
  eventTypeKey?: string,
  medicationCourseId?: string,
): Promise<TimelineEvent[]> {
  return apiJson<TimelineEvent[]>(
    timelineEventsPath(petId, cursor, limit, period, eventTypeKey, medicationCourseId),
  );
}

/**
 * 같은 `entryId`로 한 번에 만들어진 이벤트가 바로 위 행에 이어지는지 — 여러 제품을 한 번에
 * 먹인 기록(§7.22)이나 텍스트 한 줄에서 나온 여러 건은 시각을 반복하지 않고 위 행에 붙인다.
 * 행은 그대로 행이다(수정·삭제는 건별). 표시만 붙인다.
 */
export function isGroupedWithPrevious(
  events: readonly { entryId?: string | null }[],
  index: number,
): boolean {
  if (index <= 0) return false;
  const entryId = events[index]?.entryId;
  if (!entryId) return false;
  return events[index - 1]?.entryId === entryId;
}
