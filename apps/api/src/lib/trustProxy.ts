/**
 * `TRUST_PROXY` → Fastify `trustProxy` 옵션.
 *
 * 리버스 프록시(Caddy) 뒤에서 `request.ip`는 프록시 IP다. 신뢰 설정이 없으면 모든 클라이언트가
 * 같은 IP로 보여 로그인·기록 rate limit이 전원 공용이 된다. 반대로 프록시 없이 API가 직접
 * 노출된 상태에서 켜면 `X-Forwarded-For` 위조로 rate limit을 우회할 수 있다 — 그래서
 * 코드 기본값은 꺼짐이고, 프록시를 두는 compose가 사설 대역(`loopback,linklocal,uniquelocal`)을 준다.
 *
 * 값: 미설정/빈 값/`false` → 끔 · `true` → 모든 홉 신뢰 · 그 외 → 쉼표로 구분한 신뢰 프록시
 * 주소 목록(IP, CIDR, 또는 `loopback`·`linklocal`·`uniquelocal`). 오른쪽에서부터 신뢰 주소를
 * 건너뛰고 처음 만나는 비신뢰 주소가 클라이언트다.
 *
 * 홉 수(정수)는 받지 않는다 — Fastify의 숫자 의미("n번째 홉을 클라이언트로")가 직관과 달라
 * 설정 실수가 곧 rate limit 우회나 전원 공용으로 이어진다.
 */
export function parseTrustProxy(raw: string | undefined): boolean | string {
  const value = (raw ?? "").trim();
  if (value === "" || value.toLowerCase() === "false") return false;
  if (value.toLowerCase() === "true") return true;
  const list = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.some((entry) => /^\d+$/.test(entry))) {
    throw new Error(
      `TRUST_PROXY=${value}: 정수는 지원하지 않습니다. true/false 또는 IP·CIDR 목록(예: loopback,uniquelocal)을 쓰세요`,
    );
  }
  return list.length > 0 ? list.join(",") : false;
}
