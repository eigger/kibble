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
      return `https://map.kakao.com/link/to/${name},${dest.lat},${dest.lon}`;
    case "naver":
      return `nmap://route/car?dlat=${dest.lat}&dlng=${dest.lon}&dname=${name}&appname=kibble`;
    case "tmap":
      return `tmap://route?goalname=${name}&goaly=${dest.lat}&goalx=${dest.lon}`;
  }
}

/** 앱이 없을 때의 웹 폴백. 카카오는 딥링크 자체가 웹 URL이라 같다. */
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
