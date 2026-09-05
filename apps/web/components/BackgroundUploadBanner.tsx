"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useLocale } from "../lib/i18n/locale-context";
import {
  bindBackgroundFetchBridge,
  cancelBackgroundUpload,
  getBackgroundUpload,
  retryBackgroundUpload,
  subscribeBackgroundUpload,
} from "../lib/backgroundUpload";

function percentLabel(loaded: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.min(100, Math.round((loaded / total) * 100))}%`;
}

export function BackgroundUploadBanner() {
  const { t } = useLocale();
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
          <button type="button" className="bg-upload-retry" onClick={() => retryBackgroundUpload()}>
            {t("attachmentUploadRetry")}
          </button>
        </div>
      )}
    </>
  );
}
