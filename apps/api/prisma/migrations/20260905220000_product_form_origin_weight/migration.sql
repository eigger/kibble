-- 사료·영양제의 제형·원산지·구매 중량.
-- 기존 제품은 전부 NULL로 남는다 — 선택 입력이고 없다고 기능이 막히지 않는다 (K-12).

-- CreateEnum
CREATE TYPE "ProductForm" AS ENUM ('DRY', 'WET', 'SEMI_MOIST', 'POWDER', 'CAPSULE', 'TABLET', 'LIQUID');

-- CreateEnum
CREATE TYPE "KibbleSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "origin" TEXT;
ALTER TABLE "Product" ADD COLUMN "form" "ProductForm";
ALTER TABLE "Product" ADD COLUMN "kibbleSize" "KibbleSize";
ALTER TABLE "Product" ADD COLUMN "weightG" INTEGER;
