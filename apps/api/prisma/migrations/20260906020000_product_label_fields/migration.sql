-- 약·제제 카테고리와 사료 라벨 표기사항.
-- 전부 nullable이라 기존 제품은 그대로 남는다 (K-12).

ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'MEDICATION';

ALTER TABLE "Product" ADD COLUMN "flavor" TEXT;
ALTER TABLE "Product" ADD COLUMN "ingredientRegistrationNo" TEXT;
ALTER TABLE "Product" ADD COLUMN "registeredIngredients" TEXT;
ALTER TABLE "Product" ADD COLUMN "importer" TEXT;
ALTER TABLE "Product" ADD COLUMN "manufacturedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "storage" TEXT;
ALTER TABLE "Product" ADD COLUMN "usage" TEXT;
