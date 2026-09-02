// id별로 진행 중인 로드의 Promise를 공유한다 — 여러 곳에서 동시에 SDK를 요청하면(검색 모달과
// 지도 카드가 같은 렌더에서 뜨는 경우) 스크립트 태그가 막 추가된 직후(아직 로드는 안 끝난)
// 상태를 "이미 존재하니 로드 완료"로 착각해 즉시 통과시키는 문제가 있었다 — 그러면
// window.kakao가 아직 없어 뒤이은 호출들이 에러를 던지고, 그 에러를 삼키는 호출부 때문에
// 지도·주소가 세션 내내 영영 안 나왔다. (garage에서 실제로 겪은 버그의 수정본)
const scriptLoadPromises = new Map<string, Promise<void>>();

export function loadScript(src: string, id: string): Promise<void> {
  const existing = scriptLoadPromises.get(id);
  if (existing) return existing;

  if (document.getElementById(id)) {
    const resolved = Promise.resolve();
    scriptLoadPromises.set(id, resolved);
    return resolved;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromises.delete(id);
      script.remove();
      reject(new Error(`Failed to load script: ${src}`));
    };
    document.head.appendChild(script);
  });
  scriptLoadPromises.set(id, promise);
  return promise;
}

export async function loadKakaoMaps(appKey: string): Promise<void> {
  const id = "kakao-maps-sdk";
  if (!(window as KakaoWindow).kakao?.maps) {
    // libraries=services — 장소(상호) 검색과 지오코딩이 여기 들어 있다.
    await loadScript(
      `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=services`,
      id,
    );
  }
  const kakao = (window as KakaoWindow).kakao;
  if (!kakao?.maps) throw new Error("Kakao maps SDK unavailable");
  await new Promise<void>((resolve) => kakao.maps.load(() => resolve()));
}

type KakaoWindow = Window & {
  kakao?: { maps: { load: (cb: () => void) => void } };
};

/** SDK 타입 정의는 배포하지 않으므로 호출부는 이 헬퍼로 좁혀서 쓴다. */
export function kakaoMaps(): KakaoMapsNamespace | null {
  const kakao = (window as unknown as { kakao?: { maps?: KakaoMapsNamespace } }).kakao;
  return kakao?.maps ?? null;
}

export type KakaoMapsNamespace = {
  Map: new (el: HTMLElement, opts: any) => any;
  LatLng: new (lat: number, lon: number) => any;
  Marker: new (opts: any) => any;
  services?: {
    Places: new () => { keywordSearch: (q: string, cb: any, opts?: any) => void };
    Geocoder: new () => {
      addressSearch: (q: string, cb: any) => void;
      coord2Address: (lon: number, lat: number, cb: any) => void;
    };
    Status: { OK: string; ZERO_RESULT: string; ERROR: string };
  };
};
