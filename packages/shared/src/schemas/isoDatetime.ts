import { z } from "zod";

const withSeconds = z.string().datetime({ offset: true });
const withoutSeconds = z.string().datetime({ offset: true, precision: -1 });

/**
 * 외부 자동화(HA 등)가 보내는 ISO 8601 시각.
 * - `+09:00` 같은 오프셋과 `Z`를 모두 받는다 (K-12/K-14). zod 4의 `datetime()` 기본값은 오프셋을 거부한다.
 * - 초를 생략한 `2024-01-02T03:04Z`도 받는다.
 * - 통과한 값은 UTC ISO(`...Z`, 밀리초 포함)로 정규화된다 — 저장 전 시각 비교가 문자열 형식에 흔들리지 않는다.
 */
export const isoDatetime = z
  .string()
  .refine((s) => withSeconds.safeParse(s).success || withoutSeconds.safeParse(s).success, {
    message: "Invalid ISO datetime",
  })
  .transform((s) => new Date(s).toISOString());
