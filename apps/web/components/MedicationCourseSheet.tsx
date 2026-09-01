"use client";

import { useEffect, useState } from "react";
import { apiJson } from "../lib/api";
import { formatApiErrorMessage } from "../lib/apiErrorMessage";
import {
  courseToDraft,
  emptyMedicationCourseDraft,
  parseMedicationCourseDraft,
  type MedicationCourseDraft,
} from "../lib/medicationCourseDraft";
import type { MedicationCourseProgress } from "../lib/types";
import { MedicationCourseForm } from "./MedicationCourseForm";

type Props = {
  open: boolean;
  mode: "add" | "edit";
  petId: string;
  course?: MedicationCourseProgress | null;
  onClose: () => void;
  onSaved: () => void;
  onArchived?: () => void;
  t: (key: string, params?: Record<string, string>) => string;
  locale: "ko" | "en";
  showToast: (message: string, kind: "success" | "error" | "info") => void;
};

export function MedicationCourseSheet({
  open,
  mode,
  petId,
  course,
  onClose,
  onSaved,
  onArchived,
  t,
  locale,
  showToast,
}: Props) {
  const [draft, setDraft] = useState<MedicationCourseDraft>(emptyMedicationCourseDraft());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(mode === "edit" && course ? courseToDraft(course) : emptyMedicationCourseDraft());
  }, [open, mode, course]);

  if (!open) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseMedicationCourseDraft(draft);
    if (!parsed.ok) {
      if (parsed.reason === "name") showToast(t("careMedNameRequired"), "error");
      else if (parsed.reason === "doseTimes") showToast(t("careDoseTimesInvalid"), "error");
      return;
    }

    setSaving(true);
    try {
      if (mode === "add") {
        await apiJson("/api/care/medication-courses", {
          method: "POST",
          body: JSON.stringify({
            petId,
            name: parsed.name,
            dosesPerDay: parsed.dosesPerDay,
            doseTimes: parsed.doseTimes,
            totalDoses: parsed.totalDoses,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            note: parsed.note,
          }),
        });
        showToast(t("careMedSaved"), "success");
      } else if (course) {
        await apiJson(`/api/care/medication-courses/${course.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: parsed.name,
            dosesPerDay: parsed.dosesPerDay,
            doseTimes: parsed.doseTimes,
            totalDoses: parsed.totalDoses,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            note: parsed.note,
          }),
        });
        showToast(t("medicationsSavedToast"), "success");
      }
      onSaved();
      onClose();
    } catch (err) {
      showToast(formatApiErrorMessage(err, t("recordError"), locale), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!course || saving) return;
    if (!confirm(t("confirmArchiveCourse"))) return;

    setSaving(true);
    try {
      await apiJson(`/api/care/medication-courses/${course.id}`, { method: "DELETE" });
      showToast(t("medicationsArchivedToast"), "info");
      onArchived?.();
      onClose();
    } catch (err) {
      showToast(formatApiErrorMessage(err, t("recordError"), locale), "error");
    } finally {
      setSaving(false);
    }
  }

  const title = mode === "add" ? t("careAddCourse") : t("careEditCourse");

  return (
    <div className="sheet-backdrop" role="presentation" onClick={saving ? undefined : onClose}>
      <div
        className="sheet-card med-course-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <h2 className="med-course-sheet-title">{title}</h2>
        <form className="med-course-sheet-form" onSubmit={(e) => void handleSave(e)}>
          <MedicationCourseForm
            formId={`med-course-${mode}`}
            draft={draft}
            onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
            disabled={saving}
            t={t}
          />
          {mode === "edit" && course && (
            <button
              type="button"
              className="danger med-course-archive-btn"
              disabled={saving}
              onClick={() => void handleArchive()}
            >
              {t("medicationsArchive")}
            </button>
          )}
          <div className="med-course-sheet-actions">
            <button type="button" className="secondary" disabled={saving} onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? t("saving") : mode === "add" ? t("careSaveMed") : t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
