import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { UPLOAD_CHUNK_SIZE_BYTES } from "@kibble/shared";
import { authRoutes } from "./routes/auth.js";
import { attachmentRoutes, mediaAttachmentRoutes } from "./routes/attachments.js";
import { attachmentChunkRoutes } from "./routes/attachmentChunks.js";
import { settingsRoutes } from "./routes/settings.js";
import { mapProviderRoutes } from "./routes/mapProviders.js";
import { stateRoutes } from "./routes/states.js";
import { backupRoutes } from "./routes/backup.js";
import { localeFromRequest } from "./lib/i18n.js";
import { resolveJwtSecret } from "./lib/jwtSecret.js";
import { prisma } from "./lib/prisma.js";
import { petRoutes, onboardingRoutes } from "./routes/pets.js";
import { householdRoutes } from "./routes/household.js";
import { presetRoutes, eventTypeRoutes } from "./routes/presets.js";
import { homeRoutes } from "./routes/home.js";
import { careRoutes } from "./routes/care.js";
import { eventRoutes } from "./routes/events.js";
import { productRoutes } from "./routes/products.js";
import { parseRoutes } from "./routes/parse.js";
import { apiTokenRoutes } from "./routes/apiTokens.js";
import { pushRoutes } from "./routes/push.js";
import { runAuthenticate } from "./lib/authenticate.js";
import { allowedCorsOrigins, isCorsOriginAllowed } from "./lib/corsOrigin.js";

export type BuildAppOptions = {
  /** false면 테스트 inject 시 로그를 끈다 */
  logger?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const jwtSecret = resolveJwtSecret();
  const app = Fastify({
    bodyLimit: UPLOAD_CHUNK_SIZE_BYTES * 2,
    requestTimeout: 0,
    logger:
      options.logger === false
        ? false
        : {
            serializers: {
              req(request) {
                const rawUrl = request.raw?.url ?? request.url;
                const safeUrl =
                  typeof rawUrl === "string"
                    ? rawUrl.replace(/([?&](?:token|sig|ticket)=)[^&]*/gi, "$1[REDACTED]")
                    : rawUrl;
                return {
                  method: request.method,
                  url: safeUrl,
                  hostname: request.hostname,
                  remoteAddress: request.ip,
                };
              },
            },
          },
  });

  // 로컬 dev(웹 3000/3001 → API 8080/8081)에서 PATCH·DELETE가 CORS preflight에 막히지 않게 한다.
  // 프로덕션은 APP_PUBLIC_URL 오리진만 — same-origin 배포(Caddy)는 영향이 없다.
  const corsOrigins = allowedCorsOrigins();
  if (corsOrigins?.length === 0) {
    app.log.warn(
      "APP_PUBLIC_URL is not set — all cross-origin browser requests will be blocked. Set APP_PUBLIC_URL (or CORS_EXTRA_ORIGINS) if the web app is served from a different host than the API.",
    );
  }
  await app.register(cors, {
    origin(origin, cb) {
      cb(null, isCorsOriginAllowed(origin, corsOrigins));
    },
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  });
  await app.register(cookie);
  await app.register(jwt, { secret: jwtSecret });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  await app.register(rateLimit, { global: false });

  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_request, payload, done) => {
      done(null, payload);
    },
  );

  app.decorateRequest("locale", "ko");
  app.decorateRequest("householdId", null);
  app.decorateRequest("householdRole", null);
  app.decorateRequest("authMethod", "jwt");
  app.decorateRequest("apiTokenContext", null);
  app.addHook("onRequest", async (request) => {
    request.locale = localeFromRequest(request);
  });

  app.decorate("authenticate", async (request, reply) => {
    await runAuthenticate(app, request, reply);
  });

  app.decorate("requireAdmin", async (request, reply) => {
    if (request.authMethod !== "jwt") {
      reply.code(403).send({ error: "admin only" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { role: true },
    });
    if (!user) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    if (user.role !== "ADMIN") {
      reply.code(403).send({ error: "admin only" });
      return;
    }
  });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(petRoutes, { prefix: "/api/pets" });
  await app.register(onboardingRoutes, { prefix: "/api/onboarding" });
  await app.register(householdRoutes, { prefix: "/api/household" });
  await app.register(presetRoutes, { prefix: "/api/presets" });
  await app.register(eventTypeRoutes, { prefix: "/api/event-types" });
  await app.register(homeRoutes, { prefix: "/api/home" });
  await app.register(careRoutes, { prefix: "/api/care" });
  await app.register(productRoutes, { prefix: "/api/products" });
  await app.register(eventRoutes, { prefix: "/api/events" });
  await app.register(parseRoutes, { prefix: "/api/parse" });
  await app.register(stateRoutes, { prefix: "/api/states" });
  await app.register(pushRoutes, { prefix: "/api/push" });
  await app.register(apiTokenRoutes, { prefix: "/api/tokens" });
  await app.register(attachmentChunkRoutes, { prefix: "/api/attachments" });
  await app.register(attachmentRoutes, { prefix: "/api/attachments" });
  await app.register(mediaAttachmentRoutes, { prefix: "/api/attachments" });
  await app.register(mapProviderRoutes, { prefix: "/api/map" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(backupRoutes, { prefix: "/api/backup" });

  await app.ready();
  return app;
}
