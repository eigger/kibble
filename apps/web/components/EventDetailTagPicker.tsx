"use client";

import type { TranslationKey } from "../lib/i18n/translations";
import { EVENT_DETAIL_TAG_GROUP_LABEL_KEYS, eventDetailTagGroupsFor } from "../lib/eventDetailTags";
import { EventDetailChip } from "./EventDetailChip";

interface EventDetailTagPickerProps {
  eventTypeKey: string | null | undefined;
  selectedIds: string[];
  disabled?: boolean;
  t: (key: TranslationKey) => string;
  onToggle: (tagId: string) => void;
}

export function EventDetailTagPicker({
  eventTypeKey,
  selectedIds,
  disabled = false,
  t,
  onToggle,
}: EventDetailTagPickerProps) {
  const groups = eventDetailTagGroupsFor(eventTypeKey);
  if (groups.length === 0) return null;

  return (
    <div className="event-detail-tag-groups" role="group" aria-label={t("eventDetailTagPickerLabel")}>
      {groups.map((group) => {
        const heading = group.group ? t(EVENT_DETAIL_TAG_GROUP_LABEL_KEYS[group.group]) : null;
        return (
          <div key={group.group ?? "all"} className="event-detail-tag-group">
            {heading && <span className="event-detail-chip-hint">{heading}</span>}
            <div
              className="event-detail-chip-row"
              role={heading ? "group" : undefined}
              aria-label={heading ?? undefined}
            >
              {group.tags.map((tag) => (
                <EventDetailChip
                  key={tag.id}
                  selected={selectedIds.includes(tag.id)}
                  disabled={disabled}
                  onClick={() => onToggle(tag.id)}
                >
                  {t(tag.labelKey)}
                </EventDetailChip>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
