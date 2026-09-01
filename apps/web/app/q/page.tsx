"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { createEventWithOfflineFallback } from "../../lib/createEventOffline";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { useToast } from "../../lib/toast-context";
import type { Pet, Preset } from "../../lib/types";
import { PresetChip, MorePresetItem } from "../../components/PresetChip";

function newDedupeKey(petId: string, presetId: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  const suffix = uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `quick:${petId}:${presetId}:${suffix}`;
}

export default function QuickRecordPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const needsPet = user?.needsPet;
  const { t } = useLocale();
  const { show } = useToast();
  const [pet, setPet] = useState<Pet | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inFlightDedupeKey = useRef<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && needsPet) router.push("/onboarding");
  }, [loading, needsPet, router]);

  const loadQuickData = useCallback(async () => {
    setDataLoading(true);
    setLoadError(null);
    try {
      const pets = await apiJson<Pet[]>("/api/pets");
      const active = pets[0] ?? null;
      setPet(active);
      if (!active) {
        setPresets([]);
        return;
      }
      const rows = await apiJson<Preset[]>(`/api/presets?petId=${encodeURIComponent(active.id)}`);
      setPresets(rows);
    } catch {
      setLoadError(t("quickRecordLoadError"));
      setPet(null);
      setPresets([]);
    } finally {
      setDataLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!user || needsPet) return;
    void loadQuickData();
  }, [user, needsPet, loadQuickData]);

  const starterPresets = useMemo(() => presets.filter((p) => p.isStarter), [presets]);
  const morePresets = useMemo(() => presets.filter((p) => !p.isStarter), [presets]);

  function onPresetTap(preset: Preset) {
    if (!pet || recording) return;
    setRecording(true);
    const label = t(preset.label);
    const dedupeKey = inFlightDedupeKey.current ?? newDedupeKey(pet.id, preset.id);
    inFlightDedupeKey.current = dedupeKey;

    void (async () => {
      try {
        const outcome = await createEventWithOfflineFallback({
          labelKey: preset.label,
          body: {
            petId: pet.id,
            presetId: preset.id,
            source: "QUICK",
            dedupeKey,
          },
        });

        if (outcome.status === "queued") {
          show(t("offlineQueuedToast"), "info");
          return;
        }

        const event = outcome.event;

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

  if (loading || !user || needsPet) return null;

  return (
    <main className="container quick-record-page">
      <header className="quick-record-header">
        <h1>{t("quickRecordTitle")}</h1>
        {pet && <p className="meta quick-record-pet">{pet.name}</p>}
      </header>

      {dataLoading ? (
        <p className="meta">{t("loading")}</p>
      ) : loadError ? (
        <p className="error-text">{loadError}</p>
      ) : presets.length === 0 ? (
        <p className="meta">{t("homeNoPresets")}</p>
      ) : (
        <section className="quick-record-chips" aria-label={t("homeQuickRecord")}>
          <div className="chip-row">
            {starterPresets.map((preset) => (
              <PresetChip
                key={preset.id}
                preset={preset}
                label={t(preset.label)}
                disabled={recording}
                tapOnly
                onTap={onPresetTap}
              />
            ))}
          </div>
          {morePresets.length > 0 && (
            <button
              type="button"
              className="btn-link"
              disabled={recording}
              onClick={() => setMoreOpen(true)}
            >
              {t("homeMorePresets", { count: String(morePresets.length) })}
            </button>
          )}
        </section>
      )}

      <p className="meta quick-record-footer">
        <Link href="/">{t("quickRecordOpenHome")}</Link>
      </p>

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
                <MorePresetItem
                  key={preset.id}
                  label={t(preset.label)}
                  disabled={recording}
                  tapOnly
                  onTap={() => {
                    setMoreOpen(false);
                    onPresetTap(preset);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
