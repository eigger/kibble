import { withBasePath } from "./base-path";

const UPLOAD_NOTIFICATION_TAG = "kibble-upload";
const THROTTLE_INTERVAL_MS = 500;

let lastProgressNotifyTime = 0;
let lastFileIndex = -1;
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

function getLocale(): "ko" | "en" {
  if (typeof localStorage !== "undefined") {
    const locale = localStorage.getItem("kibble_locale");
    if (locale === "en") return "en";
  }
  return "ko";
}

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
};

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
}: UploadNotificationProgress): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  if (!("serviceWorker" in navigator)) return;

  clearAutoClose();

  const now = Date.now();
  const fileChanged = fileIndex !== lastFileIndex;
  if (!force && !fileChanged && now - lastProgressNotifyTime < THROTTLE_INTERVAL_MS) {
    return;
  }

  lastProgressNotifyTime = now;
  lastFileIndex = fileIndex;

  try {
    const reg = await navigator.serviceWorker.ready;
    const currentNum = Math.min(fileIndex + 1, fileCount);
    let percentText = "";
    if (typeof loaded === "number" && typeof total === "number" && total > 0) {
      const pct = Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
      percentText = ` (${pct}%)`;
    }

    const isEn = getLocale() === "en";
    const body = isEn
      ? fileCount > 1
        ? `Uploading ${currentNum}/${fileCount}...${percentText}`
        : `Uploading...${percentText}`
      : fileCount > 1
        ? `사진 ${currentNum}/${fileCount}장 올리는 중...${percentText}`
        : `사진 올리는 중...${percentText}`;

    const icon = withBasePath("/icons/icon-192.png");

    await reg.showNotification("Kibble", {
      tag: UPLOAD_NOTIFICATION_TAG,
      body,
      icon,
      badge: icon,
      silent: true,
      data: { url: "/" },
    });
  } catch (err) {
    console.warn("[uploadNotification] show progress failed", err);
  }
}

/**
 * 업로드 완료 시 상단바 알림을 '완료'로 변경하고, 3.5초 뒤 자동으로 닫는다.
 */
export async function showUploadCompleteNotification(fileCount: number): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  if (!("serviceWorker" in navigator)) return;

  clearAutoClose();
  lastFileIndex = -1;

  try {
    const reg = await navigator.serviceWorker.ready;
    const isEn = getLocale() === "en";
    const body = isEn
      ? fileCount > 1
        ? `${fileCount} photos uploaded`
        : "Photo uploaded"
      : fileCount > 1
        ? `사진 ${fileCount}장 업로드 완료`
        : "사진 업로드 완료";

    const icon = withBasePath("/icons/icon-192.png");

    await reg.showNotification("Kibble", {
      tag: UPLOAD_NOTIFICATION_TAG,
      body,
      icon,
      badge: icon,
      silent: true,
      data: { url: "/" },
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
export async function showUploadFailedNotification(failedCount: number): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  if (!("serviceWorker" in navigator)) return;

  clearAutoClose();
  lastFileIndex = -1;

  try {
    const reg = await navigator.serviceWorker.ready;
    const isEn = getLocale() === "en";
    const body = isEn
      ? `Upload failed (${failedCount} files). Please try again.`
      : `사진 ${failedCount}장 업로드 실패. 다시 시도해 주세요.`;

    const icon = withBasePath("/icons/icon-192.png");

    await reg.showNotification("Kibble", {
      tag: UPLOAD_NOTIFICATION_TAG,
      body,
      icon,
      badge: icon,
      silent: false,
      data: { url: "/" },
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
