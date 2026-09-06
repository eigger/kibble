export const locales = ["ko", "en"] as const;
export type Locale = (typeof locales)[number];

export const LOCALE_STORAGE_KEY = "kibble_locale";

export const INTL_LOCALE: Record<Locale, string> = {
  ko: "ko-KR",
  en: "en-US",
};

export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale] ?? "ko-KR";
}

export function parseLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "ko";
}

