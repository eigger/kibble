-- EventTypeAlias: 가구별 파싱 별칭만 저장 (시스템 EventType 행 복제 없음)
CREATE TABLE "EventTypeAlias" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "eventTypeKey" TEXT NOT NULL,
    "aliases" TEXT[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTypeAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventTypeAlias_householdId_eventTypeKey_key" ON "EventTypeAlias"("householdId", "eventTypeKey");

ALTER TABLE "EventTypeAlias" ADD CONSTRAINT "EventTypeAlias_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 기존 가구 EventType 복제본의 aliases를 이전 (있을 경우)
INSERT INTO "EventTypeAlias" ("id", "householdId", "eventTypeKey", "aliases", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "householdId",
    "key",
    "aliases",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "EventType"
WHERE "householdId" IS NOT NULL
ON CONFLICT ("householdId", "eventTypeKey") DO UPDATE SET
    "aliases" = EXCLUDED."aliases",
    "updatedAt" = CURRENT_TIMESTAMP;

DELETE FROM "EventType" WHERE "householdId" IS NOT NULL;

-- Preset: 활성 행만 유니크 (소프트삭제 후 재생성 허용)
DROP INDEX IF EXISTS "Preset_householdId_petId_eventTypeId_key";
CREATE UNIQUE INDEX "Preset_householdId_petId_eventTypeId_active_key"
    ON "Preset" ("householdId", "petId", "eventTypeId")
    WHERE "archivedAt" IS NULL;
