-- 기존 3단계 기호성 데이터의 별점(★5, ★1) 의미를 5단계 체계로 보존:
-- 새 enum 값은 추가된 트랜잭션과 같은 트랜잭션에서 쓸 수 없으므로(PG 제약), 별도 마이그레이션 파일에서 갱신한다.
-- 기존 HIGH(원래 ★5 "아주 잘 먹음") -> VERY_HIGH(★5 "아주 잘 먹음")
-- 기존 LOW(원래 ★1 "안 먹음") -> VERY_LOW(★1 "안 먹음 / 거부")
-- 기존 MEDIUM(원래 ★3 "보통") -> MEDIUM(★3 "보통") 유지
UPDATE "Product" SET "palatability" = 'VERY_HIGH' WHERE "palatability" = 'HIGH';
UPDATE "Product" SET "palatability" = 'VERY_LOW' WHERE "palatability" = 'LOW';
