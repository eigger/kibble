import { describe, expect, it } from "vitest";
import {
  createDialogStack,
  getFocusable,
  isDismissKey,
  isTrapKey,
  nextTabIndex,
} from "./dialogFocus";

describe("nextTabIndex", () => {
  it("wraps forward from the last and backward from the first", () => {
    expect(nextTabIndex(3, 2, false)).toBe(0);
    expect(nextTabIndex(3, 0, true)).toBe(2);
  });
  it("leaves the middle to the browser", () => {
    expect(nextTabIndex(3, 1, false)).toBeNull();
    expect(nextTabIndex(3, 1, true)).toBeNull();
    expect(nextTabIndex(3, 0, false)).toBeNull();
  });
  it("pulls focus in when it is outside the list (container or backdrop)", () => {
    expect(nextTabIndex(3, -1, false)).toBe(0);
    expect(nextTabIndex(3, -1, true)).toBe(2);
  });
  it("stays on the container when nothing is focusable", () => {
    expect(nextTabIndex(0, -1, false)).toBe(-1);
  });
  it("a single element traps both directions", () => {
    expect(nextTabIndex(1, 0, false)).toBe(0);
    expect(nextTabIndex(1, 0, true)).toBe(0);
  });
});

describe("getFocusable", () => {
  it("returns tabbable elements in DOM order and skips disabled/hidden ones", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <button id="a">a</button>
      <button id="b" disabled>b</button>
      <input id="c" type="hidden" />
      <input id="d" />
      <div hidden><button id="e">e</button></div>
      <div tabindex="-1" id="f"></div>
      <a id="g" href="/x">g</a>
      <a id="h">no href</a>
      <div tabindex="0" id="i"></div>
      <div aria-hidden="true"><button id="j">j</button></div>
    `;
    expect(getFocusable(root).map((el) => el.id)).toEqual(["a", "d", "g", "i"]);
  });
});

describe("getFocusable visibility and groups", () => {
  it("skips display:none, visibility:hidden and fieldset-disabled controls", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    root.innerHTML = `
      <button id="a">a</button>
      <div style="display:none"><button id="b">b</button></div>
      <button id="c" style="visibility:hidden">c</button>
      <fieldset disabled><button id="d">d</button></fieldset>
      <button id="e">e</button>
    `;
    expect(getFocusable(root).map((el) => el.id)).toEqual(["a", "e"]);
    root.remove();
  });

  it("counts a radio group once: the checked one, else the first", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <input type="radio" name="g" id="r1" />
      <input type="radio" name="g" id="r2" checked />
      <input type="radio" name="h" id="s1" />
      <input type="radio" name="h" id="s2" />
      <button id="z">z</button>
    `;
    expect(getFocusable(root).map((el) => el.id)).toEqual(["r2", "s1", "z"]);
  });
});

describe("dialog stack", () => {
  it("top() is the most recently opened token", () => {
    const stack = createDialogStack();
    const a = Symbol("a");
    const b = Symbol("b");
    expect(stack.top()).toBeUndefined();
    stack.push(a);
    stack.push(b);
    expect(stack.top()).toBe(b);
    stack.remove(b);
    expect(stack.top()).toBe(a);
  });

  it("only the most recently opened dialog is on top", () => {
    const stack = createDialogStack();
    const sheet = Symbol("sheet");
    const lightbox = Symbol("lightbox");
    stack.push(sheet);
    expect(stack.isTop(sheet)).toBe(true);
    stack.push(lightbox);
    expect(stack.isTop(sheet)).toBe(false);
    expect(stack.isTop(lightbox)).toBe(true);
    stack.remove(lightbox);
    expect(stack.isTop(sheet)).toBe(true);
    stack.remove(sheet);
    expect(stack.size()).toBe(0);
    expect(stack.isTop(sheet)).toBe(false);
  });

  it("removing a lower dialog keeps the top one on top", () => {
    const stack = createDialogStack();
    const a = Symbol("a");
    const b = Symbol("b");
    stack.push(a);
    stack.push(b);
    stack.remove(a);
    expect(stack.isTop(b)).toBe(true);
  });
});

describe("key predicates", () => {
  it("dismisses on plain Escape only", () => {
    expect(isDismissKey({ key: "Escape" })).toBe(true);
    expect(isDismissKey({ key: "Escape", isComposing: true })).toBe(false);
    expect(isDismissKey({ key: "Escape", defaultPrevented: true })).toBe(false);
    expect(isDismissKey({ key: "Enter" })).toBe(false);
  });
  it("traps Tab but not browser shortcuts", () => {
    expect(isTrapKey({ key: "Tab" })).toBe(true);
    expect(isTrapKey({ key: "Tab", shiftKey: true })).toBe(true);
    expect(isTrapKey({ key: "Tab", ctrlKey: true })).toBe(false);
    expect(isTrapKey({ key: "a" })).toBe(false);
  });
});
