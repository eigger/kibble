"use client";

import { useEffect, useState } from "react";
import { apiJson } from "../lib/api";
import type { TranslationKey } from "../lib/i18n/translations";

type EventTypeOption = { key: string; label: string };

/**
 * 이력의 기록 종류 필터. 서버가 이미 `eventTypeKey`를 받으므로 여기서는 고르기만 한다.
 *
 * 목록은 시스템 이벤트 타입 전체다 — 이 펫에 기록이 있는 종류만 추리려면 패싯
 * 엔드포인트가 필요한데, 지금은 고른 종류에 기록이 없으면 빈 목록이 보인다.
 */
export function HistoryTypeFilter({
  value,
  onChange,
  t,
  tLabel,
}: {
  value: string;
  onChange: (eventTypeKey: string) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  tLabel: (labelOrKey: string) => string;
}) {
  const [types, setTypes] = useState<EventTypeOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    void apiJson<EventTypeOption[]>("/api/event-types")
      .then((rows) => {
        if (!cancelled) setTypes(rows);
      })
      .catch(() => {
        if (!cancelled) setTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <select
      className="history-period-select history-type-select"
      aria-label={t("historyTypeFilterLabel")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={types.length === 0}
    >
      <option value="">{t("historyTypeFilterAll")}</option>
      {types.map((type) => (
        <option key={type.key} value={type.key}>
          {tLabel(type.label)}
        </option>
      ))}
    </select>
  );
}
