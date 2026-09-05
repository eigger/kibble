-- 겔형(젤리·양갱)·츄르형·츄잉형 추가.
-- ALTER TYPE ... ADD VALUE는 PG 12+에서 트랜잭션 안에서도 되지만, 같은 트랜잭션에서
-- 그 값을 쓸 수는 없다. 여기서는 추가만 하므로 문제없다.
ALTER TYPE "ProductForm" ADD VALUE IF NOT EXISTS 'GEL';
ALTER TYPE "ProductForm" ADD VALUE IF NOT EXISTS 'LICKABLE';
ALTER TYPE "ProductForm" ADD VALUE IF NOT EXISTS 'CHEWY';
