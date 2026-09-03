import { fetchTimelinePage, type TimelineCursor } from "./timeline";
import type { MetricEvent } from "./petMetrics";
import type { TimelineEvent } from "./types";

const ANALYTICS_EVENT_KEYS = [
  "weight",
  "meal",
  "water",
  "treat",
  "poop",
  "pee",
  "observation",
  "vet_visit",
] as const;

const MAX_PAGES = 20;

function toMetricEvent(event: TimelineEvent): MetricEvent {
  return {
    id: event.id,
    occurredAt: event.occurredAt,
    quantity: event.quantity,
    quantityOffered: event.quantityOffered,
    scaleValue: event.scaleValue,
    costKrw: event.costKrw,
    eventType: {
      key: event.eventType.key,
      scaleType: event.eventType.scaleType,
    },
  };
}

async function fetchAllByType(petId: string, eventTypeKey: string): Promise<MetricEvent[]> {
  const all: MetricEvent[] = [];
  let cursor: TimelineCursor | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await fetchTimelinePage(petId, cursor, 100, undefined, eventTypeKey);
    all.push(...batch.map(toMetricEvent));
    if (batch.length < 100) break;
    const last = batch[batch.length - 1];
    cursor = { occurredAt: last.occurredAt, id: last.id };
  }
  return all;
}

export async function fetchAnalyticsEvents(petId: string): Promise<MetricEvent[]> {
  const batches = await Promise.all(
    ANALYTICS_EVENT_KEYS.map((key) => fetchAllByType(petId, key)),
  );
  return batches
    .flat()
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}
