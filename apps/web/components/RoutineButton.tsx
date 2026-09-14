"use client";

import { routineSummary } from "../lib/routines";
import type { Routine } from "../lib/types";

interface RoutineButtonProps {
  routine: Routine;
  tLabel: (labelOrKey: string) => string;
  disabled: boolean;
  running: boolean;
  runningLabel: string;
  onTap: (routine: Routine) => void;
}

/** 루틴 버튼 — 누르면 바로 저장된다. 칩과 달리 채움색이고 아래에 무엇이 들어가는지 요약이 있다 (§7.24) */
export function RoutineButton({
  routine,
  tLabel,
  disabled,
  running,
  runningLabel,
  onTap,
}: RoutineButtonProps) {
  return (
    <button
      type="button"
      className={`routine-button${running ? " routine-button-running" : ""}`}
      disabled={disabled || running}
      aria-busy={running || undefined}
      onClick={() => {
        if (!disabled && !running) onTap(routine);
      }}
    >
      <span className="routine-button-label">{routine.label}</span>
      <span className="routine-button-summary">
        {running ? runningLabel : routineSummary(routine, tLabel)}
      </span>
    </button>
  );
}
