import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

// 백업 복원(POST /api/backup/restore)을 실제로 호출하는 테스트 전용 설정.
export default defineConfig({
  resolve: {
    alias: {
      "@kibble/shared": path.resolve(root, "../../packages/shared/src/index.ts"),
    },
  },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    fileParallelism: false,
  },
});
