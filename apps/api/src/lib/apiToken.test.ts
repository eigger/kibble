import { describe, expect, it } from "vitest";
import {
  generateApiTokenPlaintext,
  hashApiToken,
  isApiTokenPlaintext,
  API_TOKEN_PREFIX,
} from "./apiToken.js";

describe("apiToken", () => {
  it("generates kbl_ prefixed tokens", () => {
    const token = generateApiTokenPlaintext();
    expect(token.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(isApiTokenPlaintext(token)).toBe(true);
  });

  it("hashes deterministically", () => {
    const plain = `${API_TOKEN_PREFIX}abc123def456ghi789jkl012`;
    expect(hashApiToken(plain)).toBe(hashApiToken(plain));
    expect(hashApiToken(plain)).not.toBe(plain);
  });

  it("rejects non-api bearer strings", () => {
    expect(isApiTokenPlaintext("eyJhbGciOiJIUzI1NiJ9")).toBe(false);
    expect(isApiTokenPlaintext("kbl_short")).toBe(false);
  });
});
