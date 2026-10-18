-- 기호성 5단계 세분화 (VERY_HIGH, HIGH, MEDIUM, LOW, VERY_LOW). 값만 더하므로 기존 행에는 영향이 없다.
-- schema.prisma 순서와 일치하도록 BEFORE/AFTER 위치 지정.
ALTER TYPE "Palatability" ADD VALUE IF NOT EXISTS 'VERY_HIGH' BEFORE 'HIGH';
ALTER TYPE "Palatability" ADD VALUE IF NOT EXISTS 'VERY_LOW' AFTER 'LOW';
