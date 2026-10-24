import webpush from "web-push";
import type { PushSubscription } from "@prisma/client";
import { isSafePushEndpoint } from "@kibble/shared";
import { configureWebPush } from "./vapid.js";
import { prisma } from "./prisma.js";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

function toWebPushSubscription(row: Pick<PushSubscription, "endpoint" | "p256dh" | "auth">) {
  return {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  };
}

export async function sendPushToSubscription(
  subscription: Pick<PushSubscription, "id" | "endpoint" | "p256dh" | "auth">,
  payload: PushPayload,
): Promise<boolean> {
  // 검증 도입 전에 저장된 행이나 DB에 직접 들어간 값도 서버가 내부망으로 POST하지 않게 발송 때 다시 건다.
  // 호스트명이 사설 IP로 풀리는 DNS 리바인딩은 여전히 못 막는다(WORKLOG: 알려진 한계).
  if (!isSafePushEndpoint(subscription.endpoint)) return false;

  const ready = await configureWebPush();
  if (!ready) return false;

  try {
    await webpush.sendNotification(
      toWebPushSubscription(subscription),
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url ?? "/care",
      }),
    );
    return true;
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
    }
    return false;
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  for (const sub of subs) {
    if (await sendPushToSubscription(sub, payload)) sent += 1;
  }
  return sent;
}

/** 구독 행의 locale — 모르는 값이면 기본 언어(ko). */
export function pushLocale(value: string | null | undefined): "ko" | "en" {
  return value === "en" ? "en" : "ko";
}

/**
 * 가구 구성원 전원에게. 문구를 함수로 주면 구독마다 그 구독의 locale로 만든다 —
 * 같은 가구라도 기기마다 고른 언어가 다르다 (K-9).
 */
export async function sendPushToHousehold(
  householdId: string,
  payload: PushPayload | ((locale: "ko" | "en") => PushPayload),
): Promise<number> {
  const subs = await prisma.pushSubscription.findMany({
    where: { user: { memberships: { some: { householdId } } } },
  });
  let sent = 0;
  for (const sub of subs) {
    const body = typeof payload === "function" ? payload(pushLocale(sub.locale)) : payload;
    if (await sendPushToSubscription(sub, body)) sent += 1;
  }
  return sent;
}
