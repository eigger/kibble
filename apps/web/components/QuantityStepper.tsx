"use client";

import { stepQuantityValue } from "../lib/quantityStep";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** 오름차순. 하나면 ±, 둘이면 작은 칸이 입력 옆·큰 칸이 바깥. */
  steps: number[];
  /** 자리가 좁으면 CSS로 숨기는 칸. 기본 칸은 남긴다. */
  extraStep?: number | null;
  disabled?: boolean;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
  decreaseLabel: string;
  increaseLabel: string;
  formatStep: (step: number, steps: number[]) => string;
};

function StepButton({
  amount,
  extra,
  disabled,
  label,
  text,
  onChange,
  value,
}: {
  amount: number;
  extra?: boolean;
  disabled?: boolean;
  label: string;
  text: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <button
      type="button"
      className={extra ? "qty-stepper-btn qty-stepper-btn-extra" : "qty-stepper-btn"}
      disabled={disabled}
      aria-label={label}
      onClick={() => onChange(stepQuantityValue(value, amount))}
    >
      {text}
    </button>
  );
}

export function QuantityStepper({
  id,
  value,
  onChange,
  steps,
  extraStep = null,
  disabled,
  placeholder,
  inputMode = "decimal",
  decreaseLabel,
  increaseLabel,
  formatStep,
}: Props) {
  const unique = steps.filter((step, i) => steps.indexOf(step) === i);
  const small = unique[0] ?? 1;
  const large = unique.length > 1 ? unique[unique.length - 1] : null;
  const labeled = large != null;

  function minusText(step: number): string {
    return labeled ? `−${formatStep(step, unique)}` : "−";
  }
  function plusText(step: number): string {
    return labeled ? `+${formatStep(step, unique)}` : "+";
  }
  function isExtra(step: number): boolean {
    return labeled && extraStep != null && step === extraStep;
  }

  return (
    <div className={labeled ? "qty-stepper qty-stepper-labeled" : "qty-stepper"}>
      {large != null && (
        <StepButton
          amount={-large}
          extra={isExtra(large)}
          disabled={disabled}
          label={`${decreaseLabel} ${formatStep(large, unique)}`}
          text={minusText(large)}
          onChange={onChange}
          value={value}
        />
      )}
      <StepButton
        amount={-small}
        extra={isExtra(small)}
        disabled={disabled}
        label={labeled ? `${decreaseLabel} ${formatStep(small, unique)}` : decreaseLabel}
        text={minusText(small)}
        onChange={onChange}
        value={value}
      />
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
      <StepButton
        amount={small}
        extra={isExtra(small)}
        disabled={disabled}
        label={labeled ? `${increaseLabel} ${formatStep(small, unique)}` : increaseLabel}
        text={plusText(small)}
        onChange={onChange}
        value={value}
      />
      {large != null && (
        <StepButton
          amount={large}
          extra={isExtra(large)}
          disabled={disabled}
          label={`${increaseLabel} ${formatStep(large, unique)}`}
          text={plusText(large)}
          onChange={onChange}
          value={value}
        />
      )}
    </div>
  );
}
