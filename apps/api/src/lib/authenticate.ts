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

  void prisma.apiToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return true;
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

/** JWT 또는 ApiToken(kbl_*) — householdId를 데코레이트한다 (K-2). */
export async function runAuthenticate(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = bearerToken(request);
  if (token && isApiTokenPlaintext(token)) {
    const ok = await authenticateApiToken(request, reply, token);
    if (!ok) return;
    return;
  }

  const ok = await authenticateJwt(app, request, reply);
  if (!ok) return;
}

export function requireSessionAuth(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.authMethod !== "jwt") {
    reply.code(403).send({ error: t("apiTokenNotAllowed", request.locale) });
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
