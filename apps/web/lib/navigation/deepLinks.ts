export const NAV_PROVIDERS = ["tmap", "kakao", "naver"] as const;
export type NavProvider = (typeof NAV_PROVIDERS)[number];

export type NavDestination = {
  lat: number;
  lon: number;
  name: string;
};

/** 내비 딥링크는 SDK 키가 필요 없다 — 좌표만 있으면 3종 모두 실행된다. */
export function buildNavUrl(provider: NavProvider, dest: NavDestination): string {
  const name = encodeURIComponent(dest.name);
  switch (provider) {
    case "kakao":
      // map.kakao.com/link/to/... 는 웹 링크라 폰에서 앱으로 넘어가지 않고 웹 지도만 뜬다
      // (경로가 안 잡힌다). 네이버·티맵처럼 앱 스킴을 쓴다. sp를 비우면 현재 위치가 출발지다.
      return `kakaomap://route?ep=${dest.lat},${dest.lon}&by=CAR`;
    case "naver":
      return `nmap://route/car?dlat=${dest.lat}&dlng=${dest.lon}&dname=${name}&appname=kibble`;
    case "tmap":
      return `tmap://route?goalname=${name}&goaly=${dest.lat}&goalx=${dest.lon}`;
  }
}

/** 앱이 없을 때의 웹 폴백. 여기는 앱 스킴이 아니라 항상 브라우저에서 열리는 주소다. */
export function buildNavWebFallback(provider: NavProvider, dest: NavDestination): string {
  const name = encodeURIComponent(dest.name);
  switch (provider) {
    case "kakao":
      return `https://map.kakao.com/link/to/${name},${dest.lat},${dest.lon}`;
    case "naver":
      return `https://map.naver.com/v5/search/${name}`;
    case "tmap":
      return "https://tmapapi.tmapmobility.com/main.html";
  }
}
