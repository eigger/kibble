"use client";

import type { Preset } from "../lib/types";
import { useLongPress } from "../lib/useLongPress";

interface PresetChipProps {
  preset: Preset;
  label: string;
  disabled: boolean;
  onTap: (preset: Preset) => void;
  onLongPress?: (preset: Preset) => void;
  /** true면 탭만 — 롱프레스 감지·클릭 억제 없음 (/q 등) */
  tapOnly?: boolean;
}

export function PresetChip({
  preset,
  label,
  disabled,
  onTap,
  onLongPress,
  tapOnly = false,
}: PresetChipProps) {
  const longPress = useLongPress(() => {
    if (!disabled && onLongPress) onLongPress(preset);
  });

  if (tapOnly) {
    return (
      <button
        type="button"
        className="chip"
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
      className="chip long-press-target"
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
