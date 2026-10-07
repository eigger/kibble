import type { PrismaClient, User } from "@prisma/client";

type Db = Pick<PrismaClient, "user">;

/**
 * 로그인 후보. 입력은 스키마가 이미 소문자로 정규화했다. 새 행은 소문자로 저장되므로 먼저 정확히
 * 일치하는 행을 보고(유니크 인덱스), 없으면 대문자가 섞여 저장된 옛 행을 대소문자 무시로 찾는다.
 * 대소문자만 다른 행이 둘 이상이면(이미 쌓인 중복) 오래된 순으로 모두 돌려주고, 호출자가 비밀번호가
 * 맞는 첫 행을 고른다 — 어느 쪽도 로그인이 막히지 않는다.
 */
export async function findLoginCandidates(db: Db, email: string): Promise<User[]> {
  const exact = await db.user.findUnique({ where: { email } });
  if (exact) return [exact];
  return db.user.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
}

/** 대소문자만 다른 이메일까지 이미 쓰이고 있는가 (유니크 인덱스는 정확히 같은 값만 잡는다). */
export async function emailInUse(db: Db, email: string, exceptUserId?: string): Promise<boolean> {
  const found = await db.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
    select: { id: true },
  });
  return found != null;
}
