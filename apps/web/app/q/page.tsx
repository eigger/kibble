"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";

export default function QuickRecordPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useLocale();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <main className="container">
      <h1>{t("navHome")}</h1>
      <p className="meta">빠른 기록 화면 — P1-25에서 프리셋 칩으로 구현 예정</p>
    </main>
  );
}
