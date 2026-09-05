-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('MEAL', 'SUPPLEMENT', 'TREAT', 'HYGIENE', 'DEVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "Palatability" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "petId" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" "ProductCategory" NOT NULL DEFAULT 'MEAL',
    "photoPath" TEXT,
    "purchaseUrl" TEXT,
    "dosage" TEXT,
    "ingredients" TEXT,
    "expiryDate" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "purchaseDate" TIMESTAMP(3),
    "costKrw" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "palatability" "Palatability",
    "adverseReactions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "productId" TEXT;

-- CreateIndex
CREATE INDEX "Product_householdId_category_archivedAt_idx" ON "Product"("householdId", "category", "archivedAt");

-- CreateIndex
CREATE INDEX "Product_householdId_isActive_archivedAt_idx" ON "Product"("householdId", "isActive", "archivedAt");

-- CreateIndex
CREATE INDEX "Event_productId_idx" ON "Event"("productId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
