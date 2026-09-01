"use client";

interface EventDetailChipProps {
  selected?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

export function EventDetailChip({
  selected = false,
  disabled = false,
  pressed,
  onClick,
  children,
}: EventDetailChipProps) {
  return (
    <button
      type="button"
      className={`event-detail-chip${selected ? " event-detail-chip-selected" : ""}`}
      disabled={disabled}
      aria-pressed={pressed ?? selected}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
