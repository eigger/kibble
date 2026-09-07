-- 투약 회차. 기록하는 순간 "그 과정의 몇 번째"인지를 찍어 이력에 남긴다.
-- nullable이다 — 투약이 아닌 기록에는 회차가 없고, 이 컬럼 이전에 남긴
-- 투약 이력도 번호 없이 그대로 보인다 (K-12).

ALTER TABLE "Event" ADD COLUMN "doseOrdinal" INTEGER;
