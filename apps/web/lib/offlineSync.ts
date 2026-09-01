import { ApiError, apiJson } from "./api";
import type { CreatedEvent } from "./types";
import { uploadEventAttachments } from "./eventAttachments";
import {
  attachmentsToFiles,
  listOfflineEvents,
  removeOfflineEvent,
  type QueuedEvent,
} from "./offlineQueue";

export type FlushOfflineResult = {
  synced: number;
  rejected: number;
  remaining: number;
};

/** 네트워크·5xx는 재시도, 4xx는 영구 거부 */
export function isPermanentApiRejection(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 400 && err.status < 500;
}

export function shouldQueueOnSubmit(err: unknown): boolean {
  if (err instanceof ApiError) return err.status >= 500;
  return true;
}

export function isOfflineNow(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

async function flushOne(entry: QueuedEvent): Promise<"synced" | "rejected" | "retry"> {
  try {
    const event = await apiJson<CreatedEvent>("/api/events", {
      method: "POST",
      body: JSON.stringify(entry.body),
    });
    const files = attachmentsToFiles(entry.attachments);
    if (files.length > 0) {
      const { remaining } = await uploadEventAttachments(event.id, files);
      if (remaining.length > 0) {
        return "retry";
      }
    }
    await removeOfflineEvent(entry.id);
    return "synced";
  } catch (err) {
    if (isPermanentApiRejection(err)) {
      await removeOfflineEvent(entry.id);
      return "rejected";
    }
    return "retry";
  }
}

let flushing = false;

/** 온라인 복귀 시 큐를 순서대로 전송. 진행 중 재진입은 무시 */
export async function flushOfflineQueue(): Promise<FlushOfflineResult> {
  if (flushing || isOfflineNow()) {
    const remaining = await listOfflineEvents().then((q) => q.length).catch(() => 0);
    return { synced: 0, rejected: 0, remaining };
  }
  flushing = true;
  let synced = 0;
  let rejected = 0;
  try {
    const queue = await listOfflineEvents();
    for (const entry of queue) {
      const outcome = await flushOne(entry);
      if (outcome === "synced") synced++;
      else if (outcome === "rejected") rejected++;
      else break;
    }
    const remaining = await listOfflineEvents().then((q) => q.length).catch(() => 0);
    return { synced, rejected, remaining };
  } finally {
    flushing = false;
  }
}
