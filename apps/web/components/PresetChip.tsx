"use client";

import type { Preset } from "../lib/types";
import { useLongPress } from "../lib/useLongPress";

interface PresetChipProps {
  preset: Preset;
  label: string;
  disabled: boolean;
  onTap: (preset: Preset) => void;
  onLongPress: (preset: Preset) => void;
}

export function PresetChip({ preset, label, disabled, onTap, onLongPress }: PresetChipProps) {
  const longPress = useLongPress(() => {
    if (!disabled) onLongPress(preset);
  });

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
  onLongPress: () => void;
}

export function MorePresetItem({ label, disabled, onTap, onLongPress }: MorePresetItemProps) {
  const longPress = useLongPress(() => {
    if (!disabled) onLongPress();
  });

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
