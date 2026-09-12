import type { PrismaClient } from "@prisma/client";
import { mergeSystemEventType } from "./mergeSystemEventType.js";

// "화장실"은 넣지 않는다 — 배변 문장("화장실에서 똥")에서 관리로 오탐한다 (§7.20)
export const CARE_ALIASES = [
  "관리",
  "케어",
  "양치",
  "목욕",
  "발톱",
  "빗질",
  "귀청소",
  "모래",
  "모래갈이",
  "패드",
];

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

/**
 * `litter_change`(모래갈이) → `care` + 태그 `litter_change`. 시드에 CAT 전용 타입으로 있었지만
 * 어떤 프리셋 템플릿에도 없어 칩에 나온 적이 없는 고아 타입이다. 화장실 일은 관리의
 * "화장실" 태그 묶음이 받는다 (WORKPLAN §7.20). 시드 목록에서도 빼야 한다 — 루프의
 * `seedUpdate`가 `archivedAt: null`로 되살린다.
 */
export async function migrateLitterChangeToCare(prisma: PrismaClient): Promise<void> {
  await mergeSystemEventType(prisma, {
    fromKey: "litter_change",
    toKey: "care",
    eventTag: "litter_change",
  });
}
