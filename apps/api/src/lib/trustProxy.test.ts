import { describe, expect, it } from "vitest";
import { parseTrustProxy } from "./trustProxy.js";

describe("parseTrustProxy", () => {
  it("defaults to off", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy("")).toBe(false);
    expect(parseTrustProxy("false")).toBe(false);
  });
  it("parses true and address lists", () => {
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("172.16.0.0/12, 10.0.0.0/8")).toBe("172.16.0.0/12,10.0.0.0/8");
    expect(parseTrustProxy("loopback, uniquelocal")).toBe("loopback,uniquelocal");
  });
  it("rejects hop-count integers", () => {
    expect(() => parseTrustProxy("1")).toThrow(/정수/);
  });
});
