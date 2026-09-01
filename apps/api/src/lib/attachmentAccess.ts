import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { t } from "./i18n.js";
import { getCachedHouseholdMembership } from "./householdScope.js";
import { requireMediaAccess } from "./mediaAuth.js";

/**
 * 미디어 뷰어의 householdId를 반환한다.
 * - string: K-1 where에 넣을 가구 ID
 * - null: MEDIA_AUTH_DISABLED — 가구 필터 생략
 * - undefined: 응답을 이미 보냈음(401/404)
 */
export async function resolveMediaViewerHouseholdId(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null | undefined> {
  const access = await requireMediaAccess(app, request, reply);
  if (!access.ok) return undefined;
  if ("authDisabled" in access) return null;

  const membership = await getCachedHouseholdMembership(access.userId);
  if (!membership) {
    reply.code(404).send({ error: t("fileNotFound", request.locale) });
    return undefined;
  }
  return membership.householdId;
}
