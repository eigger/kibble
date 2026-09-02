import { z } from "zod";

/**
 * 관리자 연동 화면(`/integrations`)이 다루는 Setting 키 화이트리스트.
 * 새 연동을 추가할 때는 여기와 웹의 `SETTING_META`만 늘리면 된다.
 */
export const settingKeySchema = z.enum([
  "APP_PUBLIC_URL",
  "KAKAO_MAP_APP_KEY",
  "VAPID_SUBJECT",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
]);
export type SettingKey = z.infer<typeof settingKeySchema>;

/** 비밀값이 아니라 UI에 원문이 필요한 키 — 마스킹하지 않고 그대로 내려준다. */
export const PLAIN_SETTING_KEYS: SettingKey[] = ["APP_PUBLIC_URL", "VAPID_SUBJECT"];

/**
 * 화면에서 직접 쓰지 않는 키 — 값은 `POST /api/push/vapid/generate`만 만든다.
 * 손으로 한 쪽만 바꾸면 짝이 어긋나 푸시가 조용히 죽는다.
 */
export const GENERATED_SETTING_KEYS: SettingKey[] = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"];

export type SettingSource = "db" | "env" | "none";

export type SettingEntry = {
  key: SettingKey;
  configured: boolean;
  source: SettingSource;
  /** 마스킹된 표시용 값. 미설정이면 null */
  masked: string | null;
  /** PLAIN_SETTING_KEYS만 원문을 담는다 */
  value?: string;
  /** 화면에서 수정할 수 없는 키(생성 전용) */
  readOnly: boolean;
};

export const settingUpdateSchema = z.object({
  value: z.string(),
});

export type SettingUpdateInput = z.infer<typeof settingUpdateSchema>;
