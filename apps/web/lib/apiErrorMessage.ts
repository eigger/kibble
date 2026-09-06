import { isApiError } from "./api";
import { translate, type Locale, type TranslationKey } from "./i18n/translations";

type ZodFlatten = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[]>;
};

const FIELD_KEY_MAP: Record<string, TranslationKey> = {
  occurredAt: "fieldOccurredAt",
  quantity: "fieldQuantity",
  quantityOffered: "fieldQuantityOffered",
  unit: "fieldUnit",
  scaleValue: "fieldScaleValue",
  note: "fieldNote",
  needsReview: "fieldNeedsReview",
};

function getFieldLabel(field: string, locale: Locale): string {
  const key = FIELD_KEY_MAP[field];
  if (key) return translate(locale, key);
  return field;
}

function formatZodFlatten(flat: ZodFlatten, locale: Locale): string {
  const parts: string[] = [];
  for (const msg of flat.formErrors ?? []) {
    if (msg === "empty update") {
      parts.push(translate(locale, "apiErrorEmptyUpdate"));
    } else {
      parts.push(msg);
    }
  }
  for (const [field, errors] of Object.entries(flat.fieldErrors ?? {})) {
    const label = getFieldLabel(field, locale);
    for (const err of errors) {
      if (err === "Invalid datetime" || err.includes("datetime")) {
        parts.push(translate(locale, "apiErrorInvalidDatetime", { label }));
      } else if (err === "Required") {
        parts.push(translate(locale, "apiErrorFieldRequired", { label }));
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
  locale: Locale = "ko",
): string {
  if (isNetworkError(err)) {
    return translate(locale, "apiErrorNetwork");
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
