import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { allowedCorsOrigins, isCorsOriginAllowed } from "../lib/corsOrigin.js";

describe("CORS", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it("allows PATCH and DELETE in preflight from local web dev origin", async () => {
    for (const method of ["PATCH", "DELETE"] as const) {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/api/events/test-id",
        headers: {
          origin: "http://localhost:3001",
          "access-control-request-method": method,
          "access-control-request-headers": "authorization,content-type",
        },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers["access-control-allow-methods"]).toContain(method);
    }
  });
});

describe("allowedCorsOrigins", () => {
  it("reflects every origin outside production (local dev 3000/3001 → 8080/8081)", () => {
    expect(allowedCorsOrigins({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBeNull();
    expect(allowedCorsOrigins({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("narrows to the APP_PUBLIC_URL origin in production", () => {
    const allowed = allowedCorsOrigins({
      NODE_ENV: "production",
      APP_PUBLIC_URL: "https://kibble.example.com/some/path",
    } as NodeJS.ProcessEnv);
    expect(allowed).toEqual(["https://kibble.example.com"]);
  });

  it("accepts extra hosts through CORS_EXTRA_ORIGINS and drops unparseable entries", () => {
    const allowed = allowedCorsOrigins({
      NODE_ENV: "production",
      APP_PUBLIC_URL: "http://192.168.0.10",
      CORS_EXTRA_ORIGINS: "https://kibble.example.com, not-a-url, ",
    } as NodeJS.ProcessEnv);
    expect(allowed).toEqual(["http://192.168.0.10", "https://kibble.example.com"]);
  });

  it("blocks every cross-origin request when production leaves APP_PUBLIC_URL unset", () => {
    expect(allowedCorsOrigins({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toEqual([]);
  });
});

describe("isCorsOriginAllowed", () => {
  it("lets through requests with no Origin — ApiToken 연동(curl·HA·단축어)", () => {
    expect(isCorsOriginAllowed(undefined, [])).toBe(true);
    expect(isCorsOriginAllowed(undefined, ["https://kibble.example.com"])).toBe(true);
  });

  it("allows only listed origins once an allowlist exists", () => {
    const allowed = ["https://kibble.example.com"];
    expect(isCorsOriginAllowed("https://kibble.example.com", allowed)).toBe(true);
    expect(isCorsOriginAllowed("https://evil.example.com", allowed)).toBe(false);
  });

  it("allows anything when the allowlist is null (dev)", () => {
    expect(isCorsOriginAllowed("https://evil.example.com", null)).toBe(true);
  });
});
