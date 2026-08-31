// 최초 관리자 계정 + 시스템 EventType 시드.
// 관리자: CLI에서 바로 쓸 때. 로그인 화면 부트스트랩과 별개.
// EventType: findFirst → create (upsert 불가 — docs/seed-event-types.md §1.1).
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { seedSystemEventTypes } from "../src/lib/seed/systemEventTypes.js";

const prisma = new PrismaClient();

async function main() {
  const eventTypesCreated = await seedSystemEventTypes(prisma);
  if (eventTypesCreated > 0) {
    console.log(`시스템 EventType ${eventTypesCreated}건 생성`);
  } else {
    console.log("시스템 EventType 이미 존재 — 건너뜀");
  }

  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.ADMIN_PASSWORD ?? "changeme123";
  const name = process.env.ADMIN_NAME ?? "관리자";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`이미 존재하는 계정입니다: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({ data: { name, email, passwordHash, role: "ADMIN" } });

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
