import { kakaoMaps, loadKakaoMaps } from "./loadSdk";
import type { MapProvidersConfig } from "./types";

export type GeocodeResult = { lat: number; lon: number };

/**
 * 주소 → 좌표. 장소 검색 이전에 자유 텍스트로 적어 둔 병원(좌표 없음)을 지도에 올릴 때 쓴다.
 */
export async function geocodeAddress(
  mapConfig: MapProvidersConfig,
  address: string,
): Promise<GeocodeResult | null> {
  if (!address.trim() || !mapConfig.kakaoAppKey) return null;

  await loadKakaoMaps(mapConfig.kakaoAppKey);
  const maps = kakaoMaps();
  if (!maps?.services) return null;

  return new Promise((resolve) => {
    const geocoder = new maps.services!.Geocoder();
    geocoder.addressSearch(address, (result: any[], status: string) => {
      if (status === maps.services!.Status.OK && result[0]) {
        resolve({ lat: Number(result[0].y), lon: Number(result[0].x) });
      } else {
        resolve(null);
      }
    });
  });
}

/** 좌표 → 주소. 도로명이 있으면 도로명, 없으면 지번. */
export async function reverseGeocode(
  mapConfig: MapProvidersConfig,
  lat: number,
  lon: number,
): Promise<string | null> {
  if (!mapConfig.kakaoAppKey) return null;

  await loadKakaoMaps(mapConfig.kakaoAppKey);
  const maps = kakaoMaps();
  if (!maps?.services) return null;

  return new Promise((resolve) => {
    const geocoder = new maps.services!.Geocoder();
    geocoder.coord2Address(lon, lat, (result: any[], status: string) => {
      if (status === maps.services!.Status.OK && result[0]) {
        resolve(result[0].road_address?.address_name || result[0].address?.address_name || null);
      } else {
        resolve(null);
      }
    });
  });
}
