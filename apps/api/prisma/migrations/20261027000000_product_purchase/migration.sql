-- CreateTable
CREATE TABLE "ProductPurchase" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3),
    "costKrw" INTEGER,
    "weightG" INTEGER,
    "store" TEXT,
    "purchaseUrl" TEXT,
    "manufacturedAt" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPurchase_householdId_productId_purchasedAt_idx" ON "ProductPurchase"("householdId", "productId", "purchasedAt" DESC);

-- AddForeignKey
ALTER TABLE "ProductPurchase" ADD CONSTRAINT "ProductPurchase_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPurchase" ADD CONSTRAINT "ProductPurchase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 기존 제품의 구매 값을 구매 1행으로 옮긴다. Product 컬럼은 그대로 두므로(스냅샷) 값의 의미가 바뀌지 않는다.
-- 구매일을 모르면 purchasedAt은 null로 둔다 — 생성일로 채우면 "모름"이 날짜로 바뀐다.
-- weightG·purchaseUrl은 규격이라 행을 만드는 조건이 아니다(행을 만들 때 복사만 한다).
INSERT INTO "ProductPurchase" (
    "id", "householdId", "productId", "purchasedAt", "costKrw", "weightG", "purchaseUrl",
    "manufacturedAt", "expiryDate", "openedAt", "createdAt", "updatedAt"
)
SELECT
    'pp' || md5(random()::text || p."id"), p."householdId", p."id", p."purchaseDate", p."costKrw", p."weightG",
    p."purchaseUrl", p."manufacturedAt", p."expiryDate", p."openedAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" p
WHERE p."purchaseDate" IS NOT NULL
   OR p."costKrw" IS NOT NULL
   OR p."manufacturedAt" IS NOT NULL
   OR p."expiryDate" IS NOT NULL
   OR p."openedAt" IS NOT NULL;
