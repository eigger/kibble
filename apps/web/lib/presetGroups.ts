import type { Preset } from "./types";

export const PRESET_CATEGORY_ORDER = [
  "FEEDING",
  "EXCRETION",
  "ACTIVITY",
  "HEALTH",
  "CARE",
  "MEDICAL",
  "NOTE",
] as const;

export type PresetCategory = (typeof PRESET_CATEGORY_ORDER)[number];

export interface PresetCategoryGroup {
  category: PresetCategory;
  presets: Preset[];
}

export function groupPresetsByCategory(presets: Preset[]): PresetCategoryGroup[] {
  const byCategory = new Map<PresetCategory, Preset[]>();

  for (const preset of presets) {
    const raw = preset.eventType?.category ?? "NOTE";
    const category = (PRESET_CATEGORY_ORDER as readonly string[]).includes(raw)
      ? (raw as PresetCategory)
      : "NOTE";
    const list = byCategory.get(category) ?? [];
    list.push(preset);
    byCategory.set(category, list);
  }

  return PRESET_CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => ({
    category,
    presets: byCategory.get(category)!,
  }));
}
