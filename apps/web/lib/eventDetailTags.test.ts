import { describe, expect, it } from "vitest";
import {
  encodeProductNameValue,
  findEventDetailTag,
  formatProductNameDisplay,
  parseProductNameValue,
  resolveEventTagLabel,
} from "./eventDetailTags";

const t = (key: string) => {
  const map: Record<string, string> = {
    "eventTag.meal.chicken": "닭고기",
    "eventTag.meal.tuna": "참치",
    "eventTag.vomit.hairball": "헤어볼",
  };
  return map[key] ?? key;
};

describe("eventDetailTags", () => {
  it("resolves known tag slugs to labels", () => {
    expect(resolveEventTagLabel("meal", "chicken", t)).toBe("닭고기");
    expect(resolveEventTagLabel("vomit", "hairball", t)).toBe("헤어볼");
  });

  it("passes through custom text", () => {
    expect(resolveEventTagLabel("meal", "로얄캐닌", t)).toBe("로얄캐닌");
  });

  it("finds tag by id", () => {
    expect(findEventDetailTag("meal", "tuna")?.id).toBe("tuna");
    expect(findEventDetailTag("meal", "참치")).toBeUndefined();
  });

  it("parses and encodes multiple tags", () => {
    expect(parseProductNameValue("meal", "chicken,tuna")).toEqual({
      tagIds: ["chicken", "tuna"],
      custom: "",
    });
    expect(encodeProductNameValue("meal", ["chicken", "tuna"], "")).toBe("chicken,tuna");
    expect(formatProductNameDisplay("meal", "chicken,tuna", t)).toBe("닭고기 · 참치");
  });

  it("keeps custom text alongside tags", () => {
    expect(parseProductNameValue("meal", "chicken,로얄캐닌")).toEqual({
      tagIds: ["chicken"],
      custom: "로얄캐닌",
    });
    expect(encodeProductNameValue("meal", ["chicken"], "로얄캐닌")).toBe("chicken,로얄캐닌");
    expect(formatProductNameDisplay("meal", "chicken,로얄캐닌", t)).toBe("닭고기 · 로얄캐닌");
  });
});
