import { z } from "zod";

const withSeconds = z.string().datetime({ offset: true });
const withoutSeconds = z.string().datetime({ offset: true, precision: -1 });

/**
 * 느슨한 표기를 ISO 8601로 맞춘다 (K-12 — 붙이는 쪽을 탓하지 않는다).
 * - 날짜와 시각 사이 공백: HA `{{ now() }}` → `2024-01-02 03:04:05.123456+09:00`
 * - 콜론 없는 오프셋: `+0900` (zod 4 `datetime()`이 거부해서 필요하다)
 */
function normalize(s: string): string {
  return s
    .trim()
    .replace(/^(\d{4}-\d{2}-\d{2}) (?=\d)/, "$1T")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
}

function toUtcIso(s: string): string | null {
  const n = normalize(s);
  if (!withSeconds.safeParse(n).success && !withoutSeconds.safeParse(n).success) return null;
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return null;
  // 연도가 0000~9999를 벗어나면 toISOString이 `+010000-…` 형태가 된다 — 받지 않는다
  const year = d.getUTCFullYear();
  if (year < 0 || year > 9999) return null;
  return d.toISOString();
}

/**
 * 외부 자동화(HA 등)가 보내는 ISO 8601 시각.
 * - `+09:00`·`+0900` 오프셋과 `Z`를 모두 받는다 (K-12/K-14). zod 4의 `datetime()` 기본값은 오프셋을 거부한다.
 * - 초를 생략한 `2024-01-02T03:04Z`, 공백 구분자, 마이크로초도 받는다.
 * - 통과한 값은 UTC ISO(`...Z`, 밀리초 포함)로 정규화된다 — 저장 전 시각 비교가 문자열 형식에 흔들리지 않는다.
 */
export const isoDatetime = z
  .string()
  .refine((s) => toUtcIso(s) !== null, { message: "Invalid ISO datetime" })
  .transform((s) => toUtcIso(s) as string);
