"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { translations, type Locale, type TranslationKey } from "./translations";

const STORAGE_KEY = "kibble_locale";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** i18n 키 또는 DB 리터럴(프리셋 사용자 지정명). 미지 키는 그대로 반환한다. */
  t: (key: TranslationKey | string, params?: Record<string, string | number>) => string;
  formatDateTime: (iso: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const INTL_LOCALE: Record<Locale, string> = { ko: "ko-KR", en: "en-US" };

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ko");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial = stored === "en" || stored === "ko" ? stored : "ko";
    setLocaleState(initial);
    document.documentElement.lang = initial;
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }

  function t(key: TranslationKey | string, params?: Record<string, string | number>): string {
    const entry = translations[key as TranslationKey];
    if (!entry) return interpolate(key, params);
    return interpolate(entry[locale] ?? entry.ko, params);
  }

  function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString(INTL_LOCALE[locale]);
  }

  return <LocaleContext.Provider value={{ locale, setLocale, t, formatDateTime }}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
