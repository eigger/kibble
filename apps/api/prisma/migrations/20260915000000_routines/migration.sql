-- 루틴 — 미리 정한 값(사료 10g, 영양제 3종)을 1탭으로 저장한다 (WORKPLAN §7.24).
-- 칩(Preset)과 별개 테이블이다: 칩은 타입당 하나이고 시트를 열지만, 루틴은 사용자가 만든 것만 있고
-- 같은 타입을 여러 벌 들 수 있다. 항목이 여럿이면 이벤트 N건을 같은 entryId로 묶는다 (§7.22).

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineItem" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "eventTypeId" TEXT NOT NULL,
    "presetId" TEXT,
    "productId" TEXT,
    "productName" TEXT,
    "quantity" DECIMAL(10,2),
    "unit" TEXT,

    CONSTRAINT "RoutineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Routine_householdId_petId_archivedAt_sortOrder_idx" ON "Routine"("householdId", "petId", "archivedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "RoutineItem_routineId_sortOrder_idx" ON "RoutineItem"("routineId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineItem" ADD CONSTRAINT "RoutineItem_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineItem" ADD CONSTRAINT "RoutineItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineItem" ADD CONSTRAINT "RoutineItem_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineItem" ADD CONSTRAINT "RoutineItem_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "Preset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineItem" ADD CONSTRAINT "RoutineItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
