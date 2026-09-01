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
  const press = useLongPress(
    () => {
      if (!disabled) onTap(preset);
    },
    () => {
      if (!disabled) onLongPress(preset);
    },
  );

  return (
    <button
      type="button"
      className="chip"
      disabled={disabled}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerLeave={press.onPointerLeave}
      onPointerCancel={press.onPointerLeave}
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
  const press = useLongPress(
    () => {
      if (!disabled) onTap();
    },
    () => {
      if (!disabled) onLongPress();
    },
  );

  return (
    <button
      type="button"
      className="sheet-item"
      disabled={disabled}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerLeave={press.onPointerLeave}
      onPointerCancel={press.onPointerLeave}
    >
      {label}
    </button>
  );
}
