import { apiJson } from "./api";
import type { TimelineEvent } from "./types";

export const TIMELINE_PAGE_SIZE = 30;

export type TimelineCursor = {
  occurredAt: string;
  id: string;
};

export function timelineEventsPath(
  petId: string,
  cursor?: TimelineCursor,
  limit = TIMELINE_PAGE_SIZE,
): string {
  const params = new URLSearchParams({
    petId,
    limit: String(limit),
  });
  if (cursor) {
    params.set("before", cursor.occurredAt);
    params.set("beforeId", cursor.id);
  }
  return `/api/events?${params.toString()}`;
}

export async function fetchTimelinePage(
  petId: string,
  cursor?: TimelineCursor,
  limit = TIMELINE_PAGE_SIZE,
): Promise<TimelineEvent[]> {
  return apiJson<TimelineEvent[]>(timelineEventsPath(petId, cursor, limit));
}
