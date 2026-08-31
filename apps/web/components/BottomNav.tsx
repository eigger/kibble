"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { useLocale } from "../lib/i18n/locale-context";
import type { TranslationKey } from "../lib/i18n/translations";

const TABS: { href: string; labelKey: TranslationKey }[] = [
  { href: "/", labelKey: "navHome" },
  { href: "/settings", labelKey: "settingsLabel" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useLocale();

  if (!user || pathname === "/login") return null;

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} className={pathname === tab.href ? "active" : ""}>
            {t(tab.labelKey)}
          </Link>
        ))}
      </div>
    </nav>
  );
}
