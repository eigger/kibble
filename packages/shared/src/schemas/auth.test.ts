import { describe, expect, it } from "vitest";
import { createUserSchema, loginSchema, updateProfileSchema } from "./auth.js";

describe("email normalization", () => {
  it("trims and lowercases on login, create and profile update", () => {
    expect(loginSchema.parse({ email: "  Mom@Example.COM ", password: "x" }).email).toBe("mom@example.com");
    expect(
      createUserSchema.parse({ name: "n", email: "Mom@Example.com", password: "12345678" }).email,
    ).toBe("mom@example.com");
    expect(updateProfileSchema.parse({ email: "A@B.co" }).email).toBe("a@b.co");
  });

  it("still rejects things that are not emails", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
  });
});
