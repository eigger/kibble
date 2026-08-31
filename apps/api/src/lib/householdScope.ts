import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";

/** K-1: 리소스 where에 넣을 가구 스코프 객체 */
export function householdWhere(householdId: string) {
  return { householdId } as const;
}

/** 인증된 사용자의 기본 가구(첫 멤버십). 다중 가구는 Phase 2 이후. */
export async function resolveHouseholdIdForUser(userId: string): Promise<string | null> {
  const membership = await prisma.householdMember.findFirst({
    where: { userId },
    orderBy: { id: "asc" },
    select: { householdId: true },
  });
  return membership?.householdId ?? null;
}

/** K-2: 라우트는 householdId를 직접 파싱하지 않고 이 헬퍼만 쓴다. */
export function requireHouseholdId(
  request: FastifyRequest,
  reply: FastifyReply,
): string | undefined {
  const householdId = request.householdId;
  if (!householdId) {
    reply.code(403).send({ error: "no_household" });
    return undefined;
  }
  return householdId;
}
