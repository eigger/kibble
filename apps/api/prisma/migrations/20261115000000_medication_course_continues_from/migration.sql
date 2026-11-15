-- AlterTable
ALTER TABLE "MedicationCourse" ADD COLUMN "continuesFromId" TEXT;

-- AddForeignKey
ALTER TABLE "MedicationCourse" ADD CONSTRAINT "MedicationCourse_continuesFromId_fkey" FOREIGN KEY ("continuesFromId") REFERENCES "MedicationCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
