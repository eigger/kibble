-- AlterTable
ALTER TABLE "MedicationCourse" ADD COLUMN "doseSlotKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "doseSlotIndex" INTEGER;

-- CreateIndex
CREATE INDEX "Event_medicationCourseId_doseSlotIndex_idx" ON "Event"("medicationCourseId", "doseSlotIndex");
