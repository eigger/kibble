"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  translate,
  translateLabel,
  type Locale,
  type TranslationKey,
} from "./translations";

const STORAGE_KEY = "kibble_locale";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** i18n 번역 함수. 사전 키만 허용하여 미정의 키 컴파일 차단 */
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  /** 사전 키이거나 사용자가 지은 DB 리터럴 이름. 사전에 없으면 그대로 보여준다. */
  tLabel: (labelOrKey: string, params?: Record<string, string | number>) => string;
  formatDateTime: (iso: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const INTL_LOCALE: Record<Locale, string> = { ko: "ko-KR", en: "en-US" };

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

  function t(key: TranslationKey, params?: Record<string, string | number>): string {
    return translate(locale, key, params);
  }

  function tLabel(labelOrKey: string, params?: Record<string, string | number>): string {
    return translateLabel(locale, labelOrKey, params);
  }

  function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString(INTL_LOCALE[locale]);
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t, tLabel, formatDateTime }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
