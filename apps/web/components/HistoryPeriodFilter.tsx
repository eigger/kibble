"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../lib/api";
import type { TranslationKey } from "../lib/i18n/translations";

type PeriodParts = { year: string; month: string; day: string };

function parsePeriod(value: string): PeriodParts {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { year: value.slice(0, 4), month: value.slice(5, 7), day: value.slice(8, 10) };
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    return { year: value.slice(0, 4), month: value.slice(5, 7), day: "" };
  }
  if (/^\d{4}$/.test(value)) {
    return { year: value, month: "", day: "" };
  }
  return { year: "", month: "", day: "" };
}

function composePeriod(parts: PeriodParts): string {
  if (!parts.year) return "";
  if (!parts.month) return parts.year;
  if (!parts.day) return `${parts.year}-${parts.month}`;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function HistoryPeriodFilter({
  value,
  onChange,
  t,
  petId,
}: {
  value: string;
  onChange: (period: string) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  petId: string;
}) {
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const parts = parsePeriod(value);

  useEffect(() => {
    let cancelled = false;
    async function loadPeriods() {
      try {
        const data = await apiJson<{ years?: string[]; months?: string[]; days?: string[] }>(
          `/api/events/history-periods?petId=${encodeURIComponent(petId)}`,
        );
        if (cancelled) return;
        setYears(Array.isArray(data.years) ? data.years : []);
        setMonths(Array.isArray(data.months) ? data.months : []);
        setDays(Array.isArray(data.days) ? data.days : []);
      } catch {
        if (!cancelled) {
          setYears([]);
          setMonths([]);
          setDays([]);
        }
      }
    }
    void loadPeriods();
    return () => {
      cancelled = true;
    };
  }, [petId]);

  const monthsForYear = useMemo(() => {
    if (!parts.year) return [] as string[];
    return months
      .filter((ym) => ym.startsWith(`${parts.year}-`))
      .map((ym) => ym.slice(5, 7));
  }, [months, parts.year]);

  const daysForMonth = useMemo(() => {
    if (!parts.year || !parts.month) return [] as string[];
    const prefix = `${parts.year}-${parts.month}-`;
    return days.filter((d) => d.startsWith(prefix)).map((d) => d.slice(8, 10));
  }, [days, parts.year, parts.month]);

  function emit(next: PeriodParts) {
    onChange(composePeriod(next));
  }

  return (
    <div className="history-period-filter">
      <div className="history-period-selects">
        <select
          value={parts.year}
          onChange={(e) => emit({ year: e.target.value, month: "", day: "" })}
          className="history-period-select"
          aria-label={t("periodFilterYear")}
          disabled={years.length === 0}
        >
          <option value="">{t("periodFilterYearPlaceholder")}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={parts.month}
          onChange={(e) => emit({ year: parts.year, month: e.target.value, day: "" })}
          className="history-period-select"
          aria-label={t("periodFilterMonth")}
          disabled={!parts.year || monthsForYear.length === 0}
        >
          <option value="">{t("periodFilterMonthPlaceholder")}</option>
          {monthsForYear.map((mm) => (
            <option key={mm} value={mm}>
              {t("periodMonthLabel", { month: Number(mm) })}
            </option>
          ))}
        </select>
        <select
          value={parts.day}
          onChange={(e) => emit({ year: parts.year, month: parts.month, day: e.target.value })}
          className="history-period-select"
          aria-label={t("periodFilterDay")}
          disabled={!parts.month || daysForMonth.length === 0}
        >
          <option value="">{t("periodFilterDayPlaceholder")}</option>
          {daysForMonth.map((dd) => (
            <option key={dd} value={dd}>
              {t("periodDayLabel", { day: Number(dd) })}
            </option>
          ))}
        </select>
      </div>
      {value && (
        <button type="button" className="secondary history-period-clear" onClick={() => onChange("")}>
          {t("periodFilterClear")}
        </button>
      )}
    </div>
  );
}
