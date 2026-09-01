"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiJson, isApiError } from "../../lib/api";
import { formatApiErrorMessage } from "../../lib/apiErrorMessage";
import { useAuth } from "../../lib/auth-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { useToast } from "../../lib/toast-context";
import { MedicationCourseSheet } from "../../components/MedicationCourseSheet";
import type { CareReminder, MedicationCourseProgress, Pet } from "../../lib/types";
import { formatDoseTime } from "@kibble/shared";
import { formatEventTime } from "../../lib/eventDisplay";

interface CarePayload {
  pets: Pet[];
  activePet: Pet | null;
  medicationCourses: MedicationCourseProgress[];
  reminders: CareReminder[];
}

function formatDueDate(iso: string, locale: "ko" | "en"): string {
  return new Date(iso).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });
}

function courseMetaParts(
  course: MedicationCourseProgress,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  const parts = [
    t("careTodayProgress", {
      done: String(course.dosesGivenToday),
      total: String(course.dosesPerDay),
    }),
    t("careDaysOnCourse", { days: String(course.daysOnCourse) }),
  ];
  if (course.dosesRemaining != null) {
    parts.push(t("careDosesRemaining", { count: String(course.dosesRemaining) }));
  }
  return parts.join(" · ");
}

export default function CarePage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const needsPet = user?.needsPet;
  const { t, locale } = useLocale();
  const { show } = useToast();
  const localeTag = locale === "ko" ? "ko-KR" : "en-US";

  const [pets, setPets] = useState<Pet[]>([]);
  const [activePet, setActivePet] = useState<Pet | null>(null);
  const [medicationCourses, setMedicationCourses] = useState<MedicationCourseProgress[]>([]);
  const [reminders, setReminders] = useState<CareReminder[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loggingCourseId, setLoggingCourseId] = useState<string | null>(null);
  const [undoingCourseId, setUndoingCourseId] = useState<string | null>(null);
  const [courseSheet, setCourseSheet] = useState<
    { mode: "add" } | { mode: "edit"; course: MedicationCourseProgress } | null
  >(null);

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

  async function selectPet(pet: Pet) {
    if (pet.id === activePet?.id || dataLoading) return;
    setActivePet(pet);
    await loadCare(pet.id);
  }

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
                      {t(reminder.eventTypeLabel)} · {formatDueDate(reminder.nextDueAt, locale)}
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
          course={courseSheet.mode === "edit" ? courseSheet.course : null}
          onClose={() => setCourseSheet(null)}
          onSaved={() => void loadCare(activePet.id)}
          onArchived={() => void loadCare(activePet.id)}
          t={t}
          locale={locale}
          showToast={show}
        />
      )}
    </main>
  );
}
