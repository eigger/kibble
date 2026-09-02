"use client";

import { useEffect, useRef, useState, type ReactElement, type SVGProps } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { useLocale } from "../lib/i18n/locale-context";
import { initBugReportCapture } from "../lib/bugReport";
import type { TranslationKey } from "../lib/i18n/translations";
import { BugReportModal } from "./BugReportModal";

function iconProps(): SVGProps<SVGSVGElement> {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
}

function HomeIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10" />
      <path d="M10 20.5V15h4v5.5" />
    </svg>
  );
}

function CareIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M8.5 12a3.5 3.5 0 0 1 7 0v4.5a3.5 3.5 0 0 1-7 0z" />
      <path d="M15.5 12a3.5 3.5 0 0 1-7 0V7.5a3.5 3.5 0 0 1 7 0z" />
    </svg>
  );
}

function RecordIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M4 10h16" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PetMenuIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 11c-2.2 0-4 1.3-4 3.5S9.8 18 12 18s4-1.3 4-3.5S14.2 11 12 11z" />
      <circle cx="8" cy="9" r="1.5" />
      <circle cx="16" cy="9" r="1.5" />
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </svg>
  );
}

function PresetMenuIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M7 7h10v4H7z" />
      <path d="M9 11v6" />
      <path d="M15 11v6" />
      <path d="M7 17h10" />
    </svg>
  );
}

function AnalyticsMenuIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 17V11" />
      <path d="M12 17V7" />
      <path d="M16 17v-4" />
    </svg>
  );
}

function SettingsMenuIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function UsersMenuIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IntegrationsMenuIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M10 3v6" />
      <path d="M14 3v6" />
      <path d="M6 9h12v3a6 6 0 0 1-12 0z" />
      <path d="M12 18v3" />
    </svg>
  );
}

function BackupMenuIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 3v12" />
      <path d="m8 11 4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function IssueMenuIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

const NAV_TABS_LEFT: {
  href: string;
  labelKey: TranslationKey;
  Icon: () => ReactElement;
}[] = [
  { href: "/", labelKey: "navHome", Icon: HomeIcon },
  { href: "/care", labelKey: "navCare", Icon: CareIcon },
];

const NAV_TAB_CENTER = {
  href: "/q",
  labelKey: "navQuickRecord" as TranslationKey,
  Icon: RecordIcon,
};

const NAV_TABS_RIGHT: {
  href: string;
  labelKey: TranslationKey;
  Icon: () => ReactElement;
}[] = [{ href: "/history", labelKey: "navHistory", Icon: HistoryIcon }];

/** 더보기 시트에서만 열리는 화면 — 탭 강조용 */
const MORE_ROUTES = ["/settings", "/backup", "/pets", "/presets", "/users", "/analytics"];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { t } = useLocale();
  const [moreOpen, setMoreOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initBugReportCapture();
  }, []);

  const moreActive =
    moreOpen || MORE_ROUTES.some((r) => pathname === r || pathname?.startsWith(`${r}/`));

  useEffect(() => {
    if (!moreOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [moreOpen]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  if (!user || pathname === "/login" || pathname === "/onboarding") return null;

  function go(href: string) {
    setMoreOpen(false);
    router.push(href);
  }

  return (
    <>
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {NAV_TABS_LEFT.map((tab) => {
            const active = pathname === tab.href;
            const label = t(tab.labelKey);
            return (
              <Link key={tab.href} href={tab.href} className={active ? "active" : ""}>
                <span className="icon">
                  <tab.Icon />
                </span>
                {label}
              </Link>
            );
          })}
          <Link
            href={NAV_TAB_CENTER.href}
            className={`scan-tab ${pathname === NAV_TAB_CENTER.href ? "active" : ""}`}
          >
            <span className="icon-wrap">
              <span className="icon">
                <NAV_TAB_CENTER.Icon />
              </span>
            </span>
            {t(NAV_TAB_CENTER.labelKey)}
          </Link>
          {NAV_TABS_RIGHT.map((tab) => {
            const active = pathname === tab.href;
            const label = t(tab.labelKey);
            return (
              <Link key={tab.href} href={tab.href} className={active ? "active" : ""}>
                <span className="icon">
                  <tab.Icon />
                </span>
                {label}
              </Link>
            );
          })}
          <button
            type="button"
            className={`bottom-nav-more${moreActive ? " active" : ""}`}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <span className="icon">
              <MoreIcon />
            </span>
            {t("navMore")}
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setMoreOpen(false)}>
          <div
            ref={sheetRef}
            className="sheet-card more-menu-sheet"
            role="menu"
            aria-label={t("navMore")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-handle" />
            <p className="more-menu-heading">{t("navMore")}</p>

            <p className="sheet-group-label">{t("menuGroupJournal")}</p>
            <div className="sheet-grid">
              <button type="button" className="sheet-item" onClick={() => go("/analytics")}>
                <span className="sheet-item-icon">
                  <AnalyticsMenuIcon />
                </span>
                {t("navAnalytics")}
              </button>
            </div>

            <p className="sheet-group-label">{t("menuGroupManage")}</p>
            <div className="sheet-grid">
              <button type="button" className="sheet-item" onClick={() => go("/pets")}>
                <span className="sheet-item-icon">
                  <PetMenuIcon />
                </span>
                {t("petsTitle")}
              </button>
              <button type="button" className="sheet-item" onClick={() => go("/presets")}>
                <span className="sheet-item-icon">
                  <PresetMenuIcon />
                </span>
                {t("presetsManageLink")}
              </button>
            </div>

            <p className="sheet-group-label">{t("menuGroupAccount")}</p>
            <div className="sheet-grid">
              <button type="button" className="sheet-item" onClick={() => go("/settings")}>
                <span className="sheet-item-icon">
                  <SettingsMenuIcon />
                </span>
                {t("settingsLabel")}
              </button>
              {isAdmin && (
                <>
                  <button type="button" className="sheet-item" onClick={() => go("/backup")}>
                    <span className="sheet-item-icon">
                      <BackupMenuIcon />
                    </span>
                    {t("backupRestoreTitle")}
                  </button>
                  <button type="button" className="sheet-item" onClick={() => go("/users")}>
                    <span className="sheet-item-icon">
                      <UsersMenuIcon />
                    </span>
                    {t("usersTitle")}
                  </button>
                  <button type="button" className="sheet-item" onClick={() => go("/integrations")}>
                    <span className="sheet-item-icon">
                      <IntegrationsMenuIcon />
                    </span>
                    {t("integrationsTitle")}
                  </button>
                </>
              )}
              <button
                type="button"
                className="sheet-item"
                onClick={() => {
                  setMoreOpen(false);
                  setBugReportOpen(true);
                }}
              >
                <span className="sheet-item-icon">
                  <IssueMenuIcon />
                </span>
                {t("navReportIssue")}
              </button>
            </div>

            {process.env.APP_VERSION && (
              <p className="more-menu-version meta">v{process.env.APP_VERSION}</p>
            )}
          </div>
        </div>
      )}
      {bugReportOpen && <BugReportModal onClose={() => setBugReportOpen(false)} />}
    </>
  );
}
