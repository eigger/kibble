import { describe, expect, it } from "vitest";
import { etagMatched, fileEtag, shouldRespondNotModified } from "./sendFile.js";

describe("fileEtag", () => {
  it("changes when size or mtime second changes", () => {
    const a = fileEtag(100, 1_700_000_000_000);
    const b = fileEtag(101, 1_700_000_000_000);
    const c = fileEtag(100, 1_700_000_001_000);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
  });
});

describe("shouldRespondNotModified", () => {
  const etag = fileEtag(20, 1_700_000_000_000);

  it("304s a matching If-None-Match without Range", () => {
    expect(
      shouldRespondNotModified({
        ifNoneMatch: etag,
        etag,
        mtimeMs: 1_700_000_000_000,
      }),
    ).toBe(true);
  });

  it("does not 304 when Range is present — video seeking needs bytes", () => {
    expect(
      shouldRespondNotModified({
        range: "bytes=0-10",
        ifNoneMatch: etag,
        etag,
        mtimeMs: 1_700_000_000_000,
      }),
    ).toBe(false);
  });

  it("does not 304 on a different ETag", () => {
    expect(
      shouldRespondNotModified({
        ifNoneMatch: '"deadbeef"',
        etag,
        mtimeMs: 1_700_000_000_000,
      }),
    ).toBe(false);
  });

  it("treats If-None-Match * as a hit", () => {
    expect(etagMatched("*", etag)).toBe(true);
  });
});
