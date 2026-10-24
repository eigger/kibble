import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { formatApiErrorMessage } from "./apiErrorMessage";

describe("formatApiErrorMessage", () => {
  it("returns server string errors as-is", () => {
    expect(formatApiErrorMessage(new ApiError("기록을 찾을 수 없습니다", 404), "fallback")).toBe(
      "기록을 찾을 수 없습니다",
    );
  });

  it("formats zod field errors in Korean", () => {
    const err = new ApiError(
      JSON.stringify({ fieldErrors: { occurredAt: ["Invalid ISO datetime"] } }),
      400,
    );
    expect(formatApiErrorMessage(err, "fallback", "ko")).toContain("시각");
  });

  it("formats zod 4 missing-field errors as required", () => {
    const err = new ApiError(
      JSON.stringify({
        fieldErrors: { quantity: ["Invalid input: expected number, received undefined"] },
      }),
      400,
    );
    const msg = formatApiErrorMessage(err, "fallback", "ko");
    expect(msg).not.toContain("Invalid input");
    expect(msg).toContain("수량");
  });

  it("keeps other zod 4 type errors verbatim with the field label", () => {
    const err = new ApiError(
      JSON.stringify({
        fieldErrors: { quantity: ["Invalid input: expected number, received string"] },
      }),
      400,
    );
    expect(formatApiErrorMessage(err, "fallback", "ko")).toContain("received string");
  });

  it("recognizes ApiError via duck typing when instanceof fails", () => {
    const err = Object.assign(new Error("기록을 찾을 수 없습니다"), {
      name: "ApiError",
      status: 404,
    });
    expect(formatApiErrorMessage(err, "fallback")).toBe("기록을 찾을 수 없습니다");
  });

  it("returns network hint for fetch TypeError", () => {
    const err = new TypeError("Failed to fetch");
    expect(formatApiErrorMessage(err, "fallback", "ko")).toContain("네트워크");
  });
});
