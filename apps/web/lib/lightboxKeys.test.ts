import { describe, expect, it } from "vitest";
import { shouldIgnoreArrowKey } from "./lightboxKeys";

function ev(el: Element | null, defaultPrevented = false) {
  return { target: el, defaultPrevented };
}

describe("shouldIgnoreArrowKey", () => {
  it("ignores arrows aimed at video/input/textarea/select", () => {
    for (const tag of ["video", "input", "textarea", "select"]) {
      expect(shouldIgnoreArrowKey(ev(document.createElement(tag)))).toBe(true);
    }
  });

  it("ignores arrows in a contenteditable element", () => {
    const div = document.createElement("div");
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(shouldIgnoreArrowKey(ev(div))).toBe(true);
  });

  it("ignores arrows already handled by someone else", () => {
    expect(shouldIgnoreArrowKey(ev(document.body, true))).toBe(true);
  });

  it("lets arrows through from the body or a button", () => {
    expect(shouldIgnoreArrowKey(ev(document.body))).toBe(false);
    expect(shouldIgnoreArrowKey(ev(document.createElement("button")))).toBe(false);
    expect(shouldIgnoreArrowKey(ev(null))).toBe(false);
  });
});
