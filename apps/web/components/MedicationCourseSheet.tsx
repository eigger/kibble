"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiJson } from "../lib/api";
import { formatApiErrorMessage } from "../lib/apiErrorMessage";
import {
  continueCourseDraft,
  courseToDraft,
  emptyMedicationCourseDraft,
  parseMedicationCourseDraft,
  type MedicationCourseDraft,
} from "../lib/medicationCourseDraft";
import type { MedicationCourseProgress, MedicationCourseRow } from "../lib/types";
import { MedicationCourseForm } from "./MedicationCourseForm";

import type { TranslationKey } from "../lib/i18n/translations";

/**
 * 처방 시트의 세 모드.
 * - add: 빈 폼
 * - edit: 기존 처방(진행 중이든 지난 것이든) 수정
 * - continue: "새 처방으로 이어가기" — `course`의 값을 물려받은 새 처방. 저장하면 서버가
 *   같은 트랜잭션에서 이전 처방을 종료한다 (§7.19)
 */
export type MedicationCourseSheetMode = "add" | "edit" | "continue";

type SheetCourse = MedicationCourseProgress | MedicationCourseRow;

function isEnded(course: SheetCourse): boolean {
  return "archivedAt" in course && course.archivedAt != null;
}

type Props = {
  open: boolean;
  mode: MedicationCourseSheetMode;
  petId: string;
  course?: SheetCourse | null;
  onClose: () => void;
  onSaved: () => void;
  onArchived?: () => void;
  /** 수정 시트에서 "새 처방으로 이어가기"를 눌렀을 때. 없으면 버튼을 그리지 않는다 */
  onContinue?: (course: SheetCourse) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
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
  onContinue,
  t,
  locale,
  showToast,
}: Props) {
  const [draft, setDraft] = useState<MedicationCourseDraft>(emptyMedicationCourseDraft());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (course && mode === "edit") setDraft(courseToDraft(course));
    else if (course && mode === "continue") setDraft(continueCourseDraft(course));
    else setDraft(emptyMedicationCourseDraft());
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
      if (mode === "add" || mode === "continue") {
        const continuesCourseId = mode === "continue" ? course?.id : undefined;
        await apiJson("/api/care/medication-courses", {
          method: "POST",
          body: JSON.stringify({
            petId,
            name: parsed.name,
            ingredients: parsed.ingredients,
            dosage: parsed.dosage,
            dosesPerDay: parsed.dosesPerDay,
            doseTimes: parsed.doseTimes,
            totalDoses: parsed.totalDoses,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            note: parsed.note,
            ...(continuesCourseId ? { continuesCourseId } : {}),
          }),
        });
        showToast(t(continuesCourseId ? "careContinued" : "careMedSaved"), "success");
      } else if (course) {
        await apiJson(`/api/care/medication-courses/${course.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: parsed.name,
            ingredients: parsed.ingredients,
            dosage: parsed.dosage,
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

  const title =
    mode === "add"
      ? t("careAddCourse")
      : mode === "continue"
        ? t("careContinueCourse")
        : t("careEditCourse");
  const editingCourse = mode === "edit" && course ? course : null;
  const dosesHref = editingCourse
    ? `/history?pet=${encodeURIComponent(petId)}&course=${encodeURIComponent(editingCourse.id)}`
    : null;

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
        {mode === "continue" && course && (
          <p className="meta med-course-sheet-hint">
            {t(isEnded(course) ? "careContinueHintPast" : "careContinueHint")}
          </p>
        )}
        <form className="med-course-sheet-form" onSubmit={(e) => void handleSave(e)}>
          <MedicationCourseForm
            formId={`med-course-${mode}`}
            draft={draft}
            onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
            disabled={saving}
            t={t}
          />
          {editingCourse && (
            <div className="med-course-sheet-links">
              {dosesHref && (
                <Link className="med-course-sheet-link" href={dosesHref}>
                  {t("careViewDoses")}
                </Link>
              )}
              {onContinue && (
                <button
                  type="button"
                  className="med-course-sheet-link"
                  disabled={saving}
                  onClick={() => onContinue(editingCourse)}
                >
                  {t("careContinueCourse")}
                </button>
              )}
            </div>
          )}
          {editingCourse && !isEnded(editingCourse) && (
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
              {saving ? t("saving") : mode === "edit" ? t("save") : t("careSaveMed")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
