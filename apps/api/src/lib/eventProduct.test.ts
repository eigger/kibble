import { describe, expect, it } from "vitest";
import { resolveEventProductFields } from "./eventProduct.js";

describe("resolveEventProductFields", () => {
  const PROD = { id: "p1", name: "오리젠 사료" };

  it.each([
    {
      name: "productId 변경 시 productName이 없으면 제품 이름으로 자동 동기화한다",
      input: { productId: "p1", productName: undefined, householdProduct: PROD },
      expected: { productId: "p1", productName: "오리젠 사료" },
    },
    {
      name: "productId와 커스텀 productName이 모두 주어지면 커스텀 이름을 유지한다",
      input: { productId: "p1", productName: "오리젠 캣 (소분)", householdProduct: PROD },
      expected: { productId: "p1", productName: "오리젠 캣 (소분)" },
    },
    {
      name: "타 가구의 productId이거나 존재하지 않으면 productId를 null 처리한다",
      input: { productId: "foreign_id", productName: undefined, householdProduct: null },
      expected: { productId: null },
    },
    {
      name: "productId를 명시적으로 해제(null)할 때 productName이 없으면 null을 남긴다",
      input: { productId: null, productName: undefined, householdProduct: null },
      expected: { productId: null },
    },
    {
      name: "productId 없이 productName만 갱신할 수 있다",
      input: { productId: undefined, productName: "자유 입력 사료", householdProduct: null },
      expected: { productName: "자유 입력 사료" },
    },
    {
      name: "productName에 공백만 주어지면 null로 정리한다",
      input: { productId: undefined, productName: "   ", householdProduct: null },
      expected: { productName: null },
    },
    {
      name: "둘 다 undefined면 아무 필드도 반환하지 않는다",
      input: { productId: undefined, productName: undefined, householdProduct: null },
      expected: {},
    },
  ])("$name", ({ input, expected }) => {
    expect(resolveEventProductFields(input)).toEqual(expected);
  });
});
