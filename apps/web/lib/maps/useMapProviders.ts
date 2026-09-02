"use client";

import { useEffect, useState } from "react";
import { apiJson } from "../api";
import { EMPTY_MAP_CONFIG, type MapProvidersConfig } from "./types";

/** 실패하면 빈 설정 그대로 — 지도 기능이 조용히 숨을 뿐 화면이 깨지지 않는다. */
export function useMapProviders(enabled = true): MapProvidersConfig {
  const [config, setConfig] = useState<MapProvidersConfig>(EMPTY_MAP_CONFIG);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void apiJson<MapProvidersConfig>("/api/map/providers")
      .then((data) => {
        if (!cancelled && data) setConfig(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return config;
}
