"use client";

import { useSyncExternalStore } from "react";
import {
  getBackgroundUpload,
  subscribeBackgroundUpload,
} from "../lib/backgroundUpload";
import { useLocale } from "../lib/i18n/locale-context";

type Props = {
  eventId: string;
};

export function TimelineUploadStatus({ eventId }: Props) {
  const { t } = useLocale();
  const bgSnapshot = useSyncExternalStore(
    subscribeBackgroundUpload,
    getBackgroundUpload,
    getBackgroundUpload,
  );

  if (!bgSnapshot) return null;

  const isUploading = bgSnapshot.current?.eventId === eventId;
  const failedItem = bgSnapshot.failedItems?.find((item) => item.eventId === eventId);

  if (isUploading) {
    return (
      <div className="timeline-upload-row">
        <span className="timeline-upload-badge timeline-upload-badge-uploading" role="status">
          <span className="timeline-upload-spinner" aria-hidden="true" />
          <span>{t("attachmentUploadingBadge")}</span>
        </span>
      </div>
    );
  }

  if (failedItem && failedItem.failedFiles.length > 0) {
    return (
      <div className="timeline-upload-row">
        <span className="timeline-upload-badge timeline-upload-badge-failed" role="status">
          <svg
            className="timeline-upload-icon"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{t("timelineUploadFailedBadge", { count: String(failedItem.failedFiles.length) })}</span>
        </span>
      </div>
    );
  }

  return null;
}
