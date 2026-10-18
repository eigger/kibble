-- 기호성 5단계 세분화 (VERY_HIGH, HIGH, MEDIUM, LOW, VERY_LOW). 값만 더하므로 기존 행에는 영향이 없다.
ALTER TYPE "Palatability" ADD VALUE IF NOT EXISTS 'VERY_HIGH';
ALTER TYPE "Palatability" ADD VALUE IF NOT EXISTS 'VERY_LOW';
