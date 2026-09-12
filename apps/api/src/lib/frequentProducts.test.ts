import { describe, expect, it } from "vitest";
import { eventTypeSupportsProductName, productNameIsTagList } from "./frequentProducts.js";

describe("eventTypeSupportsProductName", () => {
  it("includes meal, treat, supplement, and remedy", () => {
    expect(eventTypeSupportsProductName("meal")).toBe(true);
    expect(eventTypeSupportsProductName("treat")).toBe(true);
    expect(eventTypeSupportsProductName("supplement")).toBe(true);
    expect(eventTypeSupportsProductName("remedy")).toBe(true);
  });

  it("includes care — 위생용품(모래·샴푸·치약)을 잇는다 (§7.20)", () => {
    expect(eventTypeSupportsProductName("care")).toBe(true);
  });

  it("excludes other types", () => {
    expect(eventTypeSupportsProductName("water")).toBe(false);
    expect(eventTypeSupportsProductName("poop")).toBe(false);
    expect(eventTypeSupportsProductName("observation")).toBe(false);
  });
});

describe("productNameIsTagList", () => {
  it("태그 타입에서는 productName이 slug 목록이라 제품 이름으로 채우지 않는다", () => {
    expect(productNameIsTagList("care")).toBe(true);
    expect(productNameIsTagList("observation")).toBe(true);
    expect(productNameIsTagList("vomit")).toBe(true);
  });

  it("이름 타입은 스냅샷 동기화(R92)를 그대로 받는다", () => {
    expect(productNameIsTagList("meal")).toBe(false);
    expect(productNameIsTagList("remedy")).toBe(false);
  });
});
