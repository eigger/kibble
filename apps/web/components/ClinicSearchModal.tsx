"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { kakaoMaps, loadKakaoMaps } from "../lib/maps/loadSdk";
import type { MapProvidersConfig } from "../lib/maps/types";
import { DARK_MAP_FILTER } from "../lib/maps/darkMode";
import { useIsDarkMode } from "../lib/useIsDarkMode";
import { useLocale } from "../lib/i18n/locale-context";

export type ClinicPlaceResult = {
  name: string;
  address: string;
  lat: number;
  lon: number;
  placeUrl: string | null;
};

/** 카카오 카테고리 그룹 코드 — HP8은 병원. 동물병원도 여기에 들어간다. */
const HOSPITAL_CATEGORY = "HP8";

const PREVIEW_LEVEL = 3;

interface ClinicSearchModalProps {
  mapConfig: MapProvidersConfig;
  initialQuery?: string;
  onSelect: (result: ClinicPlaceResult) => void;
  onClose: () => void;
}

export function ClinicSearchModal({
  mapConfig,
  initialQuery = "",
  onSelect,
  onClose,
}: ClinicSearchModalProps) {
  const { t } = useLocale();
  const isDark = useIsDarkMode();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ClinicPlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<ClinicPlaceResult | null>(null);
  const [hospitalsOnly, setHospitalsOnly] = useState(true);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // 현재 위치가 있으면 가까운 병원이 먼저 나온다. 거부해도 검색 자체는 동작한다.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 5000 },
    );
  }, []);

  useEffect(() => {
    if (!mapConfig.kakaoAppKey) {
      setMessage(t("clinicSearchNoKey"));
      return;
    }
    let active = true;
    loadKakaoMaps(mapConfig.kakaoAppKey)
      .then(() => {
        if (active) setSdkReady(true);
      })
      .catch(() => {
        if (active) setMessage(t("mapLoadFailed"));
      });
    return () => {
      active = false;
    };
  }, [mapConfig.kakaoAppKey, t]);

  // 선택 확인 화면의 미리보기 지도. 컨테이너가 렌더된 뒤에 그려야 한다.
  useEffect(() => {
    if (!selected || !sdkReady) return;
    const el = previewRef.current;
    if (!el) return;
    const maps = kakaoMaps();
    if (!maps) return;
    const position = new maps.LatLng(selected.lat, selected.lon);
    const map = new maps.Map(el, { center: position, level: PREVIEW_LEVEL });
    new maps.Marker({ position, map });
  }, [selected, sdkReady]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const keyword = query.trim();
    if (!keyword || !sdkReady) return;

    const maps = kakaoMaps();
    if (!maps?.services) {
      setMessage(t("mapLoadFailed"));
      return;
    }

    setSearching(true);
    setResults([]);
    setMessage("");
    setSelected(null);

    const options: Record<string, unknown> = {};
    if (coords) options.location = new maps.LatLng(coords.lat, coords.lon);
    if (hospitalsOnly) options.category_group_code = HOSPITAL_CATEGORY;

    const places = new maps.services.Places();
    places.keywordSearch(
      keyword,
      (data: any[], status: string) => {
        setSearching(false);
        if (status === maps.services!.Status.OK) {
          setResults(
            data.map((item) => ({
              name: item.place_name,
              address: item.road_address_name || item.address_name || "",
              lat: Number(item.y),
              lon: Number(item.x),
              placeUrl: item.place_url || null,
            })),
          );
        } else if (status === maps.services!.Status.ZERO_RESULT) {
          setMessage(t("clinicSearchNoResult"));
        } else {
          setMessage(t("clinicSearchError"));
        }
      },
      options,
    );
  }

  return (
    <div className="confirm-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card clinic-search-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clinic-search-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="clinic-search-header">
          <h2 id="clinic-search-title" style={{ margin: 0 }}>
            {selected ? t("clinicSearchConfirmTitle") : t("clinicSearchTitle")}
          </h2>
          <button type="button" className="secondary clinic-search-close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>

        {!selected ? (
          <>
            <form onSubmit={handleSearch} className="clinic-search-form">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("clinicSearchPlaceholder")}
                autoFocus
              />
              <button type="submit" disabled={!query.trim() || !sdkReady || searching}>
                {searching ? t("clinicSearching") : t("clinicSearchButton")}
              </button>
            </form>

            <label className="clinic-search-filter">
              <input
                type="checkbox"
                checked={hospitalsOnly}
                onChange={(e) => setHospitalsOnly(e.target.checked)}
              />
              {t("clinicSearchHospitalsOnly")}
            </label>

            {message && <p className="clinic-search-message">{message}</p>}

            <div className="clinic-search-results">
              {results.map((res) => (
                <button
                  key={`${res.name}|${res.lat}|${res.lon}`}
                  type="button"
                  className="clinic-search-result"
                  onClick={() => setSelected(res)}
                >
                  <span className="clinic-search-result-name">{res.name}</span>
                  {res.address && <span className="clinic-search-result-address">{res.address}</span>}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="clinic-search-confirm">
            <div className="clinic-search-result clinic-search-result-static">
              <span className="clinic-search-result-name">{selected.name}</span>
              {selected.address && (
                <span className="clinic-search-result-address">{selected.address}</span>
              )}
            </div>
            <div
              ref={previewRef}
              className="clinic-search-preview"
              style={{ filter: isDark ? DARK_MAP_FILTER : undefined }}
            />
            <div className="clinic-search-actions">
              <button type="button" className="secondary" onClick={() => setSelected(null)}>
                {t("clinicSearchBack")}
              </button>
              <button type="button" onClick={() => onSelect(selected)}>
                {t("clinicSearchSelect")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
