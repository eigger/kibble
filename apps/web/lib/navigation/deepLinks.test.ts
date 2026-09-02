import { describe, expect, it } from "vitest";
import { buildNavUrl, buildNavWebFallback } from "./deepLinks";

const dest = { lat: 37.5, lon: 127.03, name: "행복 동물병원" };

describe("buildNavUrl", () => {
  it("병원 이름을 인코딩해 카카오 링크를 만든다", () => {
    expect(buildNavUrl("kakao", dest)).toBe(
      `https://map.kakao.com/link/to/${encodeURIComponent(dest.name)},37.5,127.03`,
    );
  });

  it("네이버 딥링크의 appname은 kibble이다", () => {
    expect(buildNavUrl("naver", dest)).toContain("appname=kibble");
  });

  it("T맵은 goalx/goaly 순서로 좌표를 싣는다", () => {
    expect(buildNavUrl("tmap", dest)).toBe(
      `tmap://route?goalname=${encodeURIComponent(dest.name)}&goaly=37.5&goalx=127.03`,
    );
  });
});

describe("buildNavWebFallback", () => {
  it("앱이 없는 경우를 위해 웹 URL을 준다", () => {
    expect(buildNavWebFallback("naver", dest)).toContain("map.naver.com");
    expect(buildNavWebFallback("tmap", dest)).toMatch(/^https:\/\//);
  });
});
