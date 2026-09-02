import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { isApiTokenPlaintext, hashApiToken } from "./apiToken.js";
import { getCachedTokenVersion } from "./tokenVersion.js";
import { getCachedHouseholdMembership } from "./householdScope.js";
import { prisma } from "./prisma.js";
import { t } from "./i18n.js";

export type AuthMethod = "jwt" | "apiToken";

export type ApiTokenAuthContext = {
  id: string;
  scopes: string[];
  presetId: string | null;
  petId: string | null;
  eventTypeId: string | null;
};

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function routeAllowsApiToken(request: FastifyRequest): boolean {
  return request.routeOptions.config?.allowApiToken === true;
}

async function authenticateApiToken(
  request: FastifyRequest,
  reply: FastifyReply,
  plaintext: string,
): Promise<boolean> {
  if (!isApiTokenPlaintext(plaintext)) {
    reply.code(401).send({ error: t("invalidApiToken", request.locale) });
    return false;
  }

  const tokenHash = hashApiToken(plaintext);
  const row = await prisma.apiToken.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      id: true,
      householdId: true,
      scopes: true,
      presetId: true,
      petId: true,
      eventTypeId: true,
    },
  });

  if (!row) {
    reply.code(401).send({ error: t("invalidApiToken", request.locale) });
    return false;
  }

  request.authMethod = "apiToken";
  request.householdId = row.householdId;
  request.householdRole = null;
  request.apiTokenContext = {
    id: row.id,
    scopes: row.scopes,
    presetId: row.presetId,
    petId: row.petId,
    eventTypeId: row.eventTypeId,
  };

  return true;
}

/** 인가 통과 후에만 호출 — K-7: GET preHandler에서 DB 쓰기 금지 */
export async function touchApiTokenLastUsed(tokenId: string): Promise<void> {
  await prisma.apiToken
    .update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
}

async function authenticateJwt(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }

  if (request.user.purpose === "media" || request.user.purpose === "backup") {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }

  const userId = request.user.sub;
  if (typeof request.user.tv !== "number") {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  const tokenTv = request.user.tv;
  const dbTv = await getCachedTokenVersion(userId);
  if (dbTv === null || dbTv !== tokenTv) {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }

  const membership = await getCachedHouseholdMembership(userId);
  request.authMethod = "jwt";
  request.apiTokenContext = null;
  request.householdId = membership?.householdId ?? null;
  request.householdRole = membership?.role ?? null;
  return true;
}

/**
 * JWT 또는 ApiToken(kbl_*).
 * ApiToken은 `config: { allowApiToken: true }`가 선언된 라우트만 통과 (K-5 opt-out 기본).
 */
export async function runAuthenticate(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = bearerToken(request);
  if (token && isApiTokenPlaintext(token)) {
    if (!routeAllowsApiToken(request)) {
      reply.code(403).send({ error: t("apiTokenNotAllowed", request.locale) });
      return;
    }
    const ok = await authenticateApiToken(request, reply, token);
    if (!ok) return;
    return;
  }

  const ok = await authenticateJwt(app, request, reply);
  if (!ok) return;
}

/** 토큰에 고정된 스코프 필드 — 본문이 다른 값을 보내면 403 */
export function resolveTokenScopedField(
  bodyValue: string | undefined,
  tokenValue: string | null | undefined,
): { value: string | undefined; mismatch: boolean } {
  if (tokenValue) {
    if (bodyValue !== undefined && bodyValue !== tokenValue) {
      return { value: undefined, mismatch: true };
    }
    return { value: tokenValue, mismatch: false };
  }
  return { value: bodyValue, mismatch: false };
}

/**
 * 상태 조회 접근. 토큰은 `state:read`가 있어야 한다 — 기존 토큰은 `event:create`만
 * 갖고 있으므로 자동으로 읽기 권한이 생기지 않는다.
 */
export function requireStateReadAccess(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.authMethod === "apiToken") {
    const scopes = request.apiTokenContext?.scopes ?? [];
    if (!scopes.includes("state:read")) {
      reply.code(403).send({ error: t("forbidden", request.locale) });
      return false;
    }
  } else if (request.authMethod !== "jwt") {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }

  if (!request.householdId) {
    reply.code(403).send({ error: t("noHousehold", request.locale) });
    return false;
  }
  return true;
}

export function requireEventCreateAccess(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.authMethod === "apiToken") {
    const scopes = request.apiTokenContext?.scopes ?? [];
    if (!scopes.includes("event:create")) {
      reply.code(403).send({ error: t("forbidden", request.locale) });
      return false;
    }
    if (!request.householdId) {
      reply.code(403).send({ error: t("noHousehold", request.locale) });
      return false;
    }
    return true;
  }

  if (request.authMethod !== "jwt") {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }

  const householdId = request.householdId;
  if (!householdId) {
    reply.code(403).send({ error: t("noHousehold", request.locale) });
    return false;
  }
  if (request.householdRole === "VIEWER") {
    reply.code(403).send({ error: t("viewerReadOnly", request.locale) });
    return false;
  }
  return true;
}

export function sessionUserId(request: FastifyRequest): string | null {
  return request.authMethod === "jwt" ? request.user.sub : null;
}
