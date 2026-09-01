"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useLocale } from "../lib/i18n/locale-context";
import { useToast } from "../lib/toast-context";
import type { Pet, Preset, CreatedEvent } from "../lib/types";

interface HomePayload {
  activePet: Pet | null;
  presets: Preset[];
}

function newDedupeKey(petId: string, presetId: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  const suffix = uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `web:${petId}:${presetId}:${suffix}`;
}

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const userId = user?.id;
  const needsPet = user?.needsPet;
  const { t } = useLocale();
  const { show } = useToast();
  const [activePet, setActivePet] = useState<Pet | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && needsPet) router.push("/onboarding");
  }, [loading, needsPet, router]);

  useEffect(() => {
    if (!userId || needsPet) return;
    let cancelled = false;
    setDataLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const data = await apiJson<HomePayload>("/api/home");
        if (cancelled) return;
        setActivePet(data.activePet);
        setPresets(data.presets);
      } catch (err) {
        if (cancelled) return;
        setActivePet(null);
        setPresets([]);
        if (err instanceof ApiError) {
          if (err.status === 401) {
            router.push("/login");
            return;
          }
          if (err.status === 403) {
            setLoadError(t("homeForbidden"));
            return;
          }
        }
        setLoadError(t("homeLoadError"));
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, needsPet, router, t]);

  const starterPresets = useMemo(() => presets.filter((p) => p.isStarter), [presets]);
  const morePresets = useMemo(() => presets.filter((p) => !p.isStarter), [presets]);

  const [recording, setRecording] = useState(false);
  const inFlightDedupeKey = useRef<string | null>(null);

  function onPresetTap(preset: Preset) {
    if (!activePet || recording) return;
    setRecording(true);
    const label = t(preset.label);
    const dedupeKey = inFlightDedupeKey.current ?? newDedupeKey(activePet.id, preset.id);
    inFlightDedupeKey.current = dedupeKey;

    (async () => {
      try {
        const event = await apiJson<CreatedEvent>("/api/events", {
          method: "POST",
          body: JSON.stringify({
            petId: activePet.id,
            presetId: preset.id,
            source: "WEB",
            dedupeKey,
          }),
        });
        show(t("recordSaved", { label }), "success", {
          label: t("undo"),
          onClick: () => {
            void (async () => {
              try {
                await apiJson(`/api/events/${event.id}`, { method: "DELETE" });
                show(t("recordUndone"), "info");
              } catch {
                show(t("recordError"), "error");
              }
            })();
          },
        });
      } catch {
        show(t("recordError"), "error");
      } finally {
        inFlightDedupeKey.current = null;
        setRecording(false);
      }
    })();
  }

  if (loading || !user || needsPet) {
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
      ) : loadError ? (
        <p className="error-text">{loadError}</p>
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
                    disabled={recording}
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
                  disabled={recording}
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
