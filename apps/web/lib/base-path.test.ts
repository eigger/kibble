import { describe, expect, it } from "vitest";
import { routePath, stripBasePath, withBasePath } from "./base-path";

describe("routePath", () => {
  it("treats empty values as the app root", () => {
    expect(routePath(null)).toBe("/");
    expect(routePath(undefined)).toBe("/");
    expect(routePath("")).toBe("/");
  });

  it("strips the trailing slash trailingSlash puts on usePathname()", () => {
    expect(routePath("/q/")).toBe("/q");
    expect(routePath("/care/")).toBe("/care");
    expect(routePath("/login/")).toBe("/login");
    expect(routePath("/")).toBe("/");
  });

  it("leaves an already-canonical path alone", () => {
    expect(routePath("/q")).toBe("/q");
    expect(routePath("/care")).toBe("/care");
  });
});

describe("withBasePath", () => {
  it("prefixes nothing in the default (root) test env", () => {
    expect(withBasePath("/sw.js")).toBe("/sw.js");
    expect(withBasePath("/")).toBe("/");
  });
});

describe("stripBasePath", () => {
  it("is a no-op when the app is at the origin root", () => {
    expect(stripBasePath("/api/home", "")).toBe("/api/home");
    expect(stripBasePath("/q/", "")).toBe("/q/");
  });

  it("strips an exact prefix and a prefix followed by a slash", () => {
    expect(stripBasePath("/kibble", "/kibble")).toBe("/");
    expect(stripBasePath("/kibble/", "/kibble")).toBe("/");
    expect(stripBasePath("/kibble/api/home", "/kibble")).toBe("/api/home");
  });

  it("does not treat a longer sibling path as under the prefix", () => {
    expect(stripBasePath("/kibble-admin", "/kibble")).toBe("/kibble-admin");
  });
});
