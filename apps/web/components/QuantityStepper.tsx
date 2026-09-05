"use client";

import { stepQuantityValue } from "../lib/quantityStep";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  step: number;
  disabled?: boolean;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
  decreaseLabel: string;
  increaseLabel: string;
};

export function QuantityStepper({
  id,
  value,
  onChange,
  step,
  disabled,
  placeholder,
  inputMode = "decimal",
  decreaseLabel,
  increaseLabel,
}: Props) {
  return (
    <div className="qty-stepper">
      <button
        type="button"
        className="qty-stepper-btn"
        disabled={disabled}
        aria-label={decreaseLabel}
        onClick={() => onChange(stepQuantityValue(value, -step))}
      >
        −
      </button>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        className="event-detail-qty-input qty-stepper-input"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="qty-stepper-btn"
        disabled={disabled}
        aria-label={increaseLabel}
        onClick={() => onChange(stepQuantityValue(value, step))}
      >
        +
      </button>
    </div>
  );
}
