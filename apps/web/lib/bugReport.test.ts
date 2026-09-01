import { describe, expect, it } from "vitest";
import { buildBugReportUrl, recordError, recordFailedRequest } from "./bugReport";

describe("buildBugReportUrl", () => {
  it("includes the title, description, and structured context (no PII fields)", () => {
    const url = buildBugReportUrl({
      title: "기록 칩이 안 보여요",
      description: "새로고침 후에도 동일",
      pathname: "/q",
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://github.com/eigger/kibble/issues/new");
    expect(parsed.searchParams.get("title")).toBe("기록 칩이 안 보여요");

    const body = parsed.searchParams.get("body") ?? "";
    expect(body).toContain("새로고침 후에도 동일");
    expect(body).toContain("/q");
    expect(body).toContain("앱 버전");
    expect(body).not.toMatch(/@.+\.(com|net|org)/);
  });

  it("uses English diagnostic labels when locale is en", () => {
    const url = buildBugReportUrl({
      title: "Chips missing",
      description: "",
      pathname: "/history",
      locale: "en",
    });
    const body = new URL(url).searchParams.get("body") ?? "";
    expect(body).toContain("App version");
    expect(body).toContain("(no description)");
  });

  it("attaches recorded failed requests with method/path/status only", () => {
    recordFailedRequest("GET", "/api/home", 403);
    const url = buildBugReportUrl({ title: "t", description: "d", pathname: "/x" });
    const body = new URL(url).searchParams.get("body") ?? "";
    expect(body).toContain("GET /api/home → 403");
  });

  it("attaches recorded console errors", () => {
    recordError("marker-err-1: something broke");
    const url = buildBugReportUrl({ title: "t", description: "d", pathname: "/x" });
    const body = new URL(url).searchParams.get("body") ?? "";
    expect(body).toContain("marker-err-1: something broke");
  });

  it("caps the ring buffer so only the most recent entries are kept", () => {
    for (let i = 0; i < 10; i++) {
      recordError(`ring-marker-${i}`);
    }
    const url = buildBugReportUrl({ title: "t", description: "d", pathname: "/x" });
    const body = new URL(url).searchParams.get("body") ?? "";
    expect(body).toContain("ring-marker-9");
    expect(body).toContain("ring-marker-5");
    expect(body).not.toContain("ring-marker-4");
    expect(body).not.toContain("ring-marker-0");
  });
});
