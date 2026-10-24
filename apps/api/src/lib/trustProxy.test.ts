import { readFileSync } from "node:fs";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { DEFAULT_TRUST_PROXY, parseTrustProxy } from "./trustProxy.js";

describe("parseTrustProxy", () => {
  it("defaults to private ranges, false turns it off", () => {
    expect(parseTrustProxy(undefined)).toBe(DEFAULT_TRUST_PROXY);
    expect(parseTrustProxy("")).toBe(DEFAULT_TRUST_PROXY);
    expect(parseTrustProxy("false")).toBe(false);
  });
  it("parses true and address lists", () => {
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("172.16.0.0/12, 10.0.0.0/8")).toBe("172.16.0.0/12,10.0.0.0/8");
    expect(parseTrustProxy("loopback, uniquelocal")).toBe("loopback,uniquelocal");
  });
  it("rejects hop-count integers", () => {
    expect(() => parseTrustProxy("1")).toThrow(/정수/);
  });
});

describe("default trust", () => {
  it("trusts private ranges only", async () => {
    expect(DEFAULT_TRUST_PROXY).toBe("loopback,linklocal,uniquelocal");

    const app = Fastify({ trustProxy: parseTrustProxy(undefined) });
    app.get("/", async (r) => r.ip);
    const ip = async (xff: string, remoteAddress: string) =>
      (await app.inject({ url: "/", remoteAddress, headers: { "x-forwarded-for": xff } })).body;

    // Caddy(사설 대역)가 붙여 준 마지막 항목이 클라이언트 — 앞의 위조 항목은 무시된다
    expect(await ip("9.9.9.9, 203.0.113.2", "172.18.0.5")).toBe("203.0.113.2");
    // 사설 대역 프록시 체인은 건너뛴다
    expect(await ip("203.0.113.2, 10.0.0.9", "172.18.0.5")).toBe("203.0.113.2");
    // 공인 주소에서 직접 들어오면 헤더를 믿지 않는다
    expect(await ip("1.2.3.4", "198.51.100.9")).toBe("198.51.100.9");
  });

  it("compose files pass the value through without a default", () => {
    // 줄이 없으면 .env의 TRUST_PROXY가 컨테이너에 닿지 않는다. 기본값은 코드에 둔다 — 업데이트 diff에 안 잡히게
    for (const file of ["docker-compose.yml", "docker-compose.prod.yml"]) {
      const text = readFileSync(new URL(`../../../../${file}`, import.meta.url), "utf8");
      expect(text).toMatch(/^\s+TRUST_PROXY: \$\{TRUST_PROXY:-\}$/m);
    }
  });
});
