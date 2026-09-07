-- 처방의 1회 용량("0.5정", "2.5ml"). 단위가 제각각이라 자유 텍스트다.
-- nullable이다 — 안 적어도 되고, 이 컬럼 이전 처방은 비어 있다 (K-12).

ALTER TABLE "MedicationCourse" ADD COLUMN "dosage" TEXT;
