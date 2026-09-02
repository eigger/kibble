import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { t } from "../lib/i18n.js";
import { householdWhere } from "../lib/householdScope.js";
import { petStateFor } from "../lib/petState.js";
import {
  requireStateReadAccess,
  resolveTokenScopedField,
  touchApiTokenLastUsed,
} from "../lib/authenticate.js";

async function defaultPetId(householdId: string): Promise<string | null> {
  const pet = await prisma.pet.findFirst({
    where: { ...householdWhere(householdId), archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  return pet?.id ?? null;
}

/**
 * 역방향 API (WORKPLAN P2-04) — 밖에서 kibble의 현재 상태를 읽는다.
 * K-7: 읽기 전용. 이 라우트는 아무것도 쓰지 않는다.
 */
export async function stateRoutes(app: FastifyInstance) {
  app.get(
    "/",
    {
      preHandler: [app.authenticate],
      config: { allowApiToken: true, rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      if (!requireStateReadAccess(request, reply)) return;

      const householdId = request.householdId!;
      const query = request.query as { petId?: string };

      // 반려동물 스코프 토큰이면 그 개체로 고정된다 — 다른 petId를 물으면 403.
      const scoped = resolveTokenScopedField(
        query.petId?.trim() || undefined,
        request.apiTokenContext?.petId ?? undefined,
      );
      if (scoped.mismatch) {
        return reply.code(403).send({ error: t("forbidden", request.locale) });
      }

      const petId = scoped.value ?? (await defaultPetId(householdId));
      if (!petId) {
        return reply.code(404).send({ error: t("petNotFound", request.locale) });
      }

      const state = await petStateFor(prisma, { householdId, petId });
      if (!state) return reply.code(404).send({ error: t("petNotFound", request.locale) });

      if (request.authMethod === "apiToken" && request.apiTokenContext) {
        void touchApiTokenLastUsed(request.apiTokenContext.id);
      }

      return state;
    },
  );
}
