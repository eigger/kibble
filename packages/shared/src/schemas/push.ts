import { z } from "zod";
import { medicationReminderPrefsSchema } from "../medicationReminder.js";

const PRIVATE_HOST_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".lan",
  ".home",
  ".home.arpa",
  ".localdomain",
  ".box",
  ".intranet",
  ".corp",
  ".test",
  ".invalid",
];

/**
 * 푸시 구독 endpoint는 서버가 직접 POST하는 URL이다(web-push) — 그대로 받으면 SSRF가 된다.
 * 실제 푸시 서비스(FCM, Mozilla autopush, Apple, WNS)는 모두 기본 포트 https 도메인이므로
 * https · 기본 포트 · 자격 증명 없음 · IP 리터럴 아님 · 내부망 이름 아님만 허용한다.
 * 호스트 이름이 사설 IP로 풀리는 DNS 리바인딩까지는 여기서 막지 못한다(허용 목록을 두지 않은 이유:
 * 브라우저·플랫폼마다 push 호스트가 달라 목록이 낡으면 구독이 조용히 실패한다).
 */
export function isSafePushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".")) return false; // localhost, 단일 라벨 사내 호스트명
  if (host.includes(":") || host.startsWith("[")) return false; // IPv6 리터럴
  if (/^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return false; // IPv4 리터럴(축약형 포함)
  return !PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

const pushEndpointSchema = z
  .string()
  .url()
  .refine(isSafePushEndpoint, { message: "Invalid push endpoint" });

export const pushSubscribeSchema = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
  locale: z.enum(["ko", "en"]).optional(),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;

export { medicationReminderPrefsSchema };
export type { MedicationReminderPrefs } from "../medicationReminder.js";
