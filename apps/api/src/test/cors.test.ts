import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

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
