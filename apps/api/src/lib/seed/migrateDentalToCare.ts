import type { PrismaClient } from "@prisma/client";
import { mergeSystemEventType } from "./mergeSystemEventType.js";

export const CARE_ALIASES = ["관리", "케어", "양치", "목욕", "발톱", "빗질", "귀청소"];

/**
 * `grooming`(그루밍) → `care`(관리). 시드 루프 **앞**에서 돈다 — 제자리 rename이라 루프가
 * `care` 행을 update로 받는다. (`care`가 이미 있으면 `grooming`을 합친다)
 */
export async function migrateGroomingToCare(prisma: PrismaClient): Promise<void> {
  await mergeSystemEventType(prisma, {
    fromKey: "grooming",
    toKey: "care",
    rename: {
      key: "care",
      label: "eventType.care",
      icon: "hand-heart",
      aliases: CARE_ALIASES,
    },
  });
}

/**
 * `dental`(양치) → `care` + 태그 `dental`. 시드 루프 **뒤**에서 돈다 — `care`가 반드시 있어야
 * 합칠 수 있다. 기존 양치 기록은 "관리 · 양치"로 읽힌다 (WORKPLAN §7.18).
 */
export async function migrateDentalToCare(prisma: PrismaClient): Promise<void> {
  await mergeSystemEventType(prisma, { fromKey: "dental", toKey: "care", eventTag: "dental" });
}
