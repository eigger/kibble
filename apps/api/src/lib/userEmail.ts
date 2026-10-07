import type { PrismaClient, User } from "@prisma/client";

type Db = Pick<PrismaClient, "user">;

/**
 * 로그인 후보. 입력은 스키마가 이미 소문자로 정규화했다. 새 행은 소문자로 저장되지만 옛 행은 대문자가
 * 섞여 있을 수 있으므로 **항상** 대소문자 무시로 가져온다. 저장값이 정규화된 입력과 정확히 같은 행을
 * 맨 앞에, 나머지는 오래된 순으로 두고 호출자가 비밀번호가 맞는 첫 행으로 로그인한다 — 이미 쌓인
 * 대소문자 중복(`mom@x.com`=B, `Mom@x.com`=A)에서도 어느 쪽 계정도 로그인이 막히지 않는다.
 * (정확 일치 행의 비밀번호가 틀려도 다음 후보를 확인한다.)
 */
export async function findLoginCandidates(db: Db, email: string): Promise<User[]> {
  const rows = await db.user.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  return rows.sort((a, b) => Number(b.email === email) - Number(a.email === email));
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
