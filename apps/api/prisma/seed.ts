// 최초 관리자 계정 + 시스템 EventType 시드.
// 관리자: CLI에서 바로 쓸 때. 로그인 화면 부트스트랩과 별개.
// EventType: findFirst → create (upsert 불가 — docs/seed-event-types.md §1.1).
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { seedSystemEventTypes } from "../src/lib/seed/systemEventTypes.js";

const prisma = new PrismaClient();

async function ensureAdminHousehold(userId: string): Promise<void> {
  const existing = await prisma.householdMember.findFirst({ where: { userId } });
  if (existing) return;

  await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({ data: { name: "우리 집" } });
    await tx.householdMember.create({
      data: { householdId: household.id, userId, role: "OWNER" },
    });
  });
}

async function main() {
  const eventTypesCreated = await seedSystemEventTypes(prisma);
  if (eventTypesCreated.created > 0 || eventTypesCreated.updated > 0) {
    console.log(
      `시스템 EventType — 생성 ${eventTypesCreated.created}건, 갱신 ${eventTypesCreated.updated}건`,
    );
  } else {
    console.log("시스템 EventType 변경 없음");
  }

  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.ADMIN_PASSWORD ?? "changeme123";
  const name = process.env.ADMIN_NAME ?? "관리자";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await ensureAdminHousehold(existing.id);
    console.log(`이미 존재하는 계정입니다: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { name, email, passwordHash, role: "ADMIN" } });
    const household = await tx.household.create({ data: { name: "우리 집" } });
    await tx.householdMember.create({
      data: { householdId: household.id, userId: created.id, role: "OWNER" },
    });
    return created;
  });

  console.log(`관리자 계정 생성 완료: ${admin.email} (id: ${admin.id})`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`기본 비밀번호(${password})를 사용했습니다. 로그인 후 즉시 변경하세요.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
