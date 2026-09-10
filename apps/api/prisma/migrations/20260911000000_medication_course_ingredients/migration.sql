-- 처방의 성분 자유 텍스트. 조제약은 처방마다 조성이 달라 구조화하지 않는다 (WORKPLAN §7.19).
-- nullable이다 — 안 적어도 되고, 이 컬럼 이전 처방은 비어 있다 (K-12).

ALTER TABLE "MedicationCourse" ADD COLUMN "ingredients" TEXT;
