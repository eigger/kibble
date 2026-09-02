"use client";

import { buildNavUrl, NAV_PROVIDERS, type NavDestination } from "../lib/navigation/deepLinks";
import { useLocale } from "../lib/i18n/locale-context";

type NavLaunchButtonsProps = {
  destination: NavDestination;
  heading?: string;
};

/** 좌표만 있으면 뜬다 — 딥링크는 지도 API 키와 무관하다. */
export function NavLaunchButtons({ destination, heading }: NavLaunchButtonsProps) {
  const { t } = useLocale();

  return (
    <div className="nav-launch">
      <span className="event-detail-chip-hint">{heading ?? t("navLaunchHeading")}</span>
      <div className="nav-launch-row">
        {NAV_PROVIDERS.map((provider) => (
          <a
            key={provider}
            className="nav-launch-button"
            href={buildNavUrl(provider, destination)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t(`navProvider.${provider}`)}
          </a>
        ))}
      </div>
    </div>
  );
}
