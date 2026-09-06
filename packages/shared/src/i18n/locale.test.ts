import { describe, expect, it } from "vitest";
import { INTL_LOCALE, intlLocale, LOCALE_STORAGE_KEY, parseLocale } from "./locale.js";

describe("shared/i18n/locale", () => {
  it("exports LOCALE_STORAGE_KEY as kibble_locale", () => {
    expect(LOCALE_STORAGE_KEY).toBe("kibble_locale");
  });

  it("maps locales to BCP 47 tags", () => {
    expect(INTL_LOCALE.ko).toBe("ko-KR");
    expect(INTL_LOCALE.en).toBe("en-US");
    expect(intlLocale("ko")).toBe("ko-KR");
    expect(intlLocale("en")).toBe("en-US");
  });

  it("parses locale from string or defaults to ko", () => {
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("ko")).toBe("ko");
    expect(parseLocale("unknown")).toBe("ko");
    expect(parseLocale(null)).toBe("ko");
    expect(parseLocale(undefined)).toBe("ko");
  });
});
