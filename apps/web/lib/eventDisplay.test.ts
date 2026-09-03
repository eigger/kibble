import { describe, expect, it } from "vitest";
import { eventAuditParts } from "./eventDisplay";

function t(key: string, params?: Record<string, string>): string {
  const dict: Record<string, string> = {
    eventDetailCreatedBy: "{name} 작성",
    eventDetailLastModified: "{datetime} 수정",
    eventDetailLastModifiedBy: "{name} · {datetime} 수정",
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
      eventAuditParts({ createdByName: "보람", createdAt: "2026-09-01T00:00:00Z" }, t, "ko"),
    ).toEqual(["보람 작성"]);
  });

  // API 토큰으로 생성된 기록, 혹은 작성자 계정이 삭제된 기록은 createdByName이 없다
  // — 그 줄만 조용히 빠진다.
  it("작성자를 모르면 그 줄만 건너뛴다", () => {
    const parts = eventAuditParts(
      {
        createdByName: null,
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
          createdByName: "보람",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:01.500Z",
        },
        t,
        "ko",
      ),
    ).toEqual(["보람 작성"]);
  });

  // 수정한 사람 정보가 없으면(오래된 기록, 혹은 편집자 계정 삭제) 이름 없이 날짜만.
  it("2초를 넘겨 갈라지고 편집자를 모르면 날짜만 표시한다", () => {
    const parts = eventAuditParts(
      {
        createdByName: "보람",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:05.000Z",
      },
      t,
      "ko",
    );
    expect(parts).toEqual(["보람 작성", "9월 1일 09:00 수정"]);
  });

  // 작성자와 편집자가 같으면 이름을 반복하지 않는다 — "보람 작성 · 보람 · ... 수정"은 군더더기다.
  it("작성자와 편집자가 같으면 수정 줄에 이름을 반복하지 않는다", () => {
    const parts = eventAuditParts(
      {
        createdByName: "보람",
        updatedByName: "보람",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:05.000Z",
      },
      t,
      "ko",
    );
    expect(parts).toEqual(["보람 작성", "9월 1일 09:00 수정"]);
  });

  // 다른 사람이 고쳤으면 누가 고쳤는지 밝힌다.
  it("작성자와 편집자가 다르면 편집자 이름을 수정 줄에 넣는다", () => {
    const parts = eventAuditParts(
      {
        createdByName: "보람",
        updatedByName: "별이",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:05.000Z",
      },
      t,
      "ko",
    );
    expect(parts).toEqual(["보람 작성", "별이 · 9월 1일 09:00 수정"]);
  });

  // 작성자는 모르지만(계정 삭제 등) 편집자는 아는 경우 — 편집자 이름만 붙는다.
  it("작성자를 모르고 편집자만 알면 편집자 이름을 붙인다", () => {
    const parts = eventAuditParts(
      {
        createdByName: null,
        updatedByName: "별이",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:05.000Z",
      },
      t,
      "ko",
    );
    expect(parts).toEqual(["별이 · 9월 1일 09:00 수정"]);
  });
});
