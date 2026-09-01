"use client";

import { ACCENT_SWATCHES } from "../lib/accent-colors";
import { useTheme } from "../lib/theme-context";
import { useLocale } from "../lib/i18n/locale-context";

export function AccentColorToggle() {
  const { accentColor, setAccentColor } = useTheme();
  const { t } = useLocale();

  return (
    <div className="accent-swatch-row" role="group" aria-label={t("accentColorLabel")}>
      {ACCENT_SWATCHES.map((swatch) => (
        <button
          key={swatch.value}
          type="button"
          className="accent-swatch"
          onClick={() => setAccentColor(swatch.value)}
          title={t(swatch.labelKey)}
          aria-label={t(swatch.labelKey)}
          aria-pressed={accentColor === swatch.value}
          style={{ background: swatch.hex }}
        />
      ))}
    </div>
  );
}
