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
    "eventTag.vomit.hairball": "헤어볼",
    "eventTag.vomit.blood": "혈토",
  };
  return map[key] ?? key;
};

describe("eventDetailTags", () => {
  it("resolves known tag slugs to labels", () => {
    expect(resolveEventTagLabel("vomit", "hairball", t)).toBe("헤어볼");
  });

  it("passes through custom text", () => {
    expect(resolveEventTagLabel("meal", "로얄캐닌", t)).toBe("로얄캐닌");
    expect(resolveEventTagLabel("vomit", "노란토", t)).toBe("노란토");
  });

  it("finds tag by id", () => {
    expect(findEventDetailTag("vomit", "hairball")?.id).toBe("hairball");
    expect(findEventDetailTag("vomit", "헤어볼")).toBeUndefined();
  });

  it("parses and encodes multiple tags", () => {
    expect(parseProductNameValue("vomit", "hairball,blood")).toEqual({
      tagIds: ["hairball", "blood"],
      custom: "",
    });
    expect(encodeProductNameValue("vomit", ["hairball", "blood"], "")).toBe("hairball,blood");
    expect(formatProductNameDisplay("vomit", "hairball,blood", t)).toBe("헤어볼 · 혈토");
  });

  it("keeps custom text alongside tags", () => {
    expect(parseProductNameValue("vomit", "hairball,거품")).toEqual({
      tagIds: ["hairball"],
      custom: "거품",
    });
    expect(encodeProductNameValue("vomit", ["hairball"], "거품")).toBe("hairball,거품");
    expect(formatProductNameDisplay("vomit", "hairball,거품", t)).toBe("헤어볼 · 거품");
  });
});
