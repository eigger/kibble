"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useLocale } from "../lib/i18n/locale-context";
import { useToast } from "../lib/toast-context";
import type { Pet, Preset } from "../lib/types";

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const { show } = useToast();
  const [pets, setPets] = useState<Pet[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user?.needsPet) router.push("/onboarding");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || user.needsPet) return;
    let cancelled = false;
    setDataLoading(true);
    (async () => {
      try {
        const petList = await apiJson<Pet[]>("/api/pets");
        if (cancelled) return;
        setPets(petList);
        const activePet = petList[0];
        if (!activePet) {
          setPresets([]);
          return;
        }
        const presetList = await apiJson<Preset[]>(`/api/presets?petId=${encodeURIComponent(activePet.id)}`);
        if (!cancelled) setPresets(presetList);
      } catch {
        if (!cancelled) {
          setPets([]);
          setPresets([]);
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const activePet = pets[0];
  const starterPresets = useMemo(() => presets.filter((p) => p.isStarter), [presets]);
  const morePresets = useMemo(() => presets.filter((p) => !p.isStarter), [presets]);

  function onPresetTap(preset: Preset) {
    show(t("recordComingSoon", { label: t(preset.label) }));
  }

  if (loading || !user || user.needsPet) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>{activePet ? activePet.name : t("appName")}</h1>
      {dataLoading ? (
        <p className="meta">{t("loading")}</p>
      ) : (
        <>
          <section className="dashboard-section">
            <h2>{t("homeQuickRecord")}</h2>
            {starterPresets.length > 0 ? (
              <div className="chip-row">
                {starterPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="chip"
                    onClick={() => onPresetTap(preset)}
                  >
                    {t(preset.label)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="meta">{t("homeNoPresets")}</p>
            )}
            {morePresets.length > 0 && (
              <button type="button" className="btn-link" onClick={() => setMoreOpen(true)}>
                {t("homeMorePresets", { count: morePresets.length })}
              </button>
            )}
          </section>
          <p className="meta">{t("homeOnboardingHint")}</p>
        </>
      )}

      {moreOpen && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setMoreOpen(false)}>
          <div
            className="sheet-card"
            role="dialog"
            aria-label={t("homeMorePresetsTitle")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-handle" />
            <h2>{t("homeMorePresetsTitle")}</h2>
            <div className="sheet-grid">
              {morePresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="sheet-item"
                  onClick={() => {
                    setMoreOpen(false);
                    onPresetTap(preset);
                  }}
                >
                  {t(preset.label)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
