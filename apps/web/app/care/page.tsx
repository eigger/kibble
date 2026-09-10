"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { routePath } from "../../lib/base-path";
import { apiJson, isApiError } from "../../lib/api";
import { formatApiErrorMessage } from "../../lib/apiErrorMessage";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import type { TranslationKey } from "../../lib/i18n/translations";
import { useToast } from "../../lib/toast-context";
import { MedicationCourseSheet } from "../../components/MedicationCourseSheet";
import type {
  CareReminder,
  MedicationCourseHistoryRow,
  MedicationCourseProgress,
  MedicationCourseRow,
  Pet,
} from "../../lib/types";
import { formatDoseTime, intlLocale } from "@kibble/shared";
import { formatEventTime } from "../../lib/eventDisplay";
import { groupCourseHistory, type CourseHistoryEntry } from "../../lib/medicationCourseHistory";

interface CarePayload {
  pets: Pet[];
  activePet: Pet | null;
  medicationCourses: MedicationCourseProgress[];
  pastMedicationCourseCount: number;
  reminders: CareReminder[];
}

type CourseSheetState =
  | { mode: "add" }
  | { mode: "edit"; course: MedicationCourseProgress | MedicationCourseRow }
  | { mode: "continue"; course: MedicationCourseProgress | MedicationCourseRow };

function formatDueDate(iso: string, locale: "ko" | "en"): string {
  return new Date(iso).toLocaleDateString(intlLocale(locale), {
    month: "numeric",
    day: "numeric",
  });
}

/** 지난 처방의 기간 표기. 올해가 아니면 연도를 붙인다 — 몇 달 전 처방이 흔하다 */
function formatCourseDate(iso: string, locale: "ko" | "en", now: Date): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(intlLocale(locale), {
    ...(sameYear ? {} : { year: "2-digit" }),
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });
}

function courseHistoryPeriod(
  entry: CourseHistoryEntry,
  locale: "ko" | "en",
  now: Date,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const start = formatCourseDate(entry.startDate, locale, now);
  if (entry.ongoing) return `${start} ~ ${t("carePastOngoing")}`;
  return entry.endedAt ? `${start} ~ ${formatCourseDate(entry.endedAt, locale, now)}` : `${start} ~`;
}

function courseMetaParts(
  course: MedicationCourseProgress,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const parts: string[] = [];
  if (course.dosage?.trim()) parts.push(course.dosage.trim());
  parts.push(
    t("careTodayProgress", {
      done: String(course.dosesGivenToday),
      total: String(course.dosesPerDay),
    }),
    t("careDaysOnCourse", { days: String(course.daysOnCourse) }),
  );
  if (course.dosesRemaining != null) {
    parts.push(t("careDosesRemaining", { count: String(course.dosesRemaining) }));
  }
  return parts.join(" · ");
}

export default function CarePage() {
  const router = useRouter();
  const pathname = routePath(usePathname());
  const { user, loading } = useAuth();
  const needsPet = user?.needsPet;
  const { t, tLabel, locale } = useLocale();
  const { show } = useToast();
  const localeTag = intlLocale(locale);

  const [pets, setPets] = useState<Pet[]>([]);
  const [activePet, setActivePet] = useState<Pet | null>(null);
  const [medicationCourses, setMedicationCourses] = useState<MedicationCourseProgress[]>([]);
  const [pastCount, setPastCount] = useState(0);
  const [reminders, setReminders] = useState<CareReminder[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loggingCourseId, setLoggingCourseId] = useState<string | null>(null);
  const [undoingCourseId, setUndoingCourseId] = useState<string | null>(null);
  const [courseSheet, setCourseSheet] = useState<CourseSheetState | null>(null);
  // 지난 처방은 펼칠 때 따로 받는다. `pastCourses`가 null이면 아직 안 받은 것.
  const [pastOpen, setPastOpen] = useState(false);
  const [pastCourses, setPastCourses] = useState<MedicationCourseHistoryRow[] | null>(null);
  const [pastLoading, setPastLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && needsPet) router.push("/onboarding");
  }, [loading, needsPet, router]);

  const loadCare = useCallback(
    async (petId?: string) => {
      setDataLoading(true);
      setLoadError(null);
      try {
        const qs = petId ? `?petId=${encodeURIComponent(petId)}` : "";
        const data = await apiJson<CarePayload>(`/api/care${qs}`);
        setPets(data.pets);
        setActivePet(data.activePet);
        setMedicationCourses(data.medicationCourses);
        setPastCount(data.pastMedicationCourseCount ?? 0);
        setReminders(data.reminders);
      } catch (err) {
        if (isApiError(err) && err.status === 401) {
          router.push("/login");
          return;
        }
        setLoadError(t("careLoadError"));
        setMedicationCourses([]);
        setReminders([]);
      } finally {
        setDataLoading(false);
      }
    },
    [router, t],
  );

  useEffect(() => {
    if (!user || needsPet || pathname !== "/care") return;
    void loadCare();
  }, [user, needsPet, pathname, loadCare]);

  const loadPastCourses = useCallback(
    async (petId: string) => {
      setPastLoading(true);
      try {
        const data = await apiJson<{ courses: MedicationCourseHistoryRow[] }>(
          `/api/care/medication-courses?petId=${encodeURIComponent(petId)}&status=past`,
        );
        setPastCourses(data.courses);
      } catch (err) {
        show(formatApiErrorMessage(err, t("carePastLoadError"), locale), "error");
      } finally {
        setPastLoading(false);
      }
    },
    [locale, show, t],
  );

  // 펼치는 순간 받는다. 그 뒤 처방이 바뀌면(저장·종료·이어가기) `refreshCourses`가 다시 받는다
  const activePetId = activePet?.id ?? null;
  useEffect(() => {
    if (!activePetId || !pastOpen) return;
    void loadPastCourses(activePetId);
  }, [activePetId, pastOpen, loadPastCourses]);

  async function refreshCourses(petId: string) {
    await Promise.all([loadCare(petId), pastOpen ? loadPastCourses(petId) : Promise.resolve()]);
  }

  async function selectPet(pet: Pet) {
    if (pet.id === activePet?.id || dataLoading) return;
    setActivePet(pet);
    setPastCourses(null);
    await loadCare(pet.id);
  }

  function togglePast() {
    setPastOpen((prev) => !prev);
  }

  const historyGroups =
    pastOpen && pastCourses ? groupCourseHistory(medicationCourses, pastCourses) : [];
  const now = new Date();

  async function handleLogDose(courseId: string, doseSlotIndex?: number) {
    if (loggingCourseId || undoingCourseId) return;
    setLoggingCourseId(courseId);
    try {
      await apiJson(`/api/care/medication-courses/${courseId}/doses`, {
        method: "POST",
        body: JSON.stringify(
          doseSlotIndex !== undefined ? { doseSlotIndex } : {},
        ),
      });
      show(t("careDoseLogged"), "success");
      if (activePet) await loadCare(activePet.id);
    } catch (err) {
      show(formatApiErrorMessage(err, t("recordError"), locale), "error");
    } finally {
      setLoggingCourseId(null);
    }
  }

  async function handleUndoDose(courseId: string) {
    if (loggingCourseId || undoingCourseId) return;
    setUndoingCourseId(courseId);
    try {
      await apiJson(`/api/care/medication-courses/${courseId}/doses/latest`, {
        method: "DELETE",
      });
      show(t("careDoseUndone"), "info");
      if (activePet) await loadCare(activePet.id);
    } catch (err) {
      show(formatApiErrorMessage(err, t("recordError"), locale), "error");
    } finally {
      setUndoingCourseId(null);
    }
  }

  if (loading || !user || needsPet) return null;

  return (
    <main className="container care-page">
      <header className="care-header">
        <div className="care-header-row">
          <h1>{t("careTitle")}</h1>
          {activePet && (
            <button
              type="button"
              className="care-add-course-btn"
              onClick={() => setCourseSheet({ mode: "add" })}
            >
              {t("careAddCourse")}
            </button>
          )}
        </div>
        {pets.length >= 2 && (
          <div className="pet-tabs" role="tablist" aria-label={t("homePetTabsLabel")}>
            {pets.map((pet) => (
              <button
                key={pet.id}
                type="button"
                role="tab"
                aria-selected={pet.id === activePet?.id}
                className={`pet-tab${pet.id === activePet?.id ? " pet-tab-active" : ""}`}
                onClick={() => void selectPet(pet)}
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
      ) : (
        <>
          <section className="care-section" aria-label={t("careMedsSection")}>
            <h2 className="care-section-heading">{t("careMedsSection")}</h2>
            {medicationCourses.length === 0 ? (
              <p className="meta care-empty">{t("careMedsEmpty")}</p>
            ) : (
              <ul className="care-med-list">
                {medicationCourses.map((course) => {
                  const busy =
                    loggingCourseId === course.id || undoingCourseId === course.id;
                  const usesSlots = course.doseSlotsToday.length > 0;
                  const canLog = course.dosesGivenToday < course.dosesPerDay;
                  return (
                    <li key={course.id} className="care-med-card">
                      <div className="care-med-main">
                        <p className="care-med-name">{course.name}</p>
                        <p className="care-med-meta meta">{courseMetaParts(course, t)}</p>
                        {course.note && <p className="care-med-note meta">{course.note}</p>}
                        {(course.dosesToday?.length ?? 0) > 0 && (
                          <p className="care-med-doses-today meta">
                            {usesSlots
                              ? t("careTodayDoseSlots", {
                                  slots: course.doseSlotsToday
                                    .filter((slot) => slot.eventId != null)
                                    .map((slot) => formatDoseTime(slot.time, localeTag))
                                    .join(" · "),
                                })
                              : t("careTodayDoseLog", {
                                  times: (course.dosesToday ?? [])
                                    .map((dose) => formatEventTime(dose.occurredAt, locale))
                                    .join(" · "),
                                })}
                          </p>
                        )}
                      </div>
                      <div className="care-med-actions">
                        <button
                          type="button"
                          className="btn-action"
                          disabled={busy}
                          aria-label={t("careEditCourse")}
                          onClick={() => setCourseSheet({ mode: "edit", course })}
                        >
                          {t("edit")}
                        </button>
                        {course.canUndoToday && (
                          <button
                            type="button"
                            className="btn-action"
                            disabled={busy}
                            onClick={() => void handleUndoDose(course.id)}
                          >
                            {undoingCourseId === course.id ? t("careUndoing") : t("careUndoDose")}
                          </button>
                        )}
                        {usesSlots ? (
                          <div className="care-dose-slot-actions" role="group" aria-label={t("careLogDose")}>
                            {course.doseSlotsToday.map((slot) => {
                              const done = slot.eventId != null;
                              return (
                                <button
                                  key={slot.index}
                                  type="button"
                                  className={`care-dose-slot-btn${done ? " care-dose-slot-btn-done" : ""}`}
                                  disabled={busy || done}
                                  onClick={() => void handleLogDose(course.id, slot.index)}
                                  aria-label={t("careLogDoseSlot", {
                                    slot: formatDoseTime(slot.time, localeTag),
                                  })}
                                >
                                  {done ? "✓" : formatDoseTime(slot.time, localeTag)}
                                </button>
                              );
                            })}
                          </div>
                        ) : canLog ? (
                          <button
                            type="button"
                            className="care-log-btn"
                            disabled={busy}
                            onClick={() => void handleLogDose(course.id)}
                          >
                            {loggingCourseId === course.id ? t("careLogging") : t("careLogDose")}
                          </button>
                        ) : (
                          <span
                            className="care-done-badge"
                            aria-label={t("careTodayProgress", {
                              done: String(course.dosesGivenToday),
                              total: String(course.dosesPerDay),
                            })}
                          >
                            ✓
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {pastCount > 0 && (
            <section className="care-section" aria-label={t("carePastSection")}>
              <button
                type="button"
                className="care-past-toggle"
                aria-expanded={pastOpen}
                aria-controls="care-past-list"
                onClick={togglePast}
              >
                <span className="care-section-heading care-past-heading">
                  {t("carePastToggle", { count: String(pastCount) })}
                </span>
                <span className="care-past-chevron" aria-hidden="true">
                  {pastOpen ? "▾" : "▸"}
                </span>
              </button>
              {pastOpen && (
                <div id="care-past-list">
                  {pastLoading && pastCourses === null ? (
                    <p className="meta care-empty">{t("loading")}</p>
                  ) : (
                    historyGroups.map((group) => (
                      <div key={group.name} className="care-past-group">
                        <h3 className="care-past-group-name">{group.name}</h3>
                        <ul className="care-past-list">
                          {group.entries.map((entry) => (
                            <li key={entry.id}>
                              <button
                                type="button"
                                className={`care-past-row${entry.ongoing ? " care-past-row-ongoing" : ""}`}
                                aria-label={t("carePastOpen", { name: entry.name })}
                                onClick={() => setCourseSheet({ mode: "edit", course: entry.source })}
                              >
                                <span className="care-past-period">
                                  {courseHistoryPeriod(entry, locale, now, t)}
                                  {entry.ingredientsChanged && (
                                    <span className="care-past-changed">
                                      {t("carePastIngredientsChanged")}
                                    </span>
                                  )}
                                </span>
                                <span
                                  className={`care-past-ingredients${entry.ingredients ? "" : " meta"}`}
                                >
                                  {entry.ingredients?.trim() || t("carePastNoIngredients")}
                                </span>
                                <span className="care-past-meta meta">
                                  {[
                                    entry.dosage?.trim() || null,
                                    entry.totalDoses != null
                                      ? t("carePastDosesOfTotal", {
                                          given: String(entry.dosesGivenTotal),
                                          total: String(entry.totalDoses),
                                        })
                                      : t("carePastDoses", { given: String(entry.dosesGivenTotal) }),
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>
          )}

          <section className="care-section" aria-label={t("careRemindersSection")}>
            <h2 className="care-section-heading">{t("careRemindersSection")}</h2>
            {reminders.length === 0 ? (
              <p className="meta care-empty">{t("careRemindersEmpty")}</p>
            ) : (
              <ul className="care-reminder-list">
                {reminders.map((reminder) => (
                  <li
                    key={reminder.id}
                    className={`care-reminder-item${reminder.overdue ? " care-reminder-overdue" : ""}`}
                  >
                    <span className="care-reminder-label">{reminder.label}</span>
                    <span className="care-reminder-meta meta">
                      {tLabel(reminder.eventTypeLabel)} · {formatDueDate(reminder.nextDueAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {activePet && courseSheet && (
        <MedicationCourseSheet
          open
          mode={courseSheet.mode}
          petId={activePet.id}
          course={courseSheet.mode === "add" ? null : courseSheet.course}
          onClose={() => setCourseSheet(null)}
          onSaved={() => void refreshCourses(activePet.id)}
          onArchived={() => void refreshCourses(activePet.id)}
          onContinue={(course) => setCourseSheet({ mode: "continue", course })}
          t={t}
          locale={locale}
          showToast={show}
        />
      )}
    </main>
  );
}
