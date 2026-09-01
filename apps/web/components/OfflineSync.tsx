"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { useLocale } from "../lib/i18n/locale-context";
import { useToast } from "../lib/toast-context";
import { getOfflineQueueCount } from "../lib/offlineQueue";
import { flushOfflineQueue } from "../lib/offlineSync";

/**
 * 온라인 복귀 시 IndexedDB 큐를 비우고, 대기 건수를 배너에 반영한다.
 * 로그인한 사용자의 큐만 다룬다 — 로그아웃 상태에서는 아무것도 보내지 않는다.
 */
export function OfflineSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { t } = useLocale();
  const { show } = useToast();
  const flushingRef = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(true);

  const refreshCount = useCallback(async () => {
    if (!userId) {
      setPendingCount(0);
      return;
    }
    try {
      setPendingCount(await getOfflineQueueCount(userId));
    } catch {
      setPendingCount(0);
    }
  }, [userId]);

  const runFlush = useCallback(async () => {
    if (!userId) return;
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      const { synced, rejected } = await flushOfflineQueue(userId);
      await refreshCount();
      if (synced > 0 || rejected > 0) {
        let message = t("offlineQueueFlushedToast", { synced: String(synced) });
        if (rejected > 0) {
          message += ` ${t("offlineQueueRejected", { rejected: String(rejected) })}`;
        }
        show(message, rejected > 0 ? "error" : "success");
        if (synced > 0) {
          window.dispatchEvent(new Event("kibble-offline-flushed"));
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [refreshCount, show, t, userId]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      void runFlush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    void refreshCount();
    void runFlush();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [refreshCount, runFlush]);

  useEffect(() => {
    const onQueued = () => {
      void refreshCount();
      if (navigator.onLine) void runFlush();
    };
    window.addEventListener("kibble-offline-queued", onQueued);
    return () => window.removeEventListener("kibble-offline-queued", onQueued);
  }, [refreshCount, runFlush]);

  if (!online) return null;
  if (pendingCount === 0) return null;

  return (
    <div
      className="offline-queue-banner"
      role="status"
    >
      {t("offlineQueuePending", { count: String(pendingCount) })}
    </div>
  );
}
