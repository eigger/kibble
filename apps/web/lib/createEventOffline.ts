import type { CreateEventInput } from "@kibble/shared";
import { apiJson } from "./api";
import { enqueueOfflineEvent } from "./offlineQueue";
import { isOfflineNow, shouldQueueOnSubmit } from "./offlineSync";
import type { CreatedEvent } from "./types";

export type CreateEventOutcome =
  | { status: "created"; event: CreatedEvent }
  | { status: "queued"; queueId: string };

export async function createEventWithOfflineFallback(input: {
  labelKey: string;
  body: CreateEventInput;
  attachments?: File[];
}): Promise<CreateEventOutcome> {
  if (isOfflineNow()) {
    const queueId = await enqueueOfflineEvent(input);
    return { status: "queued", queueId };
  }

  try {
    const event = await apiJson<CreatedEvent>("/api/events", {
      method: "POST",
      body: JSON.stringify(input.body),
    });
    return { status: "created", event };
  } catch (err) {
    if (!shouldQueueOnSubmit(err)) throw err;
    const queueId = await enqueueOfflineEvent(input);
    return { status: "queued", queueId };
  }
}
