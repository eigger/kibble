import { withBasePath } from "./base-path";
import { getStoredLocale, translate } from "./i18n/translations";

const UPLOAD_NOTIFICATION_TAG = "kibble-upload";
const THROTTLE_INTERVAL_MS = 500;

let lastProgressNotifyTime = 0;
let lastFileIndex = -1;
let lastPhase: "preparing" | "uploading" | null = null;
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

function clearAutoClose(): void {
  if (autoCloseTimer !== null) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
}

/**
 * 사진 업로드 시작 시(사용자 상호작용 컨텍스트) 아직 알림 권한이 default라면 권한 요청 팝업을 띄운다.
 */
export async function requestUploadNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "default") {
    try {
      const res = await Notification.requestPermission();
      return res === "granted";
    } catch {
      return false;
    }
  }
  return false;
}

export type UploadNotificationProgress = {
  fileIndex: number; // 0-based
  fileCount: number;
  loaded?: number;
  total?: number;
  force?: boolean;
  eventId?: string;
  jobId?: string;
};

type ExtendedNotificationOptions = NotificationOptions & {
  actions?: Array<{ action: string; title: string; icon?: string }>;
};

function absolute(path: string): string {
  if (typeof window === "undefined" || !window.location?.origin) return path;
  return new URL(path, window.location.origin).href;
}

/** 알림에 붙는 아이콘·배지·딥링크. 진행/완료/실패가 같은 값을 쓴다. */
function notificationAssets(eventId?: string): { icon: string; badge: string; targetUrl: string } {
  return {
    icon: absolute(withBasePath("/icons/icon-192.png")),
    badge: absolute(withBasePath("/icons/badge-96.png")),
    targetUrl: absolute(
      withBasePath(eventId ? `/history/?highlight=${encodeURIComponent(eventId)}` : "/history/"),
    ),
  };
}

/**
 * 안드로이드 알림창에 업로드 진행률을 갱신한다.
 * tag가 같으므로 새 알림이 계속 쌓이지 않고 기존 알림의 내용만 실시간 업데이트된다.
 */
export async function showUploadProgressNotification({
  fileIndex,
  fileCount,
  loaded,
  total,
  force = false,
  eventId,
  jobId,
}: UploadNotificationProgress): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  if (!("serviceWorker" in navigator)) return;

  clearAutoClose();

  const now = Date.now();
  const changed = fileIndex !== lastFileIndex || lastPhase !== "uploading";
  if (!force && !changed && now - lastProgressNotifyTime < THROTTLE_INTERVAL_MS) {
    return;
  }

  lastProgressNotifyTime = now;
  lastFileIndex = fileIndex;
  lastPhase = "uploading";

  try {
    const reg = await navigator.serviceWorker.ready;
    const currentNum = Math.min(fileIndex + 1, fileCount);
    let percentText = "";
    if (typeof loaded === "number" && typeof total === "number" && total > 0) {
      const pct = Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
      percentText = ` (${pct}%)`;
    }

    const locale = getStoredLocale();
    const body = fileCount > 1
      ? translate(locale, "uploadNotificationUploadingMultiple", {
          current: currentNum,
          total: fileCount,
          percent: percentText,
        })
      : translate(locale, "uploadNotificationUploadingSingle", {
          percent: percentText,
        });

    const { icon, badge, targetUrl } = notificationAssets(eventId);

    await reg.showNotification("Kibble", {
      tag: UPLOAD_NOTIFICATION_TAG,
      body,
      icon,
      badge,
      silent: true,
      data: { url: targetUrl, eventId, jobId },
      actions: [{ action: "cancel", title: translate(locale, "cancel") }],
    } as ExtendedNotificationOptions);
  } catch (err) {
    console.warn("[uploadNotification] show progress failed", err);
  }
}

/**
 * 저장 직후 파일 손질·복사 단계를 상단바에 알린다.
 *
 * 사진 여러 장이면 이 단계만 몇 초가 걸린다. 예전에는 전송이 실제로 시작될 때까지
 * 알림이 아예 뜨지 않아, 저장을 누른 뒤 아무 일도 없는 것처럼 보였다.
 */
export async function showUploadPreparingNotification({
  fileIndex,
  fileCount,
  eventId,
}: {
  fileIndex: number;
  fileCount: number;
  eventId?: string;
}): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  if (!("serviceWorker" in navigator)) return;

  clearAutoClose();

  const now = Date.now();
  const changed = fileIndex !== lastFileIndex || lastPhase !== "preparing";
  if (!changed && now - lastProgressNotifyTime < THROTTLE_INTERVAL_MS) return;

  lastProgressNotifyTime = now;
  lastFileIndex = fileIndex;
  lastPhase = "preparing";

  try {
    const reg = await navigator.serviceWorker.ready;
    const locale = getStoredLocale();
    const body = fileCount > 1
      ? translate(locale, "uploadNotificationPreparingMultiple", {
          current: Math.min(fileIndex + 1, fileCount),
          total: fileCount,
        })
      : translate(locale, "uploadNotificationPreparingSingle");

    const { icon, badge, targetUrl } = notificationAssets(eventId);

    await reg.showNotification("Kibble", {
      tag: UPLOAD_NOTIFICATION_TAG,
      body,
      icon,
      badge,
      silent: true,
      data: { url: targetUrl, eventId },
      actions: [{ action: "cancel", title: translate(locale, "cancel") }],
    } as ExtendedNotificationOptions);
  } catch (err) {
    console.warn("[uploadNotification] show preparing failed", err);
  }
}

/**
 * 업로드 완료 시 상단바 알림을 '완료'로 변경하고, 3.5초 뒤 자동으로 닫는다.
 */
export async function showUploadCompleteNotification(fileCount: number, eventId?: string): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  if (!("serviceWorker" in navigator)) return;

  clearAutoClose();
  lastFileIndex = -1;
  lastPhase = null;

  try {
    const reg = await navigator.serviceWorker.ready;
    const locale = getStoredLocale();
    const body = fileCount > 1
      ? translate(locale, "uploadNotificationCompleteMultiple", { count: fileCount })
      : translate(locale, "uploadNotificationCompleteSingle");

    const { icon, badge, targetUrl } = notificationAssets(eventId);

    await reg.showNotification("Kibble", {
      tag: UPLOAD_NOTIFICATION_TAG,
      body,
      icon,
      badge,
      silent: true,
      data: { url: targetUrl, eventId },
    });

    autoCloseTimer = setTimeout(async () => {
      autoCloseTimer = null;
      await dismissUploadNotification();
    }, 3500);
  } catch (err) {
    console.warn("[uploadNotification] show complete failed", err);
  }
}

/**
 * 업로드 실패 시 상단바 알림을 표시한다.
 */
export async function showUploadFailedNotification(failedCount: number, eventId?: string): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  if (!("serviceWorker" in navigator)) return;

  clearAutoClose();
  lastFileIndex = -1;
  lastPhase = null;

  try {
    const reg = await navigator.serviceWorker.ready;
    const locale = getStoredLocale();
    const body = translate(locale, "uploadNotificationFailed", { count: failedCount });

    const { icon, badge, targetUrl } = notificationAssets(eventId);

    await reg.showNotification("Kibble", {
      tag: UPLOAD_NOTIFICATION_TAG,
      body,
      icon,
      badge,
      silent: false,
      data: { url: targetUrl, eventId },
    });
  } catch (err) {
    console.warn("[uploadNotification] show failed failed", err);
  }
}

/**
 * 상단바 업로드 알림을 즉시 닫는다 (업로드 취소 또는 완료 후 타이머).
 */
export async function dismissUploadNotification(): Promise<void> {
  clearAutoClose();
  lastFileIndex = -1;
  lastPhase = null;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const notifications = await reg.getNotifications({ tag: UPLOAD_NOTIFICATION_TAG });
    for (const notification of notifications) {
      notification.close();
    }
  } catch (err) {
    console.warn("[uploadNotification] dismiss failed", err);
  }
}
