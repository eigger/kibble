-- AlterTable
ALTER TABLE "RoutineItem" ADD COLUMN "medicationCourseId" TEXT;

-- CreateIndex
CREATE INDEX "RoutineItem_medicationCourseId_idx" ON "RoutineItem"("medicationCourseId");

-- AddForeignKey
ALTER TABLE "RoutineItem" ADD CONSTRAINT "RoutineItem_medicationCourseId_fkey" FOREIGN KEY ("medicationCourseId") REFERENCES "MedicationCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
