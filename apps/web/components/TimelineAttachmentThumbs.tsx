"use client";

import type { EventAttachment } from "../lib/types";
import { EventAttachmentThumb } from "./EventAttachmentThumb";

/** 이 이상은 "+N"으로 접는다 — 좁은 행에서 무한정 늘어나지 않게. */
const MAX_INLINE_THUMBS = 4;

type Props = {
  attachments: EventAttachment[];
  onOpen: (attachment: EventAttachment) => void;
};

/**
 * 이력 행의 첨부 미리보기. 행 전체가 상세 열기 버튼이므로, 사진 버튼의 클릭은
 * stopPropagation으로 막아 "사진 클릭 → 라이트박스"와 "행 클릭 → 상세"를 분리한다.
 */
export function TimelineAttachmentThumbs({ attachments, onOpen }: Props) {
  if (attachments.length === 0) return null;
  const shown = attachments.slice(0, MAX_INLINE_THUMBS);
  const overflow = attachments.length - shown.length;

  return (
    <div className="timeline-attachments">
      {shown.map((att) => (
        <button
          key={att.id}
          type="button"
          className="timeline-attachment-btn"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(att);
          }}
        >
          <EventAttachmentThumb
            path={att.path}
            mime={att.mime}
            alt=""
            className="attachment-thumb attachment-thumb-inline"
          />
          <span className="attachment-thumb-hit" aria-hidden />
        </button>
      ))}
      {overflow > 0 && <span className="timeline-attachment-count">+{overflow}</span>}
    </div>
  );
}
