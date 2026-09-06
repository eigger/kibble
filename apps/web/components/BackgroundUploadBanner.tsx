"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useLocale } from "../lib/i18n/locale-context";
import {
  bindBackgroundFetchBridge,
  cancelBackgroundUpload,
  cancelUploadsForEvent,
  getBackgroundUpload,
  retryBackgroundUpload,
  subscribeBackgroundUpload,
} from "../lib/backgroundUpload";

function percentLabel(loaded: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.min(100, Math.round((loaded / total) * 100))}%`;
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackgroundUploadBanner() {
  const { t } = useLocale();
  const [showDetails, setShowDetails] = useState(false);
  const snapshot = useSyncExternalStore(
    subscribeBackgroundUpload,
    getBackgroundUpload,
    () => null,
  );

  useEffect(() => bindBackgroundFetchBridge(), []);

  if (!snapshot) return null;

  const current = snapshot.current;
  const progress = current?.progress ?? null;
  const fileCount = current?.fileCount ?? 0;
  const uploadingIndex = progress ? Math.min(fileCount, progress.fileIndex + 1) : 1;
  const uploadingTotal = progress?.fileCount ?? fileCount;
  const pct =
    progress && progress.phase === "uploading"
      ? percentLabel(progress.loaded, progress.total)
      : null;
  const preparing = progress?.phase === "preparing";

  const failedItems = snapshot.failedItems || [];
  const singleEventId = failedItems.length === 1 ? failedItems[0].eventId : null;

  return (
    <>
      {current && (
        <div className="bg-upload-banner" role="status">
          <span>
            {t(current.canLeave ? "attachmentUploadingLeave" : "attachmentUploadingStay")}{" "}
            {t("attachmentUploading", {
              current: String(uploadingIndex),
              total: String(uploadingTotal),
            })}
            {preparing ? ` · ${t("attachmentPreparing")}` : null}
            {pct ? <span aria-hidden>{` · ${pct}`}</span> : null}
          </span>
          <button type="button" className="bg-upload-retry" onClick={() => cancelBackgroundUpload()}>
            {t("attachmentUploadCancel")}
          </button>
        </div>
      )}
      {snapshot.failedCount > 0 && (
        <div className="bg-upload-banner bg-upload-banner-error" role="status">
          <span>{t("attachmentUploadFailedCount", { count: String(snapshot.failedCount) })}</span>
          <div className="bg-upload-actions">
            {singleEventId ? (
              <Link
                href={`/history?highlight=${encodeURIComponent(singleEventId)}`}
                className="bg-upload-btn bg-upload-link"
              >
                {t("attachmentUploadViewEvent")}
              </Link>
            ) : null}
            <button
              type="button"
              className="bg-upload-btn"
              onClick={() => setShowDetails(true)}
            >
              {t("attachmentUploadDetails")}
            </button>
            <button
              type="button"
              className="bg-upload-retry"
              onClick={() => retryBackgroundUpload()}
            >
              {t("attachmentUploadRetry")}
            </button>
            <button
              type="button"
              className="bg-upload-btn bg-upload-cancel"
              onClick={() => cancelBackgroundUpload()}
            >
              {t("attachmentUploadCancel")}
            </button>
          </div>
        </div>
      )}

      {showDetails && (
        <div className="modal-backdrop" onClick={() => setShowDetails(false)}>
          <div
            className="modal-card bg-upload-details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bg-upload-details-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="bg-upload-details-title" className="modal-title">
                {t("attachmentUploadDetailsTitle")}
              </h2>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowDetails(false)}
                aria-label={t("close")}
              >
                ✕
              </button>
            </div>
            <div className="modal-body bg-upload-details-body">
              {failedItems.map((item, idx) => (
                <div key={item.eventId || idx} className="bg-upload-event-card">
                  <div className="bg-upload-event-header">
                    <Link
                      href={`/history?highlight=${encodeURIComponent(item.eventId)}`}
                      className="bg-upload-event-link"
                      onClick={() => setShowDetails(false)}
                    >
                      {t("attachmentUploadViewEvent")} →
                    </Link>
                  </div>

                  {item.succeededFiles.length > 0 && (
                    <div className="bg-upload-file-section">
                      <span className="bg-upload-section-title bg-upload-section-success">
                        ✓ {t("attachmentUploadSucceededFiles", { count: String(item.succeededFiles.length) })}
                      </span>
                      <ul className="bg-upload-file-list">
                        {item.succeededFiles.map((f, fi) => (
                          <li key={fi} className="bg-upload-file-item success">
                            <span className="bg-upload-file-name">{f.name || `파일 #${fi + 1}`}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.failedFiles.length > 0 && (
                    <div className="bg-upload-file-section">
                      <span className="bg-upload-section-title bg-upload-section-failed">
                        ⚠ {t("attachmentUploadFailedFiles", { count: String(item.failedFiles.length) })}
                      </span>
                      <ul className="bg-upload-file-list">
                        {item.failedFiles.map((f, fi) => (
                          <li key={fi} className="bg-upload-file-item failed">
                            <span className="bg-upload-file-name">{f.name}</span>
                            {f.size > 0 && (
                              <span className="bg-upload-file-size">({formatFileSize(f.size)})</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="bg-upload-event-actions">
                    <button
                      type="button"
                      className="btn-sm btn-primary"
                      onClick={() => {
                        retryBackgroundUpload(item.eventId);
                        setShowDetails(false);
                      }}
                    >
                      {t("attachmentUploadRetryEvent")}
                    </button>
                    <button
                      type="button"
                      className="btn-sm btn-secondary"
                      onClick={() => {
                        cancelUploadsForEvent(item.eventId);
                        if (failedItems.length <= 1) setShowDetails(false);
                      }}
                    >
                      {t("attachmentUploadCancelEvent")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  retryBackgroundUpload();
                  setShowDetails(false);
                }}
              >
                {t("attachmentUploadRetry")}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  cancelBackgroundUpload();
                  setShowDetails(false);
                }}
              >
                {t("attachmentUploadCancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
