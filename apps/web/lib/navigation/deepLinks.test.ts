import { describe, expect, it } from "vitest";
import { buildNavUrl, buildNavWebFallback } from "./deepLinks";

const dest = { lat: 37.5, lon: 127.03, name: "행복 동물병원" };

describe("buildNavUrl", () => {
  // 웹 링크(map.kakao.com/link/to)는 폰에서 앱으로 안 넘어가 경로가 안 잡힌다.
  it("카카오는 앱 스킴으로 목적지를 넘긴다", () => {
    expect(buildNavUrl("kakao", dest)).toBe("kakaomap://route?ep=37.5,127.03&by=CAR");
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
