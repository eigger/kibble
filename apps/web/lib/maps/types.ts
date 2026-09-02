import type { MapProvider } from "@kibble/shared";

export type MapProvidersConfig = {
  providers: MapProvider[];
  kakaoAppKey: string | null;
};

export const EMPTY_MAP_CONFIG: MapProvidersConfig = { providers: [], kakaoAppKey: null };

/** 키가 없으면 검색·지도 UI 전체가 숨는다 (WORKPLAN §3.9 — K-10과 같은 원칙). */
export function mapsEnabled(config: MapProvidersConfig): boolean {
  return Boolean(config.kakaoAppKey);
}
