"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { kstDayKey } from "@kibble/shared";
import {
  isRoutineItemSkipped,
  moveRoutine,
  performRoutineMove,
  routineItemSummary,
  type RoutineMoveDirection,
} from "../../lib/routines";
import type {
  EventTypeAliasesRow,
  MedicationCourseRow,
  Pet,
  PresetDetail,
  Product,
  Routine,
  RoutineItem,
} from "../../lib/types";
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
  const [courses, setCourses] = useState<MedicationCourseRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 순서 이동: 요청 중에는 다음 이동을 받지 않는다 (직렬화). 버튼은 disabled 대신 aria-disabled로 잠가 포커스를 지킨다
  const [reordering, setReordering] = useState(false);
  const reorderingRef = useRef(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [moveNote, setMoveNote] = useState("");
  const petIdRef = useRef("");
  const listRef = useRef<HTMLUListElement>(null);
  const [focusTarget, setFocusTarget] = useState<{ id: string; dir: RoutineMoveDirection } | null>(
    null,
  );

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
        const [routineRows, presetRows, productRows, courseRows] = await Promise.all([
          apiJson<Routine[]>(`/api/routines?${qs}`),
          apiJson<PresetDetail[]>(`/api/presets?${qs}&includeHidden=1`),
          apiJson<Product[]>(`/api/products?${qs}&isActive=true`),
          apiJson<{ courses: MedicationCourseRow[] }>(`/api/care/medication-courses?${qs}`),
        ]);
        setRoutines(routineRows);
        setPresets(presetRows);
        setProducts(productRows);
        // 진행 중만 — endDate가 지난 처방은 보관 전이어도 "지난 처방"이다 (§7.19)
        const today = kstDayKey(new Date());
        setCourses(
          courseRows.courses.filter(
            (c) => !c.archivedAt && !(c.endDate && kstDayKey(new Date(c.endDate)) < today),
          ),
        );
      } catch {
        setLoadError(t("routinesLoadError"));
      } finally {
        setDataLoading(false);
      }
    },
    [t],
  );

  // 탭을 옮기면 이전 탭의 이동 안내·오류는 의미가 없다
  useEffect(() => {
    petIdRef.current = petId;
    setReorderError(null);
    setMoveNote("");
    setFocusTarget(null);
  }, [petId]);

  useEffect(() => {
    if (petId) void loadForPet(petId);
  }, [petId, loadForPet]);

  function itemMeta(item: RoutineItem): string {
    if (!isRoutineItemSkipped(item)) return routineItemSummary(item, tLabel, {
        offered: t("homeTodayOffered"),
        consumed: t("homeTodayConsumed"),
      });
    return t("routineCourseEndedMeta", {
      name: item.course?.name ?? tLabel(item.preset?.label ?? item.eventType.label),
    });
  }

  // 이동 뒤 포커스 복원 — 첫/마지막 칸에서 눌린 버튼은 disabled가 되므로 반대쪽 버튼으로 옮긴다
  useEffect(() => {
    if (!focusTarget) return;
    const { id, dir } = focusTarget;
    const index = routines.findIndex((r) => r.id === id);
    const canKeep = dir === "up" ? index > 0 : index >= 0 && index < routines.length - 1;
    const want = canKeep ? dir : dir === "up" ? "down" : "up";
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-move-id="${CSS.escape(id)}"][data-move-dir="${want}"]`)
      ?.focus();
    setFocusTarget(null);
  }, [focusTarget, routines]);

  async function handleMove(routine: Routine, dir: RoutineMoveDirection) {
    if (reorderingRef.current) return;
    const next = moveRoutine(routines, routine.id, dir);
    if (next === routines) return;
    const requestPetId = petId;
    reorderingRef.current = true;
    setReordering(true);
    setReorderError(null);
    setRoutines(next as Routine[]);
    setFocusTarget({ id: routine.id, dir });
    setMoveNote(
      t("routineMoved", {
        label: routine.label,
        position: String(next.findIndex((r) => r.id === routine.id) + 1),
      }),
    );
    const outcome = await performRoutineMove({
      list: routines,
      id: routine.id,
      dir,
      petId: requestPetId,
      currentPetId: () => petIdRef.current,
      put: (ids) =>
        apiJson<Routine[]>("/api/routines/order", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ petId: requestPetId, ids }),
        }),
    });
    if (outcome.status === "saved") {
      setRoutines(outcome.list);
    } else if (outcome.status === "failed") {
      // 롤백 대신 서버 기준으로 다시 불러온다 — 404(다른 탭에서 지움·보관)면 이전 순서도 낡았다
      setMoveNote("");
      setReorderError(t("routineReorderError"));
      setFocusTarget({ id: routine.id, dir });
      await refreshRoutines(requestPetId, routines);
    }
    reorderingRef.current = false;
    setReordering(false);
  }

  /** 서버 목록으로 되돌린다. 불러오지 못하면 이동 전 순서로 롤백한다 */
  async function refreshRoutines(forPetId: string, fallback: Routine[]) {
    try {
      const rows = await apiJson<Routine[]>(`/api/routines?petId=${encodeURIComponent(forPetId)}`);
      if (petIdRef.current === forPetId) setRoutines(rows);
    } catch {
      if (petIdRef.current === forPetId) setRoutines(fallback);
    }
  }

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
            disabled={!petId || dataLoading || reordering}
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
        <ul className="manage-card-list" ref={listRef}>
          {routines.map((routine, index) => (
            <li key={routine.id} className="manage-card">
              <div className="manage-card-main">
                <p className="manage-card-name">{routine.label}</p>
                <p className="manage-card-meta meta">
                  {routine.items.map(itemMeta).join(" · ")}
                </p>
              </div>
              <div className="manage-card-actions">
                {(["up", "down"] as const).map((dir) => {
                  const atEdge = dir === "up" ? index === 0 : index === routines.length - 1;
                  return (
                    <button
                      key={dir}
                      type="button"
                      className="btn-action btn-move"
                      data-move-id={routine.id}
                      data-move-dir={dir}
                      aria-label={t(dir === "up" ? "routineMoveUp" : "routineMoveDown", {
                        label: routine.label,
                      })}
                      disabled={atEdge}
                      aria-disabled={reordering || undefined}
                      onClick={() => void handleMove(routine, dir)}
                    >
                      <span aria-hidden="true">{dir === "up" ? "↑" : "↓"}</span>
                    </button>
                  );
                })}
                <button type="button" className="btn-action" disabled={reordering}
                  onClick={() => openEdit(routine)}>
                  {t("edit")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {moveNote}
      </p>
      {reorderError && (
        <p className="error-text" role="alert">
          {reorderError}
        </p>
      )}

      <RoutineEditSheet
        open={sheetOpen}
        petId={petId}
        species={pets.find((pet) => pet.id === petId)?.species}
        routine={editing}
        presets={presets}
        courses={courses}
        eventTypes={eventTypes}
        products={products}
        onClose={closeSheet}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </main>
  );
}
