import type { MedicationReminderPrefs } from "@kibble/shared";
import { apiJson } from "./api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export type PushStatus = {
  configured: boolean;
  subscriptionCount: number;
  permission: NotificationPermission | "unsupported";
};

export async function fetchPushStatus(): Promise<PushStatus> {
  const permission =
    typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  try {
    const body = await apiJson<{ configured: boolean; subscriptionCount: number }>("/api/push/status");
    return { ...body, permission };
  } catch {
    return { configured: false, subscriptionCount: 0, permission };
  }
}

export async function subscribeToPush(locale: "ko" | "en"): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("unsupported");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("denied");

  const { publicKey } = await apiJson<{ publicKey: string }>("/api/push/vapid-public-key");
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("invalid subscription");
  }

  await apiJson("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      locale,
    }),
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await apiJson("/api/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}

/**
 * 브라우저 구독만 해제한다(서버 호출 없음) — 토큰이 이미 만료돼 서버를 부를 수 없을 때. 푸시 서비스는
 * 다음 발송에서 410을 돌려주고 서버가 그 행을 지운다. 서비스워커·PushManager가 없으면 조용히 끝낸다.
 */
export async function unsubscribeBrowserPushOnly(): Promise<void> {
  if (typeof navigator === "undefined" || typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager?.getSubscription();
  await subscription?.unsubscribe();
}

export async function sendTestPush(): Promise<void> {
  await apiJson("/api/push/test", { method: "POST" });
}

export async function fetchMedicationReminderPrefs(): Promise<MedicationReminderPrefs> {
  return apiJson<MedicationReminderPrefs>("/api/push/medication-reminder");
}

export async function saveMedicationReminderPrefs(
  prefs: MedicationReminderPrefs,
): Promise<MedicationReminderPrefs> {
  return apiJson<MedicationReminderPrefs>("/api/push/medication-reminder", {
    method: "PATCH",
    body: JSON.stringify(prefs),
  });
}

export async function generateVapidKeys(): Promise<{ publicKey: string }> {
  return apiJson<{ publicKey: string }>("/api/push/vapid/generate", { method: "POST" });
}
