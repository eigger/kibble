// 앱이 항상 오리진 루트에 있는 것은 아니다. 리버스 프록시의 서브패스(https://example.com/kibble/)나
// Home Assistant Ingress(/api/hassio_ingress/<token>/) 아래에 놓일 수 있고, 후자의 경로는
// 설치본마다 달라 빌드 시점에 알 수 없다.
//
// 그래서 도커 이미지는 basePath를 /__BASE_PATH__ 플레이스홀더로 빌드하고, 컨테이너를 띄울 때
// BASE_PATH 값으로 치환한다(apps/web/docker-entrypoint.sh). 이 값이 번들에 문자열 그대로
// 남아 있어야 치환이 되므로, 여기서 플레이스홀더를 걸러내는 식의 가공은 하면 안 된다 —
// 하면 빌드 시 상수 폴딩으로 접혀서 치환할 대상이 사라진다.
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

/** 루트 기준 절대경로에 배포 프리픽스를 붙인다. `/sw.js` → `/kibble/sw.js` */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}

/**
 * 라우트 비교용으로 정규화한 경로. trailingSlash 배포에서 usePathname()은 "/login/"처럼
 * 뒤 슬래시가 붙은 값을 주는데, 라우트 상수는 슬래시 없이 적혀 있어 그대로 비교하면 전부
 * 어긋난다 — 하단 탭 강조가 사라지고 로그인 화면에서도 탭이 뜬다.
 */
export function routePath(pathname: string | null | undefined): string {
  if (!pathname) return "/";
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}
