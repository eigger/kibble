"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { useLocale } from "../lib/i18n/locale-context";

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useLocale();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>kibble</h1>
      <p className="meta">Phase 1 섀시 — 도메인 전멸 완료. 타임라인·입력 바는 다음 단계에서 추가됩니다.</p>
    </main>
  );
}
