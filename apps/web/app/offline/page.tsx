"use client";

import Link from "next/link";
import { useLocale } from "../../lib/i18n/locale-context";

export default function OfflinePage() {
  const { t } = useLocale();
  return (
    <main className="container">
      <h1>{t("offlineTitle")}</h1>
      <p className="scan-hint">{t("offlineBody")}</p>
      <p className="meta">
        <Link href="/">{t("navHome")}</Link>
      </p>
    </main>
  );
}
