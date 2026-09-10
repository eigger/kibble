"use client";

import { stepQuantityValue } from "../lib/quantityStep";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** 오름차순. 하나면 ±, 여럿이면 작은 칸이 입력 옆·큰 칸이 바깥. */
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
  const unique = steps.filter((step, i) => steps.indexOf(step) === i).sort((a, b) => a - b);
  const tiers = unique.length > 0 ? unique : [1];
  const labeled = tiers.length > 1;

  function text(sign: "−" | "+", step: number): string {
    return labeled ? `${sign}${formatStep(step, tiers)}` : sign;
  }
  function label(base: string, step: number): string {
    return labeled ? `${base} ${formatStep(step, tiers)}` : base;
  }
  function isExtra(step: number): boolean {
    return labeled && extraStep != null && step === extraStep;
  }

  // 작은 칸이 입력 옆, 큰 칸이 바깥 — 빼기는 큰 것부터, 더하기는 작은 것부터
  const className = ["qty-stepper", labeled && "qty-stepper-labeled", `qty-stepper-${tiers.length}`]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      {[...tiers].reverse().map((step) => (
        <StepButton
          key={`minus-${step}`}
          amount={-step}
          extra={isExtra(step)}
          disabled={disabled}
          label={label(decreaseLabel, step)}
          text={text("−", step)}
          onChange={onChange}
          value={value}
        />
      ))}
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
      {tiers.map((step) => (
        <StepButton
          key={`plus-${step}`}
          amount={step}
          extra={isExtra(step)}
          disabled={disabled}
          label={label(increaseLabel, step)}
          text={text("+", step)}
          onChange={onChange}
          value={value}
        />
      ))}
    </div>
  );
}
