"use client";

import type { Preset } from "../lib/types";
import { useLongPress } from "../lib/useLongPress";

function quickChipClass(label: string, compact: boolean): string {
  if (!compact) return "chip";
  const chars = [...label].length;
  if (chars <= 3) return "chip chip-quick";
  if (chars <= 5) return "chip chip-quick chip-quick-5";
  return "chip chip-quick chip-quick-wide";
}

interface PresetChipProps {
  preset: Preset;
  label: string;
  disabled: boolean;
  onTap: (preset: Preset) => void;
  onLongPress?: (preset: Preset) => void;
  /** true면 탭만 — 롱프레스 감지·클릭 억제 없음 (/q 등) */
  tapOnly?: boolean;
  /** 기록 화면 등 좁은 칩 */
  compact?: boolean;
}

export function PresetChip({
  preset,
  label,
  disabled,
  onTap,
  onLongPress,
  tapOnly = false,
  compact = false,
}: PresetChipProps) {
  const longPress = useLongPress(() => {
    if (!disabled && onLongPress) onLongPress(preset);
  });
  const chipClass = quickChipClass(label, compact);

  if (tapOnly) {
    return (
      <button
        type="button"
        className={chipClass}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onTap(preset);
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${chipClass} long-press-target`}
      disabled={disabled}
      onClick={longPress.wrapClick(() => {
        if (!disabled) onTap(preset);
      })}
      onPointerDown={disabled ? undefined : longPress.onPointerDown}
      onPointerUp={disabled ? undefined : longPress.onPointerUp}
      onPointerLeave={disabled ? undefined : longPress.onPointerLeave}
      onPointerCancel={disabled ? undefined : longPress.onPointerCancel}
    >
      {label}
    </button>
  );
}

interface MorePresetItemProps {
  label: string;
  disabled: boolean;
  onTap: () => void;
  onLongPress?: () => void;
  tapOnly?: boolean;
}

export function MorePresetItem({
  label,
  disabled,
  onTap,
  onLongPress,
  tapOnly = false,
}: MorePresetItemProps) {
  const longPress = useLongPress(() => {
    if (!disabled && onLongPress) onLongPress();
  });

  if (tapOnly) {
    return (
      <button
        type="button"
        className="sheet-item"
        disabled={disabled}
        onClick={() => {
          if (!disabled) onTap();
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="sheet-item long-press-target"
      disabled={disabled}
      onClick={longPress.wrapClick(() => {
        if (!disabled) onTap();
      })}
      onPointerDown={disabled ? undefined : longPress.onPointerDown}
      onPointerUp={disabled ? undefined : longPress.onPointerUp}
      onPointerLeave={disabled ? undefined : longPress.onPointerLeave}
      onPointerCancel={disabled ? undefined : longPress.onPointerCancel}
    >
      {label}
    </button>
  );
}
