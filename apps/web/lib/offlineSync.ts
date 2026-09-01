import { apiJson, isApiError } from "./api";
import { uploadEventAttachment } from "./eventAttachments";
import {
  listOfflineEvents,
  removeOfflineEvent,
  updateOfflineEvent,
  type QueuedAttachment,
  type QueuedEvent,
} from "./offlineQueue";
import type { CreatedEvent } from "./types";

export type FlushOfflineResult = {
  synced: number;
  rejected: number;
  remaining: number;
};

/** 검증·대상 없음만 영구 거부. 인증·권한·레이트리밋은 큐에 남긴다 */
export function isPermanentApiRejection(err: unknown): boolean {
  if (!isApiError(err)) return false;
  const { status } = err;
  return status === 400 || status === 404 || status === 409 || status === 422;
}

export function shouldQueueOnSubmit(err: unknown): boolean {
  if (isApiError(err)) return err.status >= 500;
  return true;
}

export function isOfflineNow(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

/** 첨부를 한 장씩 올린다. 4xx 파일만 버리고, 일시 실패 시 그 파일부터 남긴다 */
export async function uploadQueuedAttachments(
  eventId: string,
  attachments: QueuedAttachment[],
): Promise<{ remaining: QueuedAttachment[]; dropped: number }> {
  const remaining: QueuedAttachment[] = [];
  let dropped = 0;
  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    const file = new File([att.blob], att.name, { type: att.type, lastModified: Date.now() });
    try {
      await uploadEventAttachment(eventId, file);
    } catch (err) {
      if (isPermanentApiRejection(err)) {
        dropped++;
        continue;
      }
      remaining.push(...attachments.slice(i));
      break;
    }
  }
  return { remaining, dropped };
}

async function flushOne(entry: QueuedEvent): Promise<"synced" | "rejected" | "retry"> {
  let eventId = entry.eventId;

  try {
    if (!eventId) {
      const event = await apiJson<CreatedEvent>("/api/events", {
        method: "POST",
        body: JSON.stringify(entry.body),
      });
      eventId = event.id;
      entry = { ...entry, eventId };
      await updateOfflineEvent(entry);
    }

    if (entry.attachments.length > 0 && eventId) {
      const { remaining } = await uploadQueuedAttachments(eventId, entry.attachments);
      if (remaining.length > 0) {
        await updateOfflineEvent({ ...entry, eventId, attachments: remaining });
        return "retry";
      }
    }

    await removeOfflineEvent(entry.id);
    return "synced";
  } catch (err) {
    if (eventId && entry.eventId !== eventId) {
      try {
        await updateOfflineEvent({ ...entry, eventId });
      } catch {
        // 다음 flush에서 dedupeKey가 재POST를 막는다
      }
    }
    if (isPermanentApiRejection(err)) {
      await removeOfflineEvent(entry.id);
      return "rejected";
    }
    return "retry";
  }
}

let flushing = false;
const FLUSH_LOCK = "kibble-offline-flush";

async function flushOfflineQueueInner(): Promise<FlushOfflineResult> {
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
      // retry: 이 항목은 남기고 다음 항목 계속 처리
    }
    const remaining = await listOfflineEvents().then((q) => q.length).catch(() => 0);
    return { synced, rejected, remaining };
  } finally {
    flushing = false;
  }
}

/** 온라인 복귀·큐 적재 시 순서대로 전송. 탭 간 Lock API로 중복 flush 방지 */
export async function flushOfflineQueue(): Promise<FlushOfflineResult> {
  if (isOfflineNow()) {
    const remaining = await listOfflineEvents().then((q) => q.length).catch(() => 0);
    return { synced: 0, rejected: 0, remaining };
  }
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(FLUSH_LOCK, flushOfflineQueueInner);
  }
  return flushOfflineQueueInner();
}
