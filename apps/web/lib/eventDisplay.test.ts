import { describe, expect, it } from "vitest";
import { eventAuditParts } from "./eventDisplay";

function t(key: string, params?: Record<string, string>): string {
  const dict: Record<string, string> = {
    eventDetailCreatedBy: "{name} 작성",
    eventDetailLastModified: "{datetime} 수정",
  };
  const template = dict[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
}

describe("eventAuditParts", () => {
  it("작성자·수정 정보가 둘 다 없으면 빈 배열", () => {
    expect(eventAuditParts({}, t, "ko")).toEqual([]);
  });

  it("작성자만 있으면 그 한 줄만", () => {
    expect(
      eventAuditParts({ createdBy: { name: "보람" }, createdAt: "2026-09-01T00:00:00Z" }, t, "ko"),
    ).toEqual(["보람 작성"]);
  });

  // API 토큰으로 생성된 기록은 createdBy가 없다 — 그 줄만 조용히 빠진다.
  it("작성자를 모르면 그 줄만 건너뛴다", () => {
    const parts = eventAuditParts(
      {
        createdBy: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
      },
      t,
      "ko",
    );
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain("수정");
  });

  // 생성 직후 createdAt·updatedAt이 같은 순간(또는 거의 같은 순간)이면 "수정됨"이 아니다.
  it("생성과 동시(2초 이내)면 수정 표시를 하지 않는다", () => {
    expect(
      eventAuditParts(
        {
          createdBy: { name: "보람" },
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:01.500Z",
        },
        t,
        "ko",
      ),
    ).toEqual(["보람 작성"]);
  });

  it("2초를 넘겨 갈라지면 수정 표시를 한다", () => {
    const parts = eventAuditParts(
      {
        createdBy: { name: "보람" },
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:05.000Z",
      },
      t,
      "ko",
    );
    expect(parts).toEqual(["보람 작성", "9월 1일 09:00 수정"]);
  });
});
