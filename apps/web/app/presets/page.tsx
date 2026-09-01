"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { useToast } from "../../lib/toast-context";
import type { EventTypeAliasesRow, Pet, PresetDetail } from "../../lib/types";

export default function PresetsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const { show } = useToast();
  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState<string>("");
  const [presets, setPresets] = useState<PresetDetail[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeAliasesRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  const loadPresets = useCallback(async (selectedPetId: string) => {
    if (!selectedPetId) return;
    const rows = await apiJson<PresetDetail[]>(
      `/api/presets?petId=${encodeURIComponent(selectedPetId)}&includeHidden=1`,
    );
    setPresets(rows);
  }, []);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const petRows = await apiJson<Pet[]>("/api/pets");
      setPets(petRows);
      if (petRows[0]) setPetId(petRows[0].id);
      setEventTypes(await apiJson<EventTypeAliasesRow[]>("/api/event-types"));
    })();
  }, [user]);

  useEffect(() => {
    if (petId) void loadPresets(petId);
  }, [petId, loadPresets]);

  async function savePreset(preset: PresetDetail) {
    setSavingId(preset.id);
    try {
      await apiJson(`/api/presets/${preset.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          label: preset.label,
          sortOrder: preset.sortOrder,
        }),
      });
      show(t("presetsSavedToast"), "success");
      await loadPresets(petId);
    } catch {
      show(t("recordError"), "error");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleHidden(preset: PresetDetail) {
    setSavingId(preset.id);
    try {
      await apiJson(`/api/presets/${preset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ hidden: !preset.hiddenAt }),
      });
      await loadPresets(petId);
    } catch {
      show(t("recordError"), "error");
    } finally {
      setSavingId(null);
    }
  }

  async function saveAliases(row: EventTypeAliasesRow, raw: string) {
    const aliases = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await apiJson(`/api/event-types/${encodeURIComponent(row.key)}/aliases`, {
        method: "PATCH",
        body: JSON.stringify({ aliases }),
      });
      setEventTypes(await apiJson<EventTypeAliasesRow[]>("/api/event-types"));
      show(t("presetsSavedToast"), "success");
    } catch {
      show(t("recordError"), "error");
    }
  }

  if (loading || !user) return null;

  return (
    <main className="container sub-page">
      <h1>{t("presetsTitle")}</h1>
      <p className="meta">{t("presetsIntro")}</p>

      {pets.length >= 2 && (
        <>
          <label className="field-label" htmlFor="presets-pet">
            {t("presetsPetLabel")}
          </label>
          <select
            id="presets-pet"
            value={petId}
            onChange={(e) => setPetId(e.target.value)}
            className="presets-pet-select"
          >
            {pets.map((pet) => (
              <option key={pet.id} value={pet.id}>
                {pet.name}
              </option>
            ))}
          </select>
        </>
      )}

      <ul className="preset-manage-list">
        {presets.map((preset) => (
          <li key={preset.id} className="preset-manage-item card">
            <div className="preset-manage-row">
              <label className="field-label" htmlFor={`preset-label-${preset.id}`}>
                {t(preset.eventType.label)}
                {preset.hiddenAt && (
                  <span className="preset-hidden-badge">{t("presetsHiddenBadge")}</span>
                )}
              </label>
              <input
                id={`preset-label-${preset.id}`}
                value={preset.label.startsWith("eventType.") ? t(preset.label) : preset.label}
                onChange={(e) =>
                  setPresets((rows) =>
                    rows.map((r) => (r.id === preset.id ? { ...r, label: e.target.value } : r)),
                  )
                }
              />
            </div>
            <div className="preset-manage-row preset-manage-row-inline">
              <label className="field-label" htmlFor={`preset-sort-${preset.id}`}>
                {t("presetsSortOrder")}
              </label>
              <input
                id={`preset-sort-${preset.id}`}
                type="number"
                min={0}
                max={9999}
                className="preset-sort-input"
                value={preset.sortOrder}
                onChange={(e) =>
                  setPresets((rows) =>
                    rows.map((r) =>
                      r.id === preset.id ? { ...r, sortOrder: Number(e.target.value) } : r,
                    ),
                  )
                }
              />
            </div>
            <div className="preset-manage-actions">
              <button
                type="button"
                disabled={savingId === preset.id}
                onClick={() => void savePreset(preset)}
              >
                {savingId === preset.id ? t("saving") : t("save")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={savingId === preset.id}
                onClick={() => void toggleHidden(preset)}
              >
                {preset.hiddenAt ? t("presetsShowChip") : t("presetsHideChip")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <section className="card presets-aliases-section">
        <h2>{t("presetsAliasesTitle")}</h2>
        <p className="meta">{t("presetsAliasesHint")}</p>
        <ul className="preset-alias-list">
          {eventTypes.map((row) => (
            <PresetAliasRow key={row.key} row={row} t={t} onSave={saveAliases} />
          ))}
        </ul>
      </section>
    </main>
  );
}

function PresetAliasRow({
  row,
  t,
  onSave,
}: {
  row: EventTypeAliasesRow;
  t: (key: string) => string;
  onSave: (row: EventTypeAliasesRow, raw: string) => Promise<void>;
}) {
  const [value, setValue] = useState(row.aliases.join(", "));

  useEffect(() => {
    setValue(row.aliases.join(", "));
  }, [row.aliases]);

  return (
    <li className="preset-alias-item">
      <label className="field-label" htmlFor={`alias-${row.key}`}>
        {t(row.label)}
      </label>
      <input
        id={`alias-${row.key}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={row.systemAliases.join(", ")}
      />
      <button type="button" className="secondary" onClick={() => void onSave(row, value)}>
        {t("save")}
      </button>
    </li>
  );
}
