import { describe, expect, it } from "vitest";
import { resolveLabel } from "./i18n.js";
import { SYSTEM_EVENT_TYPES } from "./seed/systemEventTypes.js";

// 드리프트 가드 — 새 시스템 이벤트 타입을 시드에 추가하면서 서버 라벨 사전(lib/i18n.ts)을
// 빠뜨리면 /api/states가 원시 키("eventType.xxx")를 표시용 필드로 내보낸다.
describe("resolveLabel — 시스템 이벤트 타입 사전", () => {
  it.each(SYSTEM_EVENT_TYPES.map((type) => [type.key, type.label] as const))(
    "%s 라벨이 ko·en 모두 해석된다",
    (_key, label) => {
      for (const locale of ["ko", "en"] as const) {
        const resolved = resolveLabel(label, locale);
        expect(resolved).not.toBe(label);
        expect(resolved).not.toMatch(/^eventType\./);
      }
    },
  );
});
