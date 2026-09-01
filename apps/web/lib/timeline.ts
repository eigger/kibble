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
  return `/api/events?${params.toString()}`;
}

export async function fetchTimelinePage(
  petId: string,
  cursor?: TimelineCursor,
  limit = TIMELINE_PAGE_SIZE,
  period?: string,
  eventTypeKey?: string,
): Promise<TimelineEvent[]> {
  return apiJson<TimelineEvent[]>(timelineEventsPath(petId, cursor, limit, period, eventTypeKey));
}
