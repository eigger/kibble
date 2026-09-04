import { describe, expect, it } from "vitest";
import { parseByteRange } from "./rangeRequest.js";

const SIZE = 1000;

describe("parseByteRange", () => {
  it("returns none without a header", () => {
    expect(parseByteRange(undefined, SIZE)).toEqual({ kind: "none" });
    expect(parseByteRange("", SIZE)).toEqual({ kind: "none" });
  });

  // 브라우저가 <video>를 열 때 처음 보내는 형태
  it("parses an open-ended range", () => {
    expect(parseByteRange("bytes=0-", SIZE)).toEqual({
      kind: "range",
      range: { start: 0, end: 999 },
    });
  });

  it("parses a closed range", () => {
    expect(parseByteRange("bytes=200-499", SIZE)).toEqual({
      kind: "range",
      range: { start: 200, end: 499 },
    });
  });

  // iOS Safari가 재생 전에 던지는 정찰 요청
  it("parses the two-byte probe", () => {
    expect(parseByteRange("bytes=0-1", SIZE)).toEqual({
      kind: "range",
      range: { start: 0, end: 1 },
    });
  });

  it("parses a suffix range from the end", () => {
    expect(parseByteRange("bytes=-300", SIZE)).toEqual({
      kind: "range",
      range: { start: 700, end: 999 },
    });
  });

  it("clamps a suffix longer than the file", () => {
    expect(parseByteRange("bytes=-5000", SIZE)).toEqual({
      kind: "range",
      range: { start: 0, end: 999 },
    });
  });

  it("clamps an end past the last byte", () => {
    expect(parseByteRange("bytes=900-5000", SIZE)).toEqual({
      kind: "range",
      range: { start: 900, end: 999 },
    });
  });

  it("accepts a case-insensitive unit and surrounding space", () => {
    expect(parseByteRange("  Bytes=10-19  ", SIZE)).toEqual({
      kind: "range",
      range: { start: 10, end: 19 },
    });
  });

  it("reports a start past the end of the file as unsatisfiable", () => {
    expect(parseByteRange("bytes=1000-", SIZE)).toEqual({ kind: "unsatisfiable" });
    expect(parseByteRange("bytes=2000-3000", SIZE)).toEqual({ kind: "unsatisfiable" });
  });

  it("treats an empty file as unsatisfiable for any range", () => {
    expect(parseByteRange("bytes=0-", 0)).toEqual({ kind: "unsatisfiable" });
    expect(parseByteRange("bytes=-10", 0)).toEqual({ kind: "unsatisfiable" });
  });

  it("treats a zero-length suffix as unsatisfiable", () => {
    expect(parseByteRange("bytes=-0", SIZE)).toEqual({ kind: "unsatisfiable" });
  });

  // 스펙상 이해 못 하는 Range는 무시하고 전체를 보내면 된다 — 400으로 막지 않는다
  it("falls back to the whole file for anything it cannot read", () => {
    expect(parseByteRange("items=0-10", SIZE)).toEqual({ kind: "none" });
    expect(parseByteRange("bytes=abc-def", SIZE)).toEqual({ kind: "none" });
    expect(parseByteRange("bytes=10", SIZE)).toEqual({ kind: "none" });
    expect(parseByteRange("bytes=-", SIZE)).toEqual({ kind: "none" });
    // 뒤집힌 구간
    expect(parseByteRange("bytes=500-200", SIZE)).toEqual({ kind: "none" });
    // 다중 구간은 multipart/byteranges가 필요하다 — 미디어 재생에는 쓰이지 않는다
    expect(parseByteRange("bytes=0-9,20-29", SIZE)).toEqual({ kind: "none" });
  });
});

// Node는 중복 헤더를 보통 합치지만, 배열이 오면 trim()에서 터지고 라우트 catch가
// 그걸 "파일 없음" 404로 삼켜 원인을 못 찾게 된다
describe("parseByteRange — 배열 헤더", () => {
  it("uses the first value when the header arrives as an array", () => {
    expect(parseByteRange(["bytes=10-19", "bytes=30-39"], SIZE)).toEqual({
      kind: "range",
      range: { start: 10, end: 19 },
    });
  });

  it("returns none for an empty array", () => {
    expect(parseByteRange([], SIZE)).toEqual({ kind: "none" });
  });
});
