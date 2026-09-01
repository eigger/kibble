import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma.js";
import { t } from "./i18n.js";

/** K-1: 리소스 where에 넣을 가구 스코프 객체 */
export function householdWhere(householdId: string) {
  return { householdId } as const;
}

export type HouseholdMembership = { householdId: string; role: Role };

// authenticate 매 요청마다 householdMember를 조회하면 첨부·스캔 등 연속 요청 비용이 커진다.
// tokenVersion과 동일하게 60초 인메모리 캐시를 쓴다. 멤버십·역할 변경은 최대 60초 지연될 수 있다.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { membership: HouseholdMembership | null; expiresAt: number }>();

/** 인증된 사용자의 기본 가구(첫 멤버십). 다중 가구는 Phase 2 이후. */
export async function getCachedHouseholdMembership(
  userId: string,
): Promise<HouseholdMembership | null> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.membership;

  const row = await prisma.householdMember.findFirst({
    where: { userId },
    orderBy: { id: "asc" },
    select: { householdId: true, role: true },
  });
  const membership = row ? { householdId: row.householdId, role: row.role } : null;
  cache.set(userId, { membership, expiresAt: Date.now() + CACHE_TTL_MS });
  return membership;
}

export function invalidateHouseholdCache(userId: string): void {
  cache.delete(userId);
}

/** K-2: 라우트는 householdId를 직접 파싱하지 않고 이 헬퍼만 쓴다. */
export function requireHouseholdId(
  request: FastifyRequest,
  reply: FastifyReply,
): string | undefined {
  const householdId = request.householdId;
  if (!householdId) {
    reply.code(403).send({ error: t("noHousehold", request.locale) });
    return undefined;
  }
  return householdId;
}

/** VIEWER는 읽기 전용 — 쓰기 라우트는 이 헬퍼로 가구+쓰기 권한을 함께 검사한다. */
export function requireHouseholdWrite(
  request: FastifyRequest,
  reply: FastifyReply,
): string | undefined {
  const householdId = requireHouseholdId(request, reply);
  if (!householdId) return undefined;
  if (request.householdRole === "VIEWER") {
    reply.code(403).send({ error: t("viewerReadOnly", request.locale) });
    return undefined;
  }
  return householdId;
}

/** ApiToken 등 가구 관리 작업 — OWNER만 */
export function requireHouseholdOwner(
  request: FastifyRequest,
  reply: FastifyReply,
): string | undefined {
  const householdId = requireHouseholdId(request, reply);
  if (!householdId) return undefined;
  if (request.householdRole !== "OWNER") {
    reply.code(403).send({ error: t("ownerOnly", request.locale) });
    return undefined;
  }
  return householdId;
}

/** K-1: 대상 사용자가 요청자와 같은 가구 멤버인지 확인 */
export async function findHouseholdMember(
  householdId: string,
  userId: string,
): Promise<{ role: Role } | null> {
  return prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
    select: { role: true },
  });
}
