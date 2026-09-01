# 작업 기록

> **이 문서의 수명**: Phase 0~5 진행 중에만 유지한다. **정식 릴리스 전에 삭제하거나 `CHANGELOG.md`로 정리**한다.
>
> **목적 두 가지**
> 1. **회귀 방지** — 이미 검토하고 기각한 안을 다시 제안하지 않기 위해. 근거를 잃으면 같은 논의를 반복한다.
> 2. **큰 그림 유지** — 여러 장소·여러 세션으로 나뉘어 작업하므로, 이어받는 쪽이 "지금 어디까지 왔고 왜 이렇게 됐는지"를 이 문서 하나로 파악할 수 있어야 한다.

## 기록 규칙

**적는 것**

- 확정하거나 변경한 결정과 **그 근거**
- **기각한 안과 기각 사유** (가장 중요 — §1에 상시 유지)
- 조사·리뷰로 알아낸 사실 중 계획을 바꾼 것
- 다음 세션이 이어받아야 할 미완 항목

**적지 않는 것**

- 파일별 변경 내역 — git이 한다
- 시도했다가 버린 코드의 세부 — 결론만 §1에 남긴다
- 개인 정보, 실기록 인용 (공개 저장소다)

**결정이 바뀌면 `docs/WORKPLAN.md`를 먼저 고치고, 그 다음 여기에 기록한다.** 계획서가 단일 진실 원천이고 이 문서는 이력이다.

---

## 1. 기각·보류된 안 — 다시 제안하지 말 것

재검토 조건이 명시된 것만 조건 충족 시 다시 연다.

| # | 안 | 판정 | 근거 | 재검토 조건 |
|---|---|---|---|---|
| R1 | NFC 태그를 1급 입력 경로로 | **기각** | 인증 경계 미해결(태그 URL은 비밀이 아닌데 세션이 필요), 태그 원가, iOS Web NFC 미지원 | Phase 5 이후, 다른 경로의 마찰이 실제 문제로 확인될 때 |
| R2 | 인쇄 QR 라벨을 1급 입력 경로로 | **보류** | 시나리오 11개 대조에서 **1순위인 경우 0건.** 타일과 정확히 같은 일을 더 느리게 한다 | WORKPLAN §3.4 트리거 3개 중 하나 (프리셋 12개 초과 / 반려동물 2마리 이상 / 정기 기록자 추가) |
| R3 | stash에서 파일을 선별 복사해 이식 | **기각** | "말 없는 설정"을 놓친다 — entrypoint pristine 백업, sw.js 뒤 슬래시 함정, prisma.config env() 우회 | — |
| R4 | stash를 고쳐가며 kibble로 전환 | **기각** | 단일 테넌트 전제가 어디에 남았는지 추적 불가. 죽은 코드와 새 코드가 섞인다 | — |
| R5 | stash 마이그레이션 11개 이식 | **기각** | 첫 배포가 재고 테이블을 만들고 지운다. `barcode_value_globally_unique`는 다중 테넌트에서 틀린 제약 | — |
| R6 | stash git history 이식 | **기각** | 공개 준비에 불리. 배경은 stash 저장소에서 `git log -S`로 찾는다 | — |
| R7 | 별도 `/api/hooks/event` 라우트 | **기각** | `POST /api/events`가 세션·토큰 양쪽을 받으면 표면이 준다. K-4(단일 진입점)와도 일치 | — |
| R8 | manifest `shortcuts`를 프리셋별로 | **보류** | 매니페스트는 정적이고 무인증 요청 가능(프리셋 이름 노출). 플랫폼에 따라 홈 화면 추가 시점에 고정 | P0-08 검증 결과 갱신이 확인되면 |
| R9 | 알림을 HA에 위임 | **기각** | 공개 전제에서 HA 없는 사용자가 알림을 못 받는다. stash `push.ts` 이식 비용이 낮아 "구현이 크게 준다"는 전제도 약함 | — |
| R10 | `Event.petId`를 nullable로 (공용 이벤트) | **기각** | 모든 쿼리·인덱스·가구 격리 검사가 분기로 오염된다. 아직 존재하지 않는 시나리오를 위한 비용 | Phase 4, 실제로 2마리 이상이 된 뒤의 사용 로그 |
| R11 | 좌표를 이벤트에 직접 저장 (garage 방식) | **기각** | 동물병원은 단골이 있고 재방문한다. `Contact`에 붙여야 방문 이력·병원별 비용이 쿼리된다 | — |
| R12 | 병원을 `payload.vetContactId`로 (원 스펙) | **기각** | 쿼리 대상은 `payload`에 넣지 않는다는 자기 규칙 위반 → `Event.contactId` 컬럼 | — |
| R13 | 복약 잔여 수량을 카운터 컬럼으로 | **기각** | 소프트삭제·오기록 정정 후 반드시 어긋난다. `totalDoses` − 연결 이벤트 수로 유도 | — |
| R14 | garage `Reminder`/`ConsumablePart`로 복약 관리 | **기각** | "N km 또는 N개월마다" vs "하루 N회 × M일". 성격이 달라 같은 엔진에 넣으면 둘 다 나빠진다 | — |
| R15 | 초대 링크 방식 가족 초대 | **기각** | URL에 비밀을 싣지 않는다 (K-6). stash 패턴(관리자 생성 + 임시 비밀번호 1회 노출) 채택 | — |
| R16 | 홈을 타일 그리드 전용으로 (원 스펙 §5.1) | **기각** | 실사용 일지 분석 결과 타일 1탭으로 담기는 기록이 거의 없음 → 타임라인 + 하단 입력 바 | — |
| R17 | `EventType.isQuickAction` 플래그 | **삭제** | 다묘에서 "A 사료"와 "B 사료"를 구분 못 한다. `Preset`이 대체 | — |
| R18 | 미등록 코드 스캔 시 자동 생성 (stash 방식) | **기각** | 잘못 찍었을 때 유령 프리셋이 생긴다 | — |
| R19 | `PresetCode.value` 전역 유니크 (stash 방식) | **기각** | 두 가구가 같은 제품 바코드를 쓴다 → `@@unique([householdId, value])` | — |
| R20 | 자동 입력(웹훅·토큰)을 Phase 2에 | **변경 → Phase 1** | Phase 1에 자동 입력이 0이면 게이트가 "수동 입력만으로 버티는가"만 묻게 되어, 실패 시 원인 구분이 안 된다 | — |
| R21 | i18n(en)을 Phase 4에 | **변경 → Phase 1** | stash가 755줄을 소급 번역해야 했다. 키를 만들 때 en을 같이 쓰는 비용은 거의 0 | — |
| R22 | JWT 수명 7일 (stash 값) | **변경 → 30일** | 게이트 2주 중 최소 1회 재로그인이 발생해 판정을 오염시킨다. `tokenVersion`으로 즉시 무효화가 가능한 것이 근거 | — |
| R23 | 커뮤니티 은어를 `EventType.aliases` 시드에 포함 ("감자"=소변 등) | **기각** | 특정 집단의 말이라 개를 키우는 가구에서 오탐을 낸다. 공개 기본값은 누구에게나 통하는 일반어만(§7.2). Phase 2 설정 화면에서 **"추가할 만한 별칭" 후보로 제시**하고 사용자가 고르게 한다 | — |
| R24 | 시드 프리셋 `label`에 한글 리터럴 저장 | **기각** | en 로케일 사용자가 첫 실행부터 한글 칩을 본다 (K-9 위반). 시드는 i18n 키, 사용자 수정분만 리터럴 | — |
| R25 | 시스템 `EventType` 시드를 Prisma `upsert`로 | **기각** | 복합 unique에 NULL이 끼면 `where`를 만들 수 없어 실행 불가. 게다가 NULL은 UNIQUE에서 구별되는 값이라 중복이 막히지도 않는다 → 부분 유니크 인덱스 + `findFirst`/`create` | — |
| R26 | 텍스트 입력 → 제안 칩 **탭해야 저장** | **기각** | K-12·K-13: 입력이 사라지면 안 된다. **즉시 저장** 후 검토 칩(P1-22, PR #10 리뷰) | — |
| R27 | `registrationNo` 15자리 한국 동물등록번호 형식 검증 | **기각** | 공개·ko/en 배포 — 비한국 사용자도 자국 번호를 쓴다. Phase 1은 자유 텍스트(max 50) | Phase 2+ 로케일별 형식 힌트가 필요해질 때 |
| R28 | 가구별 별칭을 `EventType` 행 통째 복제 | **기각** | `seedSystemEventTypes`가 시스템 행만 갱신 → 복제본은 시드 개선을 영원히 못 받음. `EventTypeAlias` 테이블로 별칭만 저장 | — |
| R29 | 소프트삭제 + 전체 유니크 제약만 두기 | **기각** | 보관 후 재생성 P2002·500 반복(dedupeKey·Preset). **부분 유니크**(`archivedAt IS NULL`) 또는 **보관 행 복원** 필수 | — |
| R30 | `GET /api/auth/users`·삭제·비밀번호 재설정에 `householdId` 필터 추가 | **기각** | §7.12가 "인스턴스 전체 사용자 반환, ADMIN이 임의 사용자 관리"를 이미 확정했다. 필터를 넣으면 SEPARATE 계정 관리가 불가능해진다. 실제 구멍은 **가구 밖 ADMIN에 대한 권한 상승**뿐이라 그 경우만 403으로 막았다 | 다중 가구를 1급으로 올릴 때 §7.12부터 다시 연다 |
| R31 | 백업 아카이브에 `Pet`·`Event`·`Preset`을 넣어 "전체 백업"으로 확장 | **보류** | 일지 전체를 JSON으로 왕복시키면 스키마가 바뀔 때마다 마이그레이션 대상이 하나 더 생긴다. `pg_dump` + 볼륨 스냅샷이 이미 그 일을 정확히 한다 — 대신 **문서와 UI가 백업 범위를 오해시키지 않게** 고쳤다 | Phase 3 백업 자동화 |
| R32 | npm audit에 `--omit=optional`을 붙여 prisma를 감사 대상에서 제외 | **기각** | prisma는 `devOptional`이고 `docker-compose.prod.yml`이 기동 때 `prisma migrate deploy`를 돌린다 — **실제로 프로덕션 이미지에 들어간다.** 감사에서 숨기는 대신 `overrides`로 패치 버전을 고정한다 | — |
| R33 | 청크 업로드 세션을 DB 테이블로 이전 | **보류** | 마이그레이션이 하나 늘고, 세션은 24h TTL의 임시 상태라 영속 저장 대상이 아니다. 재시작 시 무효화는 클라이언트가 새 세션으로 재시작해 흡수한다. 실제 버그였던 **동시 쓰기 경합만** 프로세스 내 잠금으로 막았다 | API를 다중 레플리카로 돌릴 때 |
| R34 | Caddy에 HSTS·CSP 추가 | **보류** | HSTS는 기본 설치가 평문 http(LAN)라 켜면 접속이 막힌다 — HTTPS 프록시를 앞에 둘 때 거기서 켠다. CSP는 Next 인라인 부트스트랩 + `layout.tsx` 테마 스크립트 때문에 nonce 배선이 선행돼야 한다 | 공개 도메인 배포 가이드를 쓸 때 |


---

## 2. 세션 로그

### 2026-09-02 — 리뷰 후속 2: 공용 기기·CORS·보안 헤더

앞 커밋에서 남긴 미처리 항목 5건. 대부분 "셀프호스트 단일 인스턴스" 전제가 실제 운영과
어긋나는 자리들이었다.

**한 일**

- **로그아웃 시 서비스워커 캐시 삭제** — `sw.js`가 `/api/` 아닌 성공 응답을 전부 캐시하는데 여기엔 로그인 상태의 Next RSC 페이로드(반려동물·기록)가 들어간다. 기기 공유가 이 앱의 기본 시나리오(§7.12)라 다음 사용자가 이전 화면을 보면 안 된다. `clearAppCaches()` (`appCache.test.ts`)
- **프로덕션 CORS를 `APP_PUBLIC_URL` 오리진으로 좁힘** — `origin: true`는 로컬 dev(3000/3001 → 8080/8081)를 위한 값인데 프로덕션에도 그대로 적용되고 있었다. dev는 그대로 반사, 프로덕션만 허용목록. **Origin 헤더가 없는 요청은 통과** — ApiToken 연동(curl·HA·단축어)이 여기 걸리면 안 된다. 호스트가 여럿이면 `CORS_EXTRA_ORIGINS`
- **Caddy 보안 헤더** — `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `-Server`. **HSTS는 넣지 않았다** — 기본 설치가 평문 http(LAN)라 켜면 접속이 막힌다. **CSP도 보류** — Next의 인라인 부트스트랩 스크립트와 `layout.tsx`의 테마 초기화 스크립트 때문에 nonce 배선이 필요하다
- **청크 업로드 동시 쓰기 잠금** — "인덱스 확인 → `appendFile` → 카운터 증가"가 await로 쪼개져 있어 같은 인덱스의 동시 요청 둘이 모두 통과하면 파일이 깨진다. 세션당 쓰기 잠금, 경합 시 409. 세션을 DB로 옮기지는 않았다(R33)
- **`PATCH /profile` 이메일 변경에 현재 비밀번호 요구** — 이메일은 로그인 식별자인데 비밀번호 변경만 확인을 요구하고 있었다. 탈취된 세션이 계정을 조용히 넘겨받는 경로. 현재 설정 화면은 비밀번호만 바꾸므로 UI 영향 없음

**다음**

- **`@zxing/browser`·`@zxing/library`가 미사용이다.** `apps/web`에서 카메라(`getUserMedia`)를 쓰는 코드가 하나도 없고, `lib/scanQueue.ts`가 참조하는 `scan/page.tsx`는 §557대로 이미 삭제됐다 — `scanQueue.ts`·`scanQueue.test.ts`·`scripts/measure-zxing-chunks.cjs`·루트 `playwright-core`까지 죽은 코드. Phase 2 스캐너 복원 계획과 함께 판단할 것이라 이번엔 손대지 않았다
- **오프라인 큐가 사용자 단위가 아니다.** 로그아웃해도 IndexedDB에 남고, 다음 사용자가 로그인하면 **이전 사용자의 미전송 기록이 그 사람 가구로 들어간다.** 큐 항목에 `userId`를 달아 본인 것만 flush하면 데이터 손실 없이 해결된다 — 공용 태블릿 시나리오라 우선순위가 낮지 않다
- Phase 1 게이트 — 2주 실사용

### 2026-09-02 — 전체 리뷰 후속: 관리자 권한·백업·미디어 인증

전체 코드 리뷰에서 나온 지적을 순서대로 처리했다. 대부분 **stash 섀시에서 그대로 넘어온 관리자·백업 경로**에 몰려 있었고, 도메인 라우트(K-1·K-4·K-9)는 문제가 없었다.

**한 일**

- **가구 밖 ADMIN 권한 상승 차단** — ADMIN이 여럿일 때 다른 가구의 ADMIN을 삭제·비밀번호 재설정하면 그 가구를 통째로 탈취할 수 있었다. §7.12(인스턴스 전역 관리)는 유지하고 **대상이 ADMIN이면서 요청자 가구 밖일 때만** 403. 같은 가구 ADMIN끼리는 이미 상호 접근이 있으므로 그대로 (`adminUserRoutes.test.ts`)
- **백업 범위 오해 제거** — `deploy.md`가 `migrate reset` 전에 `/backup`으로 보내라고 안내했지만 아카이브에 일지가 없다. 그대로 따르면 **일지 전체 유실.** `pg_dump` + uploads 볼륨 스냅샷 명령으로 교체하고, `/backup` 화면·`api.md`에도 범위 경고를 넣었다
- **복원이 가구를 끊던 문제** — `tx.user.deleteMany()`가 `HouseholdMember`를 캐스케이드로 지워, 복원 직후 전원이 `householdId=null`로 떨어지고 기존 Household·Pet·Event가 고아가 됐다. `households`·`householdMembers`를 아카이브에 담아 같은 트랜잭션에서 되돌린다. **Household 자체는 절대 삭제하지 않는다** — Pet·Event가 캐스케이드로 날아간다
- **VAPID 키를 백업에서 제외** (§8 결정 이행) — 아카이브에 푸시 개인키가 평문으로 실리고 있었다. 내보내기에서 빼고, 복원이 서버의 기존 키를 지우지도 않게 했다
- **미디어 쿠키의 tokenVersion 우회 차단** — `purpose:"media"` 토큰에 `tv` 검사가 없어 `/logout-all`·비밀번호 변경 후에도 다른 기기에서 최대 24h 사진을 볼 수 있었다. 발급 시 `tv`를 심고 검증한다 (`mediaAuth.test.ts`)
- **`MEDIA_AUTH_DISABLED`** — 경고만 찍고 기동하던 것을 `JWT_SECRET`과 같은 강도로: 프로덕션이면 기동 실패
- **CI audit 복구** — mysql2 GHSA-3f6p-5ww8-9rcr로 lint job이 깨질 상태였다. `overrides`로 패치 버전 고정 (R32)
- **계획에 없던 의존성 제거** — WORKPLAN §5.0/§72가 "지금 가져오지 않는다"고 못박은 `pdfkit`·`qrcode`·`bwip-js`와 `NotoSansKR-Regular.ttf`(2.8MB), 미사용 `dotenv`

**주의**

- 배포 직후 기존 미디어 쿠키(tv 없음)는 전부 무효다. `/api/auth/me`가 마운트 때 새 쿠키를 심으므로 첫 로드 한 번만 사진이 늦게 뜰 수 있다
- 복원 시 VAPID 키는 서버 값이 유지된다 — 새 서버로 옮기면 관리자 설정에서 재발급이 필요하다

**다음**

- 리뷰에서 남긴 미처리 항목: 서비스워커 캐시가 로그아웃 때 안 지워짐(공용 기기), CORS `origin: true`, Caddy 보안 헤더 부재, 청크 업로드 세션 인메모리, `PATCH /profile`이 비밀번호 확인 없이 이메일 변경
- Phase 1 게이트 — 2주 실사용

### 2026-09-01 — 문서 `docs/` 통합

**한 일**

- `PROJECT.md` · `WORKPLAN.md` → `docs/`로 이동, 교차 링크·`CLAUDE.md`·README 갱신
- `docs/README.md` 문서 목차 추가

**다음**

- Phase 1 게이트 — 2주 실사용

### 2026-09-01 — 청크 업로드·관찰 타입·문서

**한 일**

- **청크 업로드** (drop 이식): API `POST/PUT/GET/DELETE /api/attachments/uploads/*`, 웹 `chunkedUpload.ts`·이어 올리기
- **관찰** (`observation`): `energy` 시드 마이그레이션, 상세 시트(태그·활력·메모), 태그 칩 UI 통일
- 문서: `docs/api.md` 첨부·청크, `docs/deploy.md` §7.1 데이터 마이그레이션·`FILE_SIZE_LIMIT_MB`, `seed-event-types.md` 현행화

**다음**

- Phase 1 게이트 — 2주 실사용
- 배포: `docker compose up --build` 후 기존 DB면 `seed`로 `energy`→`observation` 확인

### 2026-09-01 — 문서 현행화 (v0.1.0 · 배포·마이그레이션)

**한 일**

- 앱 버전 **0.1.0** 통일, Phase 1 구현 완료 상태로 README·WORKPLAN·CLAUDE·PROJECT 헤더 정리
- `docs/deploy.md` — LXC 2GB, `KIBBLE_REF=master` fallback, `update`·prune·롤백, 마이그레이션 스쿼시(§7), `/q`·`/backup` 네비
- README ko/en — `prisma migrate deploy` + seed, UI 네비 설명
- `docs/api.md` — 백업/복원 API
- `docs/seed-event-types.md` — `treat` = 간식·영양, `supplement` 통합
- Proxmox CI (`check-proxmox.sh`, `check-migrations.sh`, backup 통합 테스트) — garage 패턴

**다음**

- Phase 1 게이트 — 2주 실사용
- 게이트 통과 후 릴리스 태그·GHCR publish
- PROJECT §4 스키마 확정판 반영(P0-07) — WORKPLAN과 동기화

### 2026-09-01 — P1-28~33 i18n·배포 문서

**한 일**

- P1-28: LanguageToggle i18n, layout metadata 영문, manifest 정적 영문 (PWA 제약)
- P1-33: `docs/deploy.md` — 게이트 전 §1.1 기본, `KIBBLE_REF=master`, `.env` 셸 치환 금지, prod compose 로그 명령
- `.env.example` GHCR 변수, README 상태·deploy 링크
- P1-29~32: 기존 Docker·workflow·Proxmox·LICENSE·README 확인 후 WORKPLAN 완료 표시

**다음**

- Phase 1 게이트 — 2주 실사용
- 게이트 통과 후 릴리스 태그·GHCR publish

### 2026-09-01 — P1-26 오프라인 큐

**한 일**

- IndexedDB `offlineQueue` — 이벤트 POST 본문 + 첨부 Blob
- 홈·`/q` 칩 — 오프라인/네트워크 실패 시 큐 적재, 온라인 복귀 시 `flushOfflineQueue`
- 4xx 영구 거부·제거 알림, 전송 후 홈 자동 갱신

**다음**

- P1-28 i18n 전수
- P1-29~ 배포

### 2026-09-01 — P1-19 PWA·P1-25 `/q`·P1-27c 대변 스코어

**한 일**

- PWA: manifest shortcut·categories, SW 셸 v3(`/q`·아이콘), 오프라인 페이지 홈 링크, `/q`에서 하단 네비 숨김
- `/q` 빠른 기록 — 프리셋 칩 1탭 POST + 실행취소 토스트, 더보기 시트
- 상세 시트 `FECAL_7` 1~7 칩 (선택 생략 가능, G-3), 타임라인 부가 줄에 `n/7` 표시
- 홈 API: `eventType.scaleType`·프리셋 `eventType` 포함

**다음**

- P1-26 오프라인 큐
- P1-28 i18n 전수
- P1-29~ 배포

### 2026-09-01 — P1-17 소프트삭제 퍼지

**한 일**

- `purgeOldTrash` — `deletedAt` 30일 경과 이벤트 하드삭제 + `Attachment` 파일 디스크 정리
- `Event.deletedAt` 인덱스 (퍼지 쿼리용)

**다음**

- P1-29~ 배포 (게이트 전 실사용)

### 2026-09-01 — P1-27 타임라인 무한 스크롤·삭제/복구

**한 일**

- 홈 타임라인 `IntersectionObserver` + `GET /api/events` 커서 페이지네이션
- 상세 시트 **기록 삭제** + 토스트 실행취소 → `POST /api/events/:id/restore`

**다음**

- P1-17 trashPurge (첨부 디스크 고아 파일)
- P1-29~ 배포

### 2026-09-01 — P1-10 / P1-16 / P1-23 이벤트 첨부

**한 일**

- `POST/DELETE /api/attachments` — 이벤트당 최대 9장, 이미지 sharp JPEG·영상(mp4/mov) 원본 저장
- `GET /api/attachments/file/*` — 미디어 쿠키·Bearer 인증 + **가구 소유권 검사**(타 가구 404, K-3)
- 홈 입력 바·상세 시트 첨부 UI, 텍스트 파싱 저장 시 **첫 이벤트**에 대기 중인 첨부 연결
- 타임라인 첫 썸네일 + 개수 표시

**다음**

- P1-17 trashPurge — 이벤트 하드 삭제 시 디스크 고아 파일 정리 (첨부 cascade는 DB만)
- P1-27 타임라인 무한 스크롤·삭제/복구 UI
- P1-29~ 배포 (게이트 전 실사용)

### 2026-08-31 — Phase 0 계획 수립 (WORKPLAN r1 → r7)

**한 일**

- `stash`(v0.7.5)·`garage`·`drop` 코드베이스 실사 → 재사용 등급표 작성 (WORKPLAN §1.2). Phase 0 체크리스트의 "재사용 모듈 목록화" 완료
- 입력 경로를 NFC → 인쇄 QR → **최종 포트폴리오**로 두 차례 재설계
- 시나리오 11개(S1~S11) × 경로 8개(A~H) 대조 (`docs/scenarios.md`)
- 기존 메신저 일지 실사용 분석 → 실측 패턴 11가지(J1~J11) 도출, WORKPLAN §3.7에 일반화해 반영
- 온보딩·관리 포인트·예상 마찰(F1~F9) 정리, 설계 원칙과 대조
- 초보자 유도 설계 (§3.8) — 점진적 공개 + 표준 척도
- `garage` 지도·내비 스택 분석 → 장소·내비(§3.9), 투약 과정(§3.10) 추가
- P0-07 완료: `PROJECT.md §4` 스키마 확정판 반영
- 저장소 초기화 + 공개(`eigger/kibble`), MIT 라이선스, `CLAUDE.md`, 본 문서 추가

**확정한 것** (전문은 WORKPLAN §7)

- 이식 전략: **섀시는 통째로, 도메인은 새로.** 삭제 → 이름 치환 → 신규 작성 순서. 1단계 끝에 "빈 껍데기가 뜨는가" 체크포인트
- 입력의 축은 `Preset`. 홈 칩 · 빠른 기록 · (향후) 라벨 · 토큰 스코프가 모두 이 한 행의 표면
- 홈 = 타임라인 + 하단 입력 바(채팅형). 퀵 칩 1탭은 평상시 경로로 유지
- 파싱은 규칙 기반 최소판. **원문 보존(K-13) + 실패는 NOTE로 흡수(K-12)**
- 자동 입력은 연동이 아니라 **API 하나**(K-14). `ApiToken` + 토큰 인증 `POST /api/events`
- 처음부터 공개 전제. MIT, en/ko 동시 작성, HA 의존 금지. **릴리스 태그는 게이트 통과 후**
- 구조는 다종·다묘로 열고 UI는 1마리 최적화 (반려동물 탭은 2마리 이상일 때만)
- 초보 유도: 시작 3개 → 더보기, 표준 척도(대변 1~7), 안내는 그 순간에만(K-15), 진단 금지(K-16)
- 규약 K-1 ~ K-16 확정

**알아낸 사실 중 계획을 바꾼 것**

- stash에 **테넌트 격리 코드가 존재하지 않는다** (`household` 등장 파일 5개가 전부 XP 문구). 라우트가 소유권 검사 없이 id로 조회 → 그대로 복사하면 가구 간 유출. K-1~K-3의 근거
- stash 웹은 JWT를 localStorage에 두고 Bearer로만 보낸다 → 서버가 읽을 수 있는 앱 세션 쿠키가 없다. NFC 설계의 전제가 성립하지 않았던 이유
- `garage` 지도 스택(`loadSdk`·`geocode`·`deepLinks`·`NavLaunchButtons`)이 거의 그대로 이식 가능. 단 **상호(키워드) 검색은 없어서 신규**
- 실사용 일지에서 **제공량과 섭취량이 다르고 둘 다 기록**된다 → `quantityOffered` 신설

**미완 / 다음 세션이 이어받을 것**

- Phase 0 잔여 (사람): P0-01(프리셋 빈도 실측), P0-02a(대변 스코어 도판), P0-05(PWA 실기), P0-08(shortcuts 갱신 검증), P0-09(개인 일지 100문장 로컬 픽스처)
- Phase 0 리뷰: [`docs/seed-event-types.md`](seed-event-types.md) 초안 — 확정 후 P0-02 완료 처리
- `README.md` / `README.ko.md` 미작성 (P1-32)
- **Phase 0 사람·리뷰 항목 완료 전에는 애플리케이션 코드를 쓰지 않는다** (§4, PROJECT §9)

### 2026-08-31 — Phase 0 에이전트 산출물 (P0-02·P0-06·P0-09 보조)

**한 일**

- [`docs/seed-event-types.md`](seed-event-types.md): 시스템 EventType 14+2종, 종별 프리셋 템플릿(CAT/DOG/OTHER), `isStarter` 3개, `FECAL_7`, i18n 키표, aliases 제안
- [`docs/package-names.md`](package-names.md): GitHub·npm·GHCR 충돌 조사 → `@kibble/*` 사용 가능, 루트 `private: true`
- [`docs/parsing-benchmark-public.md`](parsing-benchmark-public.md): 공개 합성 파싱 케이스 ~25개 (P0-09 로컬 100문장과 병행)
- `docs/WORKPLAN.md` P0-02/P0-06/P0-09 상태 갱신

**리뷰 필요 (사람)**

1. **P0-02** — 시드 목록·프리셋 7개 구성·aliases가 공개 기본값으로 적절한지
2. **P0-01** — 3일 실측 후 §6 조정 항목(기본 수량·프리셋 수) 반영
3. **P0-02a** — 대변 스코어 1~7 도판 (라이선스 자유)
4. **P0-05 / P0-08** — 실기기 PWA·shortcut 갱신
5. **P0-09** — 개인 일지 100문장 → `fixtures/private/` (`.gitignore` 등재됨)

**다음**: P0-02 리뷰 확정 → Phase 0 잔여 사람 항목 → **P1-01** stash 섀시 import

### 2026-08-31 — PR #1 리뷰 반영 (문서 단계 수정)

에이전트 리뷰 10건 중 문서로 해결 가능한 전부를 반영했다. 코드 이전이므로 문서에서 고쳤다.

**확정한 것**

- **시스템 `EventType`은 부분 유니크 인덱스가 필요하다.** `@@unique([householdId, key])`는 `householdId = null`인 시스템 행에 걸리지 않는다 — PostgreSQL이 UNIQUE에서 NULL을 서로 구별되는 값으로 보기 때문. 시드 재실행 시 조용히 중복된다. 초기 마이그레이션에 `CREATE UNIQUE INDEX ... WHERE "householdId" IS NULL`을 raw SQL로 넣고, 시드는 **`upsert` 대신 `findFirst` → `create`**로 쓴다 (`upsert`는 복합 unique에 NULL이 끼면 `where`를 만들 수 없어 실행 자체가 불가). `PROJECT.md §4`·`seed-event-types.md §1.1`
- **둘째 반려동물 등록 시 프리셋을 중복 생성하지 않는다.** 프리셋은 `petId = null`(가구 전체)이므로 등록마다 삽입하면 "사료"가 두 개가 되고 `isStarter`가 6개가 되어 G-1이 깨진다. 이미 있는 `eventTypeId`는 건너뛰고, **`isStarter`는 첫 등록 때만** 설정한다. `existing` 집합에 `archivedAt` 조건을 걸지 않는다 — 사용자가 숨긴 칩이 되살아나면 안 되기 때문. `seed-event-types.md §4.0`
- **시드 프리셋의 `label`은 i18n 키를 저장한다** (`eventType.meal`). 한글 리터럴을 넣으면 en 사용자가 첫 실행부터 한글 칩을 본다 (K-9 위반). 사용자가 이름을 고치면 리터럴로 바뀌고 그때부터 로케일을 따르지 않는 것이 맞다. 판별은 `eventType.`/`preset.` 접두사. `seed-event-types.md §3.1`
- **파싱 상대 시각 기준값을 한 표로 고정**했다 (아침 08:00 / 저녁 19:00 …). **P1-24의 시각 빠른 버튼도 같은 표를 쓴다** — 두 경로가 다르면 타임라인 정렬이 어긋난다. `parsing-benchmark-public.md`
- **`needsReview`가 true가 되는 조건 4가지를 확정**했다 (타입 후보 복수 / 상대 시각 추정 / 범위 환산 / `note` 흡수). `~정도`·`~인듯` 같은 근사 표현은 그 자체로는 true가 아니다 — 사용자는 원래 그렇게 쓴다(J10). `WORKPLAN §5.6`의 게이트 지표가 측정 가능해졌다
- **범위 수량은 중간값**, 앞자리 생략(`7~80` → `70~80`)은 보정 후 중간값. 규칙 없이 기대값만 있어 테스트가 불가능했던 것을 고쳤다
- **개인 픽스처 경로는 `fixtures/private/` 하나**로 통일했다

**기각한 것** → §1에 R23 추가

**고친 문서 정합성**

- 벤치마크의 `rawLine` → `rawText`로 통일 (`PROJECT.md §4` 필드명). 여러 줄일 때 각 이벤트는 **그 줄만** 담고 `entryId`로 묶는다
- 한국어 문서에 섞인 중국어 표기 2건 정정

### 2026-08-31 — PR #1 머지 + P1-01 섀시 import·도메인 전멸

**한 일**

- PR #1 머지 (`docs/seed-event-types.md`, `package-names.md`, `parsing-benchmark-public.md`)
- stash v0.7.4 섀시 통째 복사 (git history 제외). kibble 문서·LICENSE·`.gitignore` 보존
- §5.0 1단계 도메인 전멸: API 라우트 12개·lib 15개·web 페이지 10개·shared 도메인 모듈 삭제
- 임시 스키마 `User`+`Setting`, `init` 마이그레이션 1개 (stash 마이그레이션 11개 미이식)
- 홈·하단 네비·설정 화면을 빈 껍데기로 축소. 백업/복원은 users+settings만
- `npm run build` · `lint` · `test` 전부 green

**미완 / 다음**

- **P1-03** kibble 도메인 스키마 전면 작성 (`PROJECT.md §4` 확정판)
- Phase 0 사람 항목 병행: P0-02 리뷰, P0-01 실측, P0-02a 도판

### 2026-08-31 — P1-02 이름 치환 완료

**한 일**

- `@stash/*` → `@kibble/*`, localStorage·쿠키·SW 캐시 키 전부 `kibble_*`로 치환
- compose/proxmox: `POSTGRES_*` 기본값 `kibble`, GHCR 이미지 `kibble-api`/`kibble-web`
- proxmox 스크립트 `kibble-install.sh` · `kibble.service` · `ct/kibble.sh`로 교체
- manifest·layout·SW를 kibble 브랜딩으로, `/q` 플레이스홀더 추가
- `.env.example` 추가

**다음**: P1-03 도메인 스키마

### 2026-08-31 — PR #2 리뷰 반영 (11건)

- README en/ko를 kibble 빈 껍데기용으로 전면 교체 (stash 출처 표기만 유지)
- 로그인 `appName` i18n, `translations.ts` 재고 도메인 문자열 제거·셸 키만 유지
- `fetchMe()` `res.ok` 검증 + 잘못된 캐시 제거
- `docker-compose.yml`: `NODE_ENV=development`, `prisma migrate deploy` 추가
- auth: P2002/P2025 처리, `/me` 404→401
- `mediaAuth` Bearer 경로에 tv·purpose 검증
- SW: `response.ok`일 때만 캐시
- settings DELETE `MANAGED_KEYS` 검증
- `*.tsbuildinfo` gitignore + 추적 해제
- `capture-screenshots.mjs` kibble 경로·`kibble_locale`로 수정

### 2026-08-31 — PR #2 스쿼시 머지 + P1-03 스키마 + P1-04 시드 초안

**한 일**

- PR #2 스쿼시 머지 (`chore: import stash chassis with domain wipe and kibble rename`)
- **P1-03**: `PROJECT.md §4` 전체 Prisma 스키마 + `init` 마이그레이션 교체. stash `Setting`·`UserRole`·`tokenVersion` 유지. `EventType_system_key_key` 부분 유니크 raw SQL 추가
- **P1-04 (부분)**: `seedSystemEventTypes` (findFirst→create), 종별 프리셋 템플릿·`ensurePresetsForPet`·단위 테스트, `translations.ts` eventType 키 ko/en

**미완 / 다음**

- **P1-04 완료**: `POST /api/pets`에서 `ensurePresetsForPet` 호출 (P1-11과 함께)
- **P1-05** JWT 30일·householdId 데코레이터
- docker `migrate deploy` 후 `prisma db seed` 스모크 (로컬)

### 2026-08-31 — PR #5 리뷰 11건 반영

**한 일**

- **init 마이그레이션 복원** + `20260831130000_kibble_domain` 신규 추가 (in-place 수정 철회 — P3006 방지)
- `Event.householdId` + `@@unique([householdId, dedupeKey])`, `ApiToken`/`Reminder` FK, `Preset` 유니크 `(householdId, petId, eventTypeId)`
- `ensurePresetsForPet`: petId 스코프, Pet 수로 isStarter, 트랜잭션 + skipDuplicates
- `seedSystemEventTypes`: create + update, P2002 흡수
- `t()` / `translate()` 미지 키 리터럴 폴백
- `docs/seed-event-types.md` §4.0 petId 스코프로 정정

**미완**: PR #5 머지

### 2026-08-31 — P1-05/06 + 온보딩 API (P1-04 완료·P1-07 부분)

**한 일**

- JWT 30일, `resolveJwtSecret` 모듈화 + 프로덕션 약한 시크릿 테스트
- `authenticate` → `request.householdId`, `householdWhere`/`requireHouseholdId` (K-2)
- 부트스트랩 시 가구+"우리 집"+OWNER, 가족 계정 생성 시 MEMBER 멤버십
- `POST/GET /api/pets`, `GET /api/onboarding/status`, `/api/auth/me`에 `needsPet`
- P1-04 완료: `ensurePresetsForPet`를 pets 등록에 연결

**미완 / 다음**

- P1-08 가구 초대·역할 UI / P1-09 가구 격리 테스트
- P1-18 `docs/api.md`, P1-20 타임라인, P1-22 파싱·채팅 입력
- Phase 0 사람 항목 병행

### 2026-09-01 — P1-06a·12·13·21 이벤트 기록 + ApiToken

**한 일**

- `createEvent()` 단일 서비스 (K-4), dedupeKey 멱등
- `POST/GET/PATCH/DELETE /api/events`, `POST /:id/restore`
- ApiToken: `kbl_*` Bearer, `POST/GET/DELETE /api/tokens`, `event:create` 스코프만 이벤트 생성 허용
- 홈 퀵 칩 1탭 → 기록 + 실행취소 토스트 (P1-21)
- shared zod 스키마 (`event`, `apiToken`)

**다음**: P1-09 격리 테스트, P1-18 api.md, P1-20 타임라인 UI

### 2026-09-01 — PR #8 리뷰 반영 (인증·멱등·UX)

**고친 것**

- ApiToken **opt-out 기본**: `config.allowApiToken: true` 없는 라우트는 403 (K-5). `POST /api/events`만 허용
- 토큰 스코프 `petId`/`presetId`/`eventTypeId` — 본문이 다른 값을 보내면 403
- `dedupeKey` — `deletedAt` 무관 조회, 소프트삭제 행은 복구 후 반환 (P2002/500 방지)
- `lastUsedAt` — 이벤트 생성 성공 후에만 갱신 (K-7)
- GET `/api/events` 커서 `before`+`beforeId` 타이브레이크
- `scaleValue` 범위 검증 (FECAL_7 1~7, APPETITE/ENERGY 1~3)
- 웹: `dedupeKey` 전송, 기록 중 전 칩 disabled, undo 토스트 3초 (P1-21)
- `POST /api/events` rate limit 120/min

### 2026-09-01 — P1-09·18·20 타임라인·격리 테스트·API 문서

**한 일**

- `buildApp()` 추출 — `index.ts`는 부트스트랩만, inject 테스트 가능
- P1-09: `householdIsolation.test.ts` — 타 가구 pet/event/preset 404, ApiToken 미허용 라우트 403
- P1-18: `docs/api.md` — curl 예제 (세션·ApiToken·이벤트 CRUD)
- P1-20: `GET /api/home` 확장 (`todaySummary`, `recentEvents`, `pets`, `?petId=`), 홈 UI 타임라인·오늘 요약·하단 칩+입력 바(비활성, P1-22까지)

**다음**: P1-08 가구 초대 UI, P1-22 파싱·채팅 입력, P1-11 펫 CRUD 확장

### 2026-09-01 — P1-09/18/20 리뷰 반영

**고친 것**

- **오늘 요약 일 경계** — UTC → KST(+9) 고정. WORKPLAN §7.11 확정
- **요약 낙관적 갱신** — `POST /api/events` 응답에 `eventType`/`preset` 포함, `eventTypeKey`로 bump/decrement
- **ApiToken CRUD** — `requireHouseholdOwner` (MEMBER/VIEWER 발급 불가). `docs/api.md` 정정
- **loadHome 레이스** — `loadSeq`로 stale 응답 무시
- P1-09 범위 — attachment는 P1-10/P1-16 전 501이라 Phase 1a mock만; 실 DB는 P1-09b로 WORKPLAN 기록
- 기타: `Promise.all` home 쿼리, K-1 주석, quantity 표시 순서, tabpanel a11y, 입력 바 padding CSS 변수

**다음**: P1-22 파싱·채팅 입력

### 2026-09-01 — P1-08/15/22 파싱·텍스트 입력·가구 모드

**확정 (WORKPLAN §7.12)**

- 셀프호스트 "초대" = **관리자 계정 생성**. `householdMode`: **JOIN**(공유 타임라인) vs **SEPARATE**(별도 Household·일지)
- Phase 1 기본은 JOIN(§3.7 메신저 대체). SEPARATE는 같은 물리적 반려동물이라도 데이터 분리 — 사용자 선택

**한 일**

- P1-15: `parseEntry.ts` — 줄 분해, 시각·수량·별칭, NOTE 폴백
- P1-22: `POST /api/parse/entry`, 홈 텍스트 입력 → 제안 칩 → 저장(`rawText`·`entryId` 보존)
- P1-08: `/users`에 JOIN/SEPARATE + MEMBER/VIEWER 선택, API `createUserSchema` 확장

**다음**: P1-11 펫 CRUD, P1-24 상세 시트, P1-27b 빈 화면 안내

### 2026-09-01 — PR #10 리뷰 반영 (파서·저장 UX·SEPARATE 관리)

**확정**

- P1-22 UX: **입력 즉시 저장** 후 검토 칩 — 탭-해야-저장은 K-12·K-13과 어긋나 **기각** (WORKPLAN P1-22·§7.12 갱신)
- P1-15 완료 조건: `docs/parsing-benchmark-public.md` 케이스 **단위 테스트 100%** (`parseEntry.benchmark.test.ts`)
- §7.12: ADMIN **인스턴스 전체 사용자** GET·DELETE·reset-password (SEPARATE 포함). `inSharedHousehold` 배지

**한 일**

- 파서: KST `kstDateTime`·한글 단위 정규식·범위 환산·제공/섭취·상대 시각·needsReview 4조건
- 홈: `rawText=rawLine`, `dedupeKey=${entryId}:${lineIndex}`, 저장 실패 재시도, `lineIndex` key
- `parse.ts`: `hiddenAt: null` 프리셋만, `quantityOffered`·`lineIndex` 응답

**다음**: PR #10 push·재리뷰, P1-24 상세 시트(칩 탭 → 수정)

### 2026-09-01 — PR #10 머지 + P1-27b 빈 화면·저널 안내

**한 일**

- PR #10 스쿼시 머지 (`0d478ba`)
- P1-27b: `journalStats` API, 흐릿한 예시 타임라인, 1건/3일 안내 문구

**다음**: P1-11 펫 CRUD, P1-24 상세 시트

### 2026-09-01 — P1-27b 리뷰 반영 (journalStats)

**한 일**

- distinct day: `$queryRaw` + `LIMIT 4` (전체 이벤트 스캔 제거)
- `kstClock`·`journalInsight` → `@kibble/shared` (웹 `kstDay.ts` 삭제)
- 낙관적 갱신: 최신 KST 날짜가 바뀔 때만 +1; StrictMode 안전(ref + 분리 setState)
- 3일 마일스톤: `distinctDayCount === 3`일 때만
- `journalInsight.test.ts` 8케이스

**다음**: P1-27b PR push, P1-11 펫 CRUD

### 2026-09-01 — P1-11 반려동물 CRUD·사진·편집 UI

**한 일**

- API: GET/PATCH/DELETE(archive), 사진 POST/GET/DELETE (`sharp` webp)
- `/pets` 목록·추가, `/pets/[id]` 12필드 편집, 설정 → 반려동물 관리 링크
- `updatePetSchema` + 단위 테스트

### 2026-09-01 — P1-11 PR #12 리뷰 반영

**한 일**

- K-1: PATCH/DELETE/사진 POST·DELETE를 `updateMany` + `householdWhere`로 통일 (`events.ts` 패턴)
- 사진 GET: `stat()` 선행 확인 → 파일 없을 때 404 (스트림 ENOENT catch 제거)
- `sharp` 실패 → 400 (`InvalidPetPhotoError`), mimetype 검사 제거
- `birthDate`/`adoptionDate`: 스키마에서 무효 날짜 400, 조용한 null 저장 제거
- `registrationNo`: 15자리 한국 형식 검증 **기각** — 공개·다국어 앱이므로 자유 텍스트(max 50)
- `sortOrder` `_max`: 보관 펫 포함 전체 가구 기준
- 사진 GET: `Cache-Control: private, max-age=3600`
- `petPhotoAbsolutePath`: `path.resolve` + UPLOAD_DIR 접두 검증
- `householdIsolation.test.ts` 펫 라우트 4케이스 추가

**다음**: P1-14 프리셋 CRUD

### 2026-09-01 — P1-24 상세 시트

**한 일**

- `@kibble/shared/quickTime` — 방금·1시간 전·어제 저녁(KST 19:00, 파서와 동일)
- `EventDetailSheet`: 시각 빠른 버튼, 제공량/섭취량, 메모, datetime-local
- 홈: 칩 탭=1탭 기록 유지, **길게 누르기**=상세 시트 / 검토 칩·타임라인 탭=PATCH

### 2026-09-01 — P1-24 PR 리뷰 반영

**한 일**

- `PresetChip`: onClick 탭 경로 복원(키보드·스크린리더), 포인터는 롱프레스만
- `datetime-local` KST 벽시계 + 빈/무효 시각·수량 검증
- create 저장 후에도 `removeParseSuggestionByKey`; `applyCreatedEvent` id 중복 방지
- 편집 후 `loadHome`으로 오늘 요약·타임라인 재동기화
- §7.11에 웹 시각 입력·표시 KST 고정 한 줄 추가

### 2026-09-01 — P1-14 프리셋 CRUD·숨기기·별칭

**한 일**

- API: preset POST/PATCH/DELETE·`includeHidden` GET; `PATCH /api/event-types/:key/aliases` (가구 오버레이)
- `parse.ts`: 가구별 aliases 병합
- 홈: 칩 길게 누르기 → 시간·양 / 숨기기 메뉴 (P1-24 상세 시트 유지)
- `/presets` 관리 UI: 이름·순서·숨김 복구·별칭 편집

**다음**: P1-16 다중 첨부 또는 P1-27 타임라인 무한 스크롤

### 2026-09-01 — P1-14 PR 리뷰 반영

**한 일**

- `EventTypeAlias` 테이블 — 별칭만 가구별 저장, 시스템 EventType 복제 제거
- Preset 부분 유니크(`archivedAt IS NULL`) + POST 시 보관 행 복원(restoreOrReturnDedupe 패턴)
- 격리 테스트: DELETE preset, PATCH aliases 추가
- 칩 숨기기 실행취소 토스트

**규칙(R29)**: 소프트삭제 + 유니크 충돌은 **부분 유니크 인덱스** 또는 **보관 행 복원** 중 하나로 통일. EventType 시스템 행과 동일 패턴.

**다음**: P1-16 다중 첨부 또는 P1-27 타임라인 무한 스크롤
