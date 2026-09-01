import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";
import { t } from "./i18n.js";
import { MEDIA_COOKIE_NAME, requireMediaAccess } from "./mediaAuth.js";

/** 미디어 인증 + 첨부가 요청자 가구 소유인지 확인한다. 타 가구는 404(K-3). */
export async function requireAttachmentFileAccess(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  attachmentHouseholdId: string,
): Promise<boolean> {
  const mediaOk = await requireMediaAccess(app, request, reply);
  if (!mediaOk) return false;

  let userId = request.user?.sub;
  if (!userId) {
    const cookieToken = request.cookies?.[MEDIA_COOKIE_NAME];
    if (typeof cookieToken === "string" && cookieToken.length > 0) {
      try {
        const decoded = app.jwt.verify<{ sub: string; purpose?: string }>(cookieToken);
        if (decoded.purpose === "media" && decoded.sub) userId = decoded.sub;
      } catch {
        // fall through
      }
    }
  }
  if (!userId) {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }

  const member = await prisma.householdMember.findFirst({
    where: { userId },
    select: { householdId: true },
  });
  if (!member || member.householdId !== attachmentHouseholdId) {
    reply.code(404).send({ error: t("fileNotFound", request.locale) });
    return false;
  }
  return true;
}
