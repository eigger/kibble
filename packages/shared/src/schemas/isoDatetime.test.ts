import { describe, expect, it } from "vitest";
import { createEventSchema } from "./event.js";
import { isoDatetime } from "./isoDatetime.js";

describe("isoDatetime", () => {
  it("오프셋 ISO를 받아 UTC로 정규화한다", () => {
    expect(isoDatetime.parse("2024-01-02T03:04:05+09:00")).toBe("2024-01-01T18:04:05.000Z");
    expect(isoDatetime.parse("2024-01-02T03:04:05-05:00")).toBe("2024-01-02T08:04:05.000Z");
  });

  it("콜론 없는 오프셋(+0900)도 받는다", () => {
    expect(isoDatetime.parse("2024-01-02T03:04:05+0900")).toBe("2024-01-01T18:04:05.000Z");
  });

  it("초를 생략한 시각도 받는다", () => {
    expect(isoDatetime.parse("2024-01-02T03:04Z")).toBe("2024-01-02T03:04:00.000Z");
    expect(isoDatetime.parse("2024-01-02T12:04+09:00")).toBe("2024-01-02T03:04:00.000Z");
  });

  it("소수초(밀리초·마이크로초)를 받는다", () => {
    expect(isoDatetime.parse("2024-01-02T03:04:05.123Z")).toBe("2024-01-02T03:04:05.123Z");
    expect(isoDatetime.parse("2024-01-02T03:04:05.123456+09:00")).toBe("2024-01-01T18:04:05.123Z");
  });

  it("HA now() 형태의 공백 구분자를 받는다", () => {
    expect(isoDatetime.parse("2024-01-02 03:04:05.123456+09:00")).toBe("2024-01-01T18:04:05.123Z");
  });

  it("거부한다: 날짜만, 존재하지 않는 날짜, 24시, 오프셋 없음, 연도 범위 밖", () => {
    for (const bad of [
      "2024-01-02",
      "nope",
      "2024-02-30T00:00:00Z",
      "2024-01-02T24:00:00Z",
      "2024-01-02T03:04:05",
      "9999-12-31T23:59:59-05:00",
      "0000-01-01T08:00:00+09:00",
    ]) {
      expect(isoDatetime.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("createEventSchema.occurredAt에 적용된다", () => {
    const r = createEventSchema.parse({ occurredAt: "2024-01-02T03:04:05+09:00" });
    expect(r.occurredAt).toBe("2024-01-01T18:04:05.000Z");
  });
});
