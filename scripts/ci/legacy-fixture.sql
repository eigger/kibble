-- 업그레이드 검증용 "이미 운영 중이던 설치"를 흉내내는 최소 데이터.
--
-- 직전 릴리스 태그의 스키마에 들어가야 하므로, 기본값이 있는 컬럼은 일부러 생략하고
-- 오래전부터 존재해온 필수 컬럼만 채운다.

INSERT INTO "Household" (id, name, "createdAt") VALUES
  ('fixture-household', '우리 집', now());

INSERT INTO "User" (id, name, email, "passwordHash", role, "tokenVersion", "createdAt") VALUES
  ('fixture-admin',  '관리자', 'Fixture.Admin@Example.COM', 'not-a-real-hash', 'ADMIN',   0, now()),
  ('fixture-member', '배우자', 'fixture.member@example.com', 'not-a-real-hash', 'GENERAL', 0, now());

INSERT INTO "HouseholdMember" (id, "householdId", "userId", role) VALUES
  ('fixture-member-admin', 'fixture-household', 'fixture-admin', 'OWNER'),
  ('fixture-member-member', 'fixture-household', 'fixture-member', 'MEMBER');

INSERT INTO "Pet" (id, "householdId", name, species, neutered, "sortOrder") VALUES
  ('fixture-pet', 'fixture-household', '츄츄', 'CAT', false, 0);

INSERT INTO "Setting" (key, value) VALUES
  ('fixture-setting', 'legacy-value');
