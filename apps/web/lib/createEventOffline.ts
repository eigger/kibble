import type { CreateEventInput } from "@kibble/shared";
import { apiJson } from "./api";
import { enqueueOfflineEvent } from "./offlineQueue";
import { flushOfflineQueue, isOfflineNow, shouldQueueOnSubmit } from "./offlineSync";
import type { CreatedEvent } from "./types";

export type CreateEventOutcome =
  | { status: "created"; event: CreatedEvent }
  | { status: "queued"; queueId: string };

function notifyQueued(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("kibble-offline-queued"));
}

export async function createEventWithOfflineFallback(input: {
  /** 큐에 남을 경우의 소유자 — 본인이 다시 로그인했을 때만 전송된다 */
  userId: string;
  labelKey: string;
  body: CreateEventInput;
  attachments?: File[];
}): Promise<CreateEventOutcome> {
  if (isOfflineNow()) {
    const queueId = await enqueueOfflineEvent(input);
    notifyQueued();
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
    notifyQueued();
    // 온라인인데 5xx·네트워크만 실패 — 큐에 넣은 뒤 바로 flush
    void flushOfflineQueue(input.userId);
    return { status: "queued", queueId };
  }
}
