// 최초 관리자 계정 + 시스템 EventType 시드.
// 관리자: CLI에서 바로 쓸 때. 로그인 화면 부트스트랩과 별개.
// EventType: findFirst → create (upsert 불가 — docs/seed-event-types.md §1.1).
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";
import { seedSystemEventTypes } from "../src/lib/seed/systemEventTypes.js";

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

  // 관리자는 ADMIN_PASSWORD를 명시적으로 준 경우에만 만든다.
  //
  // 기본값(admin@example.com / changeme123)을 두면 이 시드를 한 번이라도 돌린 인스턴스가
  // **공개 저장소에 적힌 비밀번호**의 관리자 계정을 갖게 된다. 게다가 user.count()가 1이 되어
  // 로그인 화면의 부트스트랩 분기(`user.count() === 0`)가 영영 열리지 않는다 — 안전한 최초
  // 계정 생성 경로를 시드가 스스로 막는 셈이다.
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.log(
      "ADMIN_PASSWORD가 없어 관리자 계정을 만들지 않습니다. 첫 관리자는 웹 로그인 화면에서 생성하세요.",
    );
    return;
  }
  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
