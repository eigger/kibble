"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { apiJson } from "../../lib/api";
import { formatApiErrorMessage } from "../../lib/apiErrorMessage";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { routineItemSummary } from "../../lib/routines";
import { useToast } from "../../lib/toast-context";
import type { EventTypeAliasesRow, Pet, PresetDetail, Product, Routine } from "../../lib/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { RoutineEditSheet } from "../../components/RoutineEditSheet";

/** 루틴 관리 — 더보기 → 루틴 (§7.24). 누르는 곳은 /q의 루틴 패널이다 */
export default function RoutinesPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t, tLabel, locale } = useLocale();
  const { show } = useToast();

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
  const [deleteTarget, setDeleteTarget] = useState<Routine | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  function handleSaved(saved: Routine) {
    setRoutines((prev) => {
      const exists = prev.some((r) => r.id === saved.id);
      return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved];
    });
    setSheetOpen(false);
    setEditing(null);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await apiJson(`/api/routines/${deleteTarget.id}`, { method: "DELETE" });
      setRoutines((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      show(t("routinesDeletedToast"), "success");
      setDeleteTarget(null);
    } catch (err) {
      show(formatApiErrorMessage(err, t("recordError"), locale), "error");
    } finally {
      setDeleting(false);
    }
  }

  if (loading || !user) return null;

  return (
    <main className="container sub-page">
      <h1>{t("routinesTitle")}</h1>
      <p className="meta">{t("routinesIntro")}</p>

      {pets.length >= 2 && (
        <>
          <label className="field-label" htmlFor="routines-pet">
            {t("presetsPetLabel")}
          </label>
          <select
            id="routines-pet"
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

      <div className="routines-toolbar">
        <button type="button" className="primary" onClick={openNew} disabled={!petId || dataLoading}>
          + {t("routinesNew")}
        </button>
      </div>

      {dataLoading ? (
        <p className="meta">{t("loading")}</p>
      ) : loadError ? (
        <p className="error-text">{loadError}</p>
      ) : routines.length === 0 ? (
        <p className="meta">{t("routinesEmpty")}</p>
      ) : (
        <ul className="preset-manage-list">
          {routines.map((routine) => (
            <li key={routine.id} className="preset-manage-item card routine-card">
              <div className="routine-card-head">
                <h2 className="routine-card-title">{routine.label}</h2>
              </div>
              <ul className="routine-card-items">
                {routine.items.map((item) => (
                  <li key={item.id}>{routineItemSummary(item, tLabel)}</li>
                ))}
              </ul>
              <div className="preset-manage-actions">
                <button type="button" onClick={() => openEdit(routine)}>
                  {t("edit")}
                </button>
                <button type="button" className="secondary" onClick={() => setDeleteTarget(routine)}>
                  {t("delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="meta routines-hint">{t("routinesHint")}</p>

      <RoutineEditSheet
        open={sheetOpen}
        petId={petId}
        routine={editing}
        presets={routinePresets}
        eventTypes={eventTypes}
        products={products}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        title={t("routineDeleteConfirmTitle")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        danger
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => (deleting ? undefined : setDeleteTarget(null))}
      />
    </main>
  );
}
