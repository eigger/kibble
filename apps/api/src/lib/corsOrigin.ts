/**
 * CORS 허용 오리진.
 *
 * 배포(Caddy)에서 웹과 API는 same-origin이므로 브라우저는 CORS를 아예 적용하지 않는다.
 * 반대로 로컬 dev는 web 3000/3001 → api 8080/8081의 교차 오리진이라 반사가 필요하다.
 * 그래서 프로덕션에서만 좁힌다.
 *
 * ApiToken 연동(curl·HA·단축어)은 Origin 헤더를 보내지 않는다 — 호출부에서 통과시킨다.
 */

/** 문자열에서 오리진만 뽑는다. 파싱 불가·상대경로면 null. */
function toOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

/**
 * null이면 "모든 오리진 반사"(dev). 배열이면 그 오리진만 허용한다.
 *
 * 프로덕션에서 `APP_PUBLIC_URL`이 비어 있으면 빈 배열을 돌려 교차 오리진을 전부 막는다 —
 * same-origin 배포는 영향이 없고, 웹·API를 다른 호스트에 둔 경우에만 설정이 필요하다.
 * 호스트가 여럿이면 `CORS_EXTRA_ORIGINS`에 쉼표로 나열한다.
 */
export function allowedCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] | null {
  if (env.NODE_ENV !== "production") return null;

  const origins = new Set<string>();
  for (const raw of [env.APP_PUBLIC_URL ?? "", ...(env.CORS_EXTRA_ORIGINS ?? "").split(",")]) {
    const origin = toOrigin(raw);
    if (origin) origins.add(origin);
  }
  return [...origins];
}

/** Origin 헤더가 없는 요청(ApiToken 연동·서버 간 호출)은 CORS 대상이 아니다. */
export function isCorsOriginAllowed(origin: string | undefined, allowed: string[] | null): boolean {
  if (allowed === null) return true;
  if (!origin) return true;
  return allowed.includes(origin);
}
