"use client";

import type { ReactNode } from "react";
import { useLocale } from "../lib/i18n/locale-context";
import {
  eventCategory,
  eventCategoryLabel,
  eventDetailLine,
  eventDisplayLabel,
} from "../lib/eventDisplay";
import type { TimelineEvent } from "../lib/types";
import { EventCategoryTag } from "./EventCategoryTag";

/**
 * 목록용 요약. 수량·척도·제품은 한 블록, 메모는 최대 두 줄이다.
 * 전문은 행을 눌러 상세 시트에서 본다 — 행 안에 더보기를 두면 버튼이 중첩된다.
 */
export function TimelineEventBody({
  event,
  children,
}: {
  event: TimelineEvent;
  children?: ReactNode;
}) {
  const { t, tLabel } = useLocale();
  const facts = eventDetailLine(event, t);
  const note = event.note?.trim().replace(/\s+/g, " ") ?? "";

  return (
    <div className="timeline-body">
      <div className="timeline-label-row">
        <EventCategoryTag category={eventCategory(event)} label={eventCategoryLabel(event, t)} />
        <span className="timeline-label">{eventDisplayLabel(event, tLabel)}</span>
      </div>
      {facts ? <p className="timeline-detail">{facts}</p> : null}
      {note ? <p className="timeline-note">{note}</p> : null}
      {children}
    </div>
  );
}
