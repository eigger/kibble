"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  ATTACHMENTS_UPLOADED_EVENT,
  mergeTimelineAttachments,
  type AttachmentsUploadedDetail,
} from "./backgroundUpload";
import type { TimelineEvent } from "./types";

/** 백그라운드 업로드가 끝난 첨부를 열려 있는 목록에 붙인다. */
export function useMergeUploadedAttachments(
  setEvents: Dispatch<SetStateAction<TimelineEvent[]>>,
): void {
  useEffect(() => {
    const onUploaded = (event: Event) => {
      const { eventId, uploaded } = (event as CustomEvent<AttachmentsUploadedDetail>).detail;
      setEvents((prev) => mergeTimelineAttachments(prev, eventId, uploaded));
    };
    window.addEventListener(ATTACHMENTS_UPLOADED_EVENT, onUploaded);
    return () => window.removeEventListener(ATTACHMENTS_UPLOADED_EVENT, onUploaded);
  }, [setEvents]);
}
