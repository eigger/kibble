"use client";

import type { MedicationCourseDraft } from "../lib/medicationCourseDraft";
import { syncDoseTimesForCount, updateDoseTimeAt } from "../lib/medicationCourseDraft";

type Props = {
  formId: string;
  draft: MedicationCourseDraft;
  onChange: (patch: Partial<MedicationCourseDraft>) => void;
  disabled?: boolean;
  t: (key: string, params?: Record<string, string>) => string;
};

export function MedicationCourseForm({
  formId,
  draft,
  onChange,
  disabled = false,
  t,
}: Props) {
  const dosesPerDay = Number.parseInt(draft.dosesPerDay, 10) || 1;

  function handleDosesPerDayChange(value: string) {
    const nextCount = Number.parseInt(value, 10);
    const doseTimes = Number.isFinite(nextCount)
      ? syncDoseTimesForCount(draft.doseTimes, nextCount)
      : draft.doseTimes;
    onChange({ dosesPerDay: value, doseTimes });
  }

  const doseTimes = syncDoseTimesForCount(draft.doseTimes, dosesPerDay);

  return (
    <div className="med-course-form">
      <label className="field-label" htmlFor={`${formId}-name`}>
        {t("careMedName")}
      </label>
      <input
        id={`${formId}-name`}
        className="care-input"
        value={draft.name}
        onChange={(e) => onChange({ name: e.target.value })}
        disabled={disabled}
      />
      <div className="care-add-row">
        <div>
          <label className="field-label" htmlFor={`${formId}-per-day`}>
            {t("careDosesPerDay")}
          </label>
          <input
            id={`${formId}-per-day`}
            className="care-input"
            type="number"
            min={1}
            max={24}
            value={draft.dosesPerDay}
            onChange={(e) => handleDosesPerDayChange(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`${formId}-total`}>
            {t("careTotalDoses")}
          </label>
          <input
            id={`${formId}-total`}
            className="care-input"
            type="number"
            min={1}
            value={draft.totalDoses}
            onChange={(e) => onChange({ totalDoses: e.target.value })}
            disabled={disabled}
          />
        </div>
      </div>
      <fieldset className="dose-time-fieldset">
        <legend className="field-label">{t("careDoseTimes")}</legend>
        <div className="dose-time-row">
          {doseTimes.map((time, index) => (
            <label key={`${formId}-dose-time-${index}`} className="dose-time-field">
              <span className="dose-time-label meta">
                {t("careDoseTimeLabel", { n: String(index + 1) })}
              </span>
              <input
                id={`${formId}-dose-time-${index}`}
                className="care-input dose-time-input"
                type="time"
                value={time}
                disabled={disabled}
                onChange={(e) =>
                  onChange({
                    doseTimes: updateDoseTimeAt(draft.doseTimes, index, e.target.value, dosesPerDay),
                  })
                }
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="care-add-row">
        <div>
          <label className="field-label" htmlFor={`${formId}-start`}>
            {t("careStartDate")}
          </label>
          <input
            id={`${formId}-start`}
            className="care-input"
            type="date"
            value={draft.startDate}
            onChange={(e) => onChange({ startDate: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`${formId}-end`}>
            {t("careEndDate")}
          </label>
          <input
            id={`${formId}-end`}
            className="care-input"
            type="date"
            value={draft.endDate}
            onChange={(e) => onChange({ endDate: e.target.value })}
            disabled={disabled}
          />
        </div>
      </div>
      <label className="field-label" htmlFor={`${formId}-note`}>
        {t("careCourseNote")}
      </label>
      <textarea
        id={`${formId}-note`}
        className="event-detail-note"
        rows={2}
        value={draft.note}
        onChange={(e) => onChange({ note: e.target.value })}
        disabled={disabled}
      />
    </div>
  );
}
