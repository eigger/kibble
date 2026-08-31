import type { FastifyInstance } from "fastify";
import { t } from "../lib/i18n.js";
import { requireMediaAccess } from "../lib/mediaAuth.js";

// Phase 1 도메인 모델 연결 전까지 섀시만 유지한다. 미디어 인증 경로는 살아 있어야 빈 껍데기 테스트가 된다.
export async function mediaAttachmentRoutes(app: FastifyInstance) {
  app.get("/file/:filename", async (request, reply) => {
    const allowed = await requireMediaAccess(app, request, reply);
    if (!allowed) return;
    return reply.code(404).send({ error: t("fileNotFound", request.locale) });
  });
}

export async function attachmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.post("/", async (_request, reply) => {
    return reply.code(501).send({ error: "not implemented" });
  });

  app.delete("/:id", async (_request, reply) => {
    return reply.code(501).send({ error: "not implemented" });
  });
}
