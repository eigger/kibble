import { defineConfig, env } from "prisma/config";

// Prisma 7: datasource URL은 schema.prisma가 아니라 여기로 옮긴다.
// Docker/프로덕션 migrate deploy가 이 파일을 읽어야 하므로, garage와 같이
// prisma/config의 env()로 DATABASE_URL을 넘긴다 (process.env 직접 참조는
// config 로더에 따라 url이 비어 "datasource.url required"로 터질 수 있음).
//
// generate만 DB에 안 붙는다 — CI/Docker 빌드에서는 DATABASE_URL 더미를 환경에 넣고 돌린다
// (apps/api/Dockerfile, .github/workflows/ci.yml). migrate는 실제 URL 필수.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // 이 경로는 **실행 시점 cwd 기준**으로 풀린다(config 파일 위치가 아니다).
    // 따라서 `prisma db seed`는 apps/api 에서만 동작한다 — `npm run seed -w apps/api`.
    // 컨테이너(cwd=/app)에서 돌리면 /app/prisma/seed.ts 를 찾다 실패하므로
    // docker-compose 의 기동 커맨드에서는 시드를 부르지 않는다.
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
