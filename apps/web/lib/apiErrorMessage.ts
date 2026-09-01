import { isApiError } from "./api";

type ZodFlatten = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[]>;
};

const FIELD_LABEL_KO: Record<string, string> = {
  occurredAt: "시각",
  quantity: "수량",
  quantityOffered: "제공량",
  unit: "단위",
  scaleValue: "척도",
  note: "메모",
  needsReview: "검토",
};

const FIELD_LABEL_EN: Record<string, string> = {
  occurredAt: "Time",
  quantity: "Amount",
  quantityOffered: "Amount offered",
  unit: "Unit",
  scaleValue: "Scale",
  note: "Note",
  needsReview: "Review",
};

function formatZodFlatten(flat: ZodFlatten, locale: "ko" | "en"): string {
  const labels = locale === "en" ? FIELD_LABEL_EN : FIELD_LABEL_KO;
  const parts: string[] = [];
  for (const msg of flat.formErrors ?? []) {
    if (msg === "empty update") {
      parts.push(locale === "en" ? "Nothing to save" : "변경할 내용이 없습니다");
    } else {
      parts.push(msg);
    }
  }
  for (const [field, errors] of Object.entries(flat.fieldErrors ?? {})) {
    const label = labels[field] ?? field;
    for (const err of errors) {
      if (err === "Invalid datetime" || err.includes("datetime")) {
        parts.push(
          locale === "en" ? `${label}: enter a valid date and time` : `${label}: 올바른 날짜·시각을 입력하세요`,
        );
      } else if (err === "Required") {
        parts.push(locale === "en" ? `${label} is required` : `${label}을(를) 입력하세요`);
      } else {
        parts.push(`${label}: ${err}`);
      }
    }
  }
  return parts.join(" · ");
}

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(err.message);
}

/** API·Zod 오류를 토스트/시트에 쓸 사람이 읽을 문장으로 변환한다. */
export function formatApiErrorMessage(
  err: unknown,
  fallback: string,
  locale: "ko" | "en" = "ko",
): string {
  if (isNetworkError(err)) {
    return locale === "en" ? "Network error — check your connection" : "네트워크 오류 — 연결을 확인하세요";
  }
  if (!isApiError(err)) return fallback;
  const msg = err.message.trim();
  if (!msg) return fallback;
  if (msg.startsWith("{")) {
    try {
      const parsed = JSON.parse(msg) as ZodFlatten;
      const formatted = formatZodFlatten(parsed, locale);
      if (formatted) return formatted;
    } catch {
      // fall through
    }
  }
  return msg;
}
