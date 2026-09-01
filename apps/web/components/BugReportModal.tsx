"use client";

import { useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { buildBugReportUrl } from "../lib/bugReport";
import { useLocale } from "../lib/i18n/locale-context";

interface BugReportModalProps {
  onClose: () => void;
}

export function BugReportModal({ onClose }: BugReportModalProps) {
  const pathname = usePathname();
  const { t, locale } = useLocale();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const url = buildBugReportUrl({
      title: title.trim(),
      description,
      pathname: pathname ?? "",
      locale,
    });
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <div className="confirm-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card bug-report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bug-report-modal-header">
          <h2 id="bug-report-title" style={{ margin: 0 }}>
            {t("navReportIssue")}
          </h2>
          <button type="button" className="secondary bug-report-close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>

        <p className="meta bug-report-hint">{t("bugReportHint")}</p>

        <form onSubmit={handleSubmit} className="form">
          <label className="form-label">
            {t("bugReportTitleLabel")}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("bugReportTitlePlaceholder")}
              autoFocus
              required
            />
          </label>
          <label className="form-label">
            {t("bugReportDescLabel")}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("bugReportDescPlaceholder")}
              rows={5}
            />
          </label>
          <div className="bug-report-actions">
            <button type="button" className="secondary" onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="submit">{t("bugReportSubmit")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
