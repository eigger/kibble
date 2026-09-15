"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { routineItemSummary } from "../../lib/routines";
import type { EventTypeAliasesRow, Pet, PresetDetail, Product, Routine } from "../../lib/types";
import { RoutineEditSheet } from "../../components/RoutineEditSheet";

/** 루틴 관리 — 더보기 → 루틴 (§7.24). 누르는 곳은 /q의 루틴 패널이다 */
export default function RoutinesPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t, tLabel } = useLocale();

  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [presets, setPresets] = useState<PresetDetail[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeAliasesRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Routine | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const [petRows, typeRows] = await Promise.all([
          apiJson<Pet[]>("/api/pets"),
          apiJson<EventTypeAliasesRow[]>("/api/event-types"),
        ]);
        setPets(petRows);
        setEventTypes(typeRows);
        if (petRows[0]) setPetId(petRows[0].id);
        else setDataLoading(false);
      } catch {
        setLoadError(t("routinesLoadError"));
        setDataLoading(false);
      }
    })();
  }, [user, t]);

  const loadForPet = useCallback(
    async (selectedPetId: string) => {
      setDataLoading(true);
      setLoadError(null);
      try {
        const qs = `petId=${encodeURIComponent(selectedPetId)}`;
        const [routineRows, presetRows, productRows] = await Promise.all([
          apiJson<Routine[]>(`/api/routines?${qs}`),
          apiJson<PresetDetail[]>(`/api/presets?${qs}&includeHidden=1`),
          apiJson<Product[]>(`/api/products?${qs}&isActive=true`),
        ]);
        setRoutines(routineRows);
        setPresets(presetRows);
        setProducts(productRows);
      } catch {
        setLoadError(t("routinesLoadError"));
      } finally {
        setDataLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (petId) void loadForPet(petId);
  }, [petId, loadForPet]);

  // 투약은 처방·회차가 끼어 1탭이 안 된다 — 서버도 거부한다
  const routinePresets = useMemo(
    () => presets.filter((p) => p.eventType.key !== "medication"),
    [presets],
  );

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(routine: Routine) {
    setEditing(routine);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditing(null);
  }

  function handleSaved(saved: Routine) {
    setRoutines((prev) => {
      const exists = prev.some((r) => r.id === saved.id);
      return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved];
    });
    closeSheet();
  }

  function handleDeleted(id: string) {
    setRoutines((prev) => prev.filter((r) => r.id !== id));
    closeSheet();
  }

  if (loading || !user) return null;

  return (
    <main className="container sub-page">
      <header className="page-header">
        <div className="page-header-row">
          <div className="page-header-text">
            <h1>{t("routinesTitle")}</h1>
            <p className="meta">{t("routinesIntro")}</p>
          </div>
          <button
            type="button"
            className="page-add-btn"
            onClick={openNew}
            disabled={!petId || dataLoading}
          >
            + {t("routinesNew")}
          </button>
        </div>
        {pets.length >= 2 && (
          <div className="pet-tabs" role="tablist" aria-label={t("homePetTabsLabel")}>
            {pets.map((pet) => (
              <button
                key={pet.id}
                type="button"
                role="tab"
                aria-selected={pet.id === petId}
                className={`pet-tab${pet.id === petId ? " pet-tab-active" : ""}`}
                onClick={() => setPetId(pet.id)}
              >
                {pet.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {dataLoading ? (
        <p className="meta">{t("loading")}</p>
      ) : loadError ? (
        <p className="error-text">{loadError}</p>
      ) : routines.length === 0 ? (
        <p className="meta">
          {t("routinesEmpty")} {t("routinesHint")}
        </p>
      ) : (
        <ul className="manage-card-list">
          {routines.map((routine) => (
            <li key={routine.id} className="manage-card">
              <div className="manage-card-main">
                <p className="manage-card-name">{routine.label}</p>
                <p className="manage-card-meta meta">
                  {routine.items.map((item) => routineItemSummary(item, tLabel)).join(" · ")}
                </p>
              </div>
              <div className="manage-card-actions">
                <button type="button" className="btn-action" onClick={() => openEdit(routine)}>
                  {t("edit")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <RoutineEditSheet
        open={sheetOpen}
        petId={petId}
        routine={editing}
        presets={routinePresets}
        eventTypes={eventTypes}
        products={products}
        onClose={closeSheet}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </main>
  );
}
