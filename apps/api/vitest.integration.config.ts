import { defineConfig } from "vitest/config";

// 백업 복원(POST /api/backup/restore)을 실제로 호출하는 테스트 전용 설정.
export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    fileParallelism: false,
  },
});
