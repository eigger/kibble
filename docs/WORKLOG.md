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

**결정이 바뀌면 `WORKPLAN.md`를 먼저 고치고, 그 다음 여기에 기록한다.** 계획서가 단일 진실 원천이고 이 문서는 이력이다.

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

---

## 2. 세션 로그

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
- `WORKPLAN.md` P0-02/P0-06/P0-09 상태 갱신

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
