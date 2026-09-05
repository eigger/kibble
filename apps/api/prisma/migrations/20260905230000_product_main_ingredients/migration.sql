-- 주성분 한 줄. 전성분(ingredients)은 그대로 두고 별도 컬럼으로 받는다 —
-- 목록 카드에 4000자 전성분을 띄울 수는 없다.
ALTER TABLE "Product" ADD COLUMN "mainIngredients" TEXT;
