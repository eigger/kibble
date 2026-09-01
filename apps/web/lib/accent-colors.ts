import type { TranslationKey } from "./i18n/translations";

export const ACCENT_STORAGE_KEY = "kibble_accent_color";

export type AccentColor = "amber" | "terracotta" | "blue" | "sage";

export const DEFAULT_ACCENT_COLOR: AccentColor = "amber";

const ACCENT_COLOR_SET = new Set<string>(["amber", "terracotta", "blue", "sage"]);

export function isAccentColor(value: string | null | undefined): value is AccentColor {
  return value != null && ACCENT_COLOR_SET.has(value);
}

export const ACCENT_SWATCHES: {
  value: AccentColor;
  hex: string;
  labelKey: TranslationKey;
}[] = [
  { value: "amber", hex: "#c47a2c", labelKey: "accentAmber" },
  { value: "terracotta", hex: "#c45c3e", labelKey: "accentTerracotta" },
  { value: "blue", hex: "#1d5fa8", labelKey: "accentBlue" },
  { value: "sage", hex: "#4a7c59", labelKey: "accentSage" },
];

export function applyAccentColor(accent: AccentColor) {
  document.documentElement.setAttribute("data-accent", accent);
}
