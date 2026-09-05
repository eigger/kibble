"use client";

import { useSyncExternalStore } from "react";
import { useLocale } from "../lib/i18n/locale-context";
import {
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

  if (!snapshot) return null;

  if (snapshot.status === "partial") {
    return (
      <div className="bg-upload-banner bg-upload-banner-error" role="status">
        <span>{t("attachmentUploadPartial")}</span>
        <button type="button" className="bg-upload-retry" onClick={() => retryBackgroundUpload()}>
          {t("attachmentUploadRetry")}
        </button>
      </div>
    );
  }

  const progress = snapshot.progress;
  const current = progress ? Math.min(snapshot.fileCount, progress.fileIndex + 1) : 1;
  const total = progress?.fileCount ?? snapshot.fileCount;
  const pct =
    progress && progress.phase === "uploading"
      ? percentLabel(progress.loaded, progress.total)
      : progress?.phase === "preparing"
        ? t("attachmentPreparing")
        : null;

  return (
    <div className="bg-upload-banner" role="status">
      <span>
        {t("attachmentUploadingStay")}{" "}
        {t("attachmentUploading", { current: String(current), total: String(total) })}
        {pct ? ` · ${pct}` : ""}
      </span>
    </div>
  );
}
