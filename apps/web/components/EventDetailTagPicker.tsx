"use client";

import type { TranslationKey } from "../lib/i18n/translations";
import { eventDetailTagsFor } from "../lib/eventDetailTags";
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
  const tags = eventDetailTagsFor(eventTypeKey);
  if (tags.length === 0) return null;

  return (
    <div className="event-detail-chip-row" role="group" aria-label={t("eventDetailTagPickerLabel")}>
      {tags.map((tag) => {
        const selected = selectedIds.includes(tag.id);
        return (
          <EventDetailChip
            key={tag.id}
            selected={selected}
            disabled={disabled}
            onClick={() => onToggle(tag.id)}
          >
            {t(tag.labelKey)}
          </EventDetailChip>
        );
      })}
    </div>
  );
}
