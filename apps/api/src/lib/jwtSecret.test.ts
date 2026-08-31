import { afterEach, describe, expect, it, vi } from "vitest";
import { isInsecureJwtSecret, resolveJwtSecret } from "./jwtSecret.js";

describe("resolveJwtSecret", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("returns dev fallback when unset in development", () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "development";
    expect(resolveJwtSecret()).toBe("dev-secret-change-me");
  });

  it("returns configured secret in development", () => {
    process.env.JWT_SECRET = "local-test-secret-value";
    process.env.NODE_ENV = "development";
    expect(resolveJwtSecret()).toBe("local-test-secret-value");
  });

  it("exits in production when secret is weak", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "changeme";
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as typeof process.exit);

    expect(() => resolveJwtSecret()).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("flags insecure secrets", () => {
    expect(isInsecureJwtSecret("changeme")).toBe(true);
    expect(isInsecureJwtSecret("openssl-rand-hex-32-value")).toBe(false);
  });
});
