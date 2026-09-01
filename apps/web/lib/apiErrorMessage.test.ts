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
      JSON.stringify({ fieldErrors: { occurredAt: ["Invalid datetime"] } }),
      400,
    );
    expect(formatApiErrorMessage(err, "fallback", "ko")).toContain("시각");
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
