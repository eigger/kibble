/**
 * 서비스워커가 캐시한 앱 셸·페이지 응답을 전부 지운다.
 *
 * sw.js는 `/api/` 아닌 성공 응답을 모두 캐시한다 — 여기엔 로그인 상태로 받은 Next RSC
 * 페이로드(반려동물·기록)가 들어간다. 주방 태블릿처럼 기기를 공유하는 것이 이 앱의
 * 기본 시나리오라(§7.12), 로그아웃하면 다음 사용자가 이전 화면을 볼 수 없어야 한다.
 */
export async function clearAppCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    // 프라이빗 모드·사이트 데이터 차단 등으로 CacheStorage 접근이 막힐 수 있다.
    // 캐시를 못 지운다고 로그아웃 자체를 막을 이유는 없다.
  }
}
