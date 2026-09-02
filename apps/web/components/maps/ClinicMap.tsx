"use client";

import { useEffect, useRef, useState } from "react";
import { kakaoMaps, loadKakaoMaps } from "../../lib/maps/loadSdk";
import { DARK_MAP_FILTER } from "../../lib/maps/darkMode";
import { useIsDarkMode } from "../../lib/useIsDarkMode";
import { useLocale } from "../../lib/i18n/locale-context";

/** 카카오는 zoom이 아니라 level을 쓴다(작을수록 확대). 3이면 건물이 구분되는 정도. */
const DEFAULT_LEVEL = 3;

type ClinicMapProps = {
  appKey: string;
  lat: number;
  lon: number;
  name: string;
  /** 지도가 접혀 있다가 펼쳐질 때 relayout이 필요하다. */
  active?: boolean;
};

/** 병원 한 곳만 찍는 단일 지점 지도 (garage `LastLocationMap`의 카카오 경로). */
export function ClinicMap({ appKey, lat, lon, name, active = true }: ClinicMapProps) {
  const { t } = useLocale();
  const isDark = useIsDarkMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    setReady(false);
    setFailed(false);

    loadKakaoMaps(appKey)
      .then(() => {
        if (cancelled) return;
        const maps = kakaoMaps();
        if (!maps) throw new Error("Kakao maps unavailable");

        const position = new maps.LatLng(lat, lon);
        const map = new maps.Map(el, { center: position, level: DEFAULT_LEVEL });
        new maps.Marker({ position, map });
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, lat, lon]);

  useEffect(() => {
    if (!active || !ready) return;
    const id = window.setTimeout(() => mapRef.current?.relayout?.(), 0);
    return () => window.clearTimeout(id);
  }, [active, ready]);

  function handleRecenter() {
    const maps = kakaoMaps();
    if (!maps || !mapRef.current) return;
    mapRef.current.setCenter(new maps.LatLng(lat, lon));
    mapRef.current.setLevel(DEFAULT_LEVEL);
  }

  if (failed) return <p className="clinic-map-error">{t("mapLoadFailed")}</p>;

  return (
    <div className="clinic-map-wrap">
      <div
        ref={containerRef}
        className="clinic-map"
        role="img"
        aria-label={t("clinicMapAriaLabel", { name })}
        style={{ filter: isDark ? DARK_MAP_FILTER : undefined }}
      />
      {ready && (
        <button
          type="button"
          className="clinic-map-recenter"
          onClick={handleRecenter}
          title={t("recenterMap")}
          aria-label={t("recenterMap")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
      )}
    </div>
  );
}
