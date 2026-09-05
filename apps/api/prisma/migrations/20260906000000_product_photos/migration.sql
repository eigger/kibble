-- 제품 사진 여러 장. Product.photoPath는 남겨 두고 "대표 한 장"을 가리키는 포인터로
-- 의미만 바꾼다 — 목록 카드·기록 화면의 읽기 경로가 그대로 살아 있어야 한다.

CREATE TABLE "ProductPhoto" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductPhoto_productId_sortOrder_idx" ON "ProductPhoto"("productId", "sortOrder");
CREATE INDEX "ProductPhoto_path_idx" ON "ProductPhoto"("path");

ALTER TABLE "ProductPhoto" ADD CONSTRAINT "ProductPhoto_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 이미 올라온 사진을 첫 장으로 옮긴다. photoPath는 그대로 두어 대표로 남는다.
INSERT INTO "ProductPhoto" ("id", "productId", "path", "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, "id", "photoPath", 0, "createdAt"
FROM "Product"
WHERE "photoPath" IS NOT NULL;
