# kibble 작업 계획서

- 작성일: 2026-08-31
- 대상 문서: `PROJECT.md` (스펙) — 이 문서는 그 스펙을 **실행 단위로 분해하고 방향을 확정한 것**이다.
- 근거: `stash`(v0.7.5) · `garage` · `drop` 코드 실사 + [`scenarios.md`](scenarios.md) + 기존 메신저 일지 실사용 분석(§3.7)
- **참조 저장소**: `eigger/stash`(섀시 전체) · `eigger/garage`(지도·내비·주기관리) · `eigger/drop`(Share Target). 로컬 클론이 없는 기기에서는 GitHub에서 직접 읽는다 — 방법은 [`../CLAUDE.md`](../CLAUDE.md)
- 현재 상태: **Phase 1 구현 완료** — 실사용 게이트 진행 중 (앱 버전 **0.1.0**).

> **개정 이력**
> - r1: stash 실사 + WBS 초안
> - r2: 1급 입력 경로를 NFC → 인쇄 QR 라벨로 교체
> - r3: stash 통째 이식 전략 확정 (§5.0)
> - r4: 미결 항목 확정 (§7)
> - r5: 시나리오 검증 반영. 인쇄 QR을 1급에서 **보류**로. 근거는 [`scenarios.md`](scenarios.md)
> - **r6 (현재): 실기록 분석 + 초보자 유도 반영.** ① 자동 입력(`ApiToken` + 토큰 인증 `POST /api/events`)을 **Phase 1로** — 연동이 아니라 API를 연다 (§3.6). ② 홈을 **타임라인 + 하단 입력 바(채팅형)**로 뒤집고 자유 텍스트·다중 사진·파싱을 Phase 1에 (§3.7). ③ **초보자 유도와 점진적 공개** 추가 — 시작 3개, 표준 척도, 그 순간의 안내 (§3.8)
> - **r7 (현재): garage 실사 반영.** ④ **장소·지도·내비**(병원을 기록하고 다시 내비로 찍기) — garage 스택 이식 + 상호 검색 신규 (§3.9). ⑤ **투약 과정 추적**(처방 수량 · 매일 복약 체크) (§3.10). ⑥ 다중 기기 작업을 위한 [`../CLAUDE.md`](../CLAUDE.md) 추가

---

## 0. 요약

1. **입력의 축은 "프리셋"이다.** 프리셋 = (반려동물 + 이벤트 타입 + 기본 수량). 홈 타일이자 빠른 기록 항목이자 (나중에) 라벨·웹훅 스코프다.
2. **인쇄 QR은 만들지 않는다 (보류).** 시나리오 11개를 대조한 결과 **QR이 1순위인 경우가 하나도 없었다.** 인쇄 QR은 타일과 정확히 같은 일을 하면서 더 느리다. 살아남는 것은 **제품 바코드**(어느 약·어느 사료인지를 타일로는 표현할 수 없다)뿐이고, 그건 Phase 2다.
3. **진짜 경쟁자는 "앱을 여는 것" 자체다.** 마찰 최저는 사람이 개입하지 않는 경로이고, 그건 **토큰 인증되는 REST API 하나**로 전부 열린다 (§3.6).
4. **자동 입력을 Phase 1에 넣는다.** `ApiToken` + `POST /api/events`의 토큰 인증. 특정 연동(HA·iOS 단축어)을 만드는 게 아니라 **아무거나 붙일 수 있는 API를 여는 것**이다. 이래야 게이트가 설계 전체를 측정한다.
4. **stash를 통째로 들고오되, 첫 작업은 도메인 전멸이다.** 삭제 60% / 유지 30% / 변형 10%.
5. **처음부터 공개 전제.** MIT, en/ko 이중 README, en 사전을 Phase 1부터. HA 의존 금지. **릴리스 발행은 게이트 통과 후.**
6. **구조는 다종·다묘로 열고 UI는 1마리에 최적화한다.**
7. 남은 최대 리스크는 **가구 격리**다 (§2).

---

## 1. stash 코드베이스 실사 결과

> `PROJECT.md` Phase 0의 "stash 재사용 모듈 목록화"에 대한 산출물.

### 1.1 스택 기준선

| 항목 | stash v0.7.5 | kibble |
|---|---|---|
| Node / TypeScript | 24 / ^7.0.2 | 동일 |
| Fastify | ^5.12.1 + cookie / cors / jwt / multipart / rate-limit | 동일 |
| Prisma / PostgreSQL | ^7.9.1 + `@prisma/adapter-pg` / 16-alpine | 동일 (**신규 인스턴스**) |
| Next.js / React | ^16.3.2 / ^19.2.8 (App Router) | 동일 |
| zod / sharp | ^3.23.8 / ^0.35.3 | 동일 |
| 크론 | node-cron ^4.6.0 | 동일 |
| 푸시 | web-push ^3.6.7 | **Phase 3** (§7.3) |
| 스캐너 | `@zxing/browser` + `@zxing/library` | **Phase 2** — Phase 1에서 제외 |
| 코드 렌더 / 라벨 PDF | `qrcode`, `bwip-js` / `pdfkit` + NotoSansKR | **Phase 2 이후** — Phase 1에서 제외 |
| 테스트 | vitest ^4.1.11 | 동일 |

> **Phase 1 번들에서 `@zxing`를 뺀 것이 실질 이득이다.** 앱 로딩 속도가 곧 입력 마찰이고(F8), stash도 `barcodeScanner.ts`에서 동적 import 규칙으로 이걸 관리해야 했다. Phase 2에서 스캐너를 넣을 때 그 규칙과 `barcodeScanner.test.ts`를 함께 가져온다.

### 1.2 재사용 등급표

#### A등급 — 거의 그대로 복사

| stash 경로 | 내용 |
|---|---|
| `package.json`(workspaces, overrides), tsconfig / eslint / vitest | 모노레포 골격 |
| `docker-compose*.yml`, `Caddyfile`, `apps/*/Dockerfile` | 배포 스택 |
| `apps/web/docker-entrypoint.sh` | `/__BASE_PATH__` 런타임 치환 + pristine 백업 |
| `proxmox/ct/*.sh`, `proxmox/install/*` | community-scripts `build.func` 가로채기 + 릴리스 태그 해석 설치 |
| `.github/workflows/ci.yml`, `docker-release.yml` | 4잡 CI / GHCR 멀티아키 |
| `apps/api/prisma.config.ts` | Prisma 7 `datasource.url = env("DATABASE_URL")` |
| `apps/api/src/lib/prisma.ts`, `settings.ts`, `prismaErrors.ts` | **Setting(DB) → env 폴백** — `APP_PUBLIC_URL` 처리의 핵심 |
| `apps/api/src/lib/uploads.ts`, `imageProcessing.ts` | `UPLOAD_DIR`, sharp `.rotate()` + 1600px + JPEG q82 |
| `apps/web/lib/toast-context.tsx` | 액션 토스트 6초 / 일반 2.5초 — **실행취소에 그대로 맞는다** |
| `apps/web/lib/base-path.ts`, `theme-context.tsx`, `download.ts`, `media.ts` | 유틸 |
| `apps/api/src/lib/i18n.ts` + `packages/shared/src/i18n/*` + `apps/web/lib/i18n/translations.ts` | API 에러 사전 / 로케일 파서 / UI 사전 + `X-Locale` 규약 |
| `README.md` + `README.ko.md` 구조, `LICENSE` | 배지 + 상호 링크, MIT |
| **Phase 2 이후**: `qrLabel.ts`, `labelSheet.ts`, `NotoSansKR-Regular.ttf`, `barcodeScanner.ts`, `beep.ts`, `TorchButton.tsx`, `push.ts` | 지금 가져오지 않는다 |

**garage에서 (전부 Phase 2 — §3.9)**

| garage 경로 | 내용 |
|---|---|
| `apps/api/src/routes/mapProviders.ts` | Setting 기반 프로바이더 노출. **키가 없으면 기능이 숨는다** |
| `apps/web/lib/maps/loadSdk.ts` | SDK 동적 로드 + 진행 중 Promise 공유(중복 로드 버그 수정본) |
| `apps/web/lib/maps/geocode.ts` | 지오코딩 / 역지오코딩, kakao → naver 폴백 |
| `apps/web/lib/maps/useMapProviders.ts`, `types.ts`, `darkMode.ts` | 설정 훅·타입·다크모드 |
| `apps/web/lib/navigation/deepLinks.ts` | 카카오·네이버·T맵 내비 딥링크 + 웹 폴백 |
| `apps/web/components/NavLaunchButtons.tsx` | 내비 실행 버튼 (compact 변형 포함) |
| `apps/web/components/maps/LastLocationMap.tsx` | 단일 지점 지도. 경로용 `*TripMap` 4종은 불필요 |
| `apps/web/app/integrations/page.tsx` | 외부 API 키 입력 UI 패턴 (가입 링크 동봉) |

#### B등급 — 구조 재사용, 로직 수정

| stash 경로 | 재사용 지점 | 손볼 것 |
|---|---|---|
| `routes/auth.ts` | bootstrap-admin, bcrypt(10), 로그인 rate limit(15분 10회), `/logout` vs `/logout-all`, 비밀번호 재설정(임시값 1회 응답) | **가구 자동 생성**(§3.3). **JWT 수명 7일 → 30일**(§7.6) |
| `lib/tokenVersion.ts` | `tv` 클레임 + 60초 캐시로 토큰 즉시 무효화 | 가구 탈퇴 시에도 bump. **30일 수명의 근거가 이것이다** |
| `lib/mediaAuth.ts` | `purpose:"media"` httpOnly 쿠키, `path` 스코프, `COOKIE_SECURE` | 그대로 |
| `src/index.ts` | `resolveJwtSecret()`(약한 시크릿이면 프로덕션 기동 중단), req 로그 쿼리 마스킹, `rateLimit{global:false}` | 그대로 |
| `routes/attachments.ts` | MIME 화이트리스트, `path.basename()` 경로탐색 차단, `nosniff`, PDF 강제 다운로드 | 소유권 검사를 `event.pet.householdId`로 |
| `lib/scanQueue.ts` | 오프라인 큐. **고유 id로만 제거**, `ApiError.status`로 4xx만 영구 거부 | localStorage → **IndexedDB 승격** |
| `public/sw.js` | 셸 프리캐시(뒤 슬래시 필수 — `addAll`은 308을 저장 못 해 목록 전체 실패), API GET 화이트리스트 캐시, push/notificationclick | Phase 2에서 drop의 `share_target` 가로채기 병합 |
| `app/manifest.ts` | `shortcuts` | **"빠른 기록" 1개**로 (§3.1) |
| `jobs/trashPurge.ts` | node-cron 골격 | `Event.deletedAt` 퍼지 |
| **Phase 2**: `app/scan/page.tsx` | 연속 스캔 루프, 프레임 쿨다운 3초, 진동+비프, 토치 | 제품 바코드용으로 |
| **Phase 2**: `lib/webhook.ts` | HMAC-SHA256 `sha256=hex(ts.body)`, 3회 백오프 `[0,1s,4s]`, 4xx 비재시도 | **아웃바운드 → 인바운드** 재설계 |

#### C등급 — 참고만, 재설계

| 대상 | stash 구현 | kibble에서 달라야 하는 이유 |
|---|---|---|
| `Barcode.value @unique` (전역) | 마이그레이션으로 전역 유니크를 건 이력 | **다중 테넌트에서 틀렸다.** 두 가구가 같은 사료 EAN을 쓴다 → `@@unique([householdId, value])` |
| `publicBarcodeRoutes` (`label.png`) | 무인증 공개 라우트 | 인증 뒤에 둔다 |
| `POST /api/items/scan` 자동 생성 | 미등록 바코드 → 아이템 자동 생성 | 자동 생성 금지 (Phase 2) |
| `insights.ts`, `xp.ts`, `householdXp.ts` | 재고 지표 / 게임화 | 로직 재사용 불가. 순수 함수 + 테스트 분리 구조만 참고 |

#### D등급 — 전부 신규

`Household`/`HouseholdMember` 다중 테넌시, `Preset`/`PresetCode`, `createEvent()`, 온보딩 흐름, 빠른 기록 화면, 오늘 요약, `ApiToken`(P2), 행위 중복 경고(P2), 리마인더 엔진(P3).

---

## 2. 최대 갭: 단일 테넌트 → 가구 다중 테넌트

stash 전 코드에서 `household`가 나오는 파일은 5개뿐이며 전부 XP 문구이거나 감사 세션 주석이다. **테넌트 격리 코드는 존재하지 않는다.** stash 라우트는 `prisma.item.findUnique({ where: { id } })`처럼 소유권 검사 없이 조회한다 — 단일 가정용이라 그래도 됐다.

kibble이 이 패턴을 복사하면 **가구 간 데이터 유출이 된다.** 공개 전제(§7.2)라 남의 가구가 실재하게 되므로 위험이 실제화된다.

- **K-1**: 모든 리소스 조회는 `householdId` 조건을 `where`에 포함한다. 예외 없음.
- **K-2**: `authenticate` 훅이 `request.householdId`를 결정해 데코레이트한다. 라우트가 직접 읽지 않는다.
- **K-3**: 가구 격리는 Phase 1에서 **테스트로 고정한다** (타 가구 리소스 접근 시 404).

---

## 3. 입력 경로 포트폴리오

> 전면 근거: [`scenarios.md`](scenarios.md). 시나리오 11개(S1~S11) × 경로 8개(A~H)를 대조했다.

### 3.1 경로 순위와 Phase 배치

마찰을 **잠금해제 이후 동작 수**로 정직하게 매기면:

| 순위 | 경로 | 동작 수 | Phase | 담당 시나리오 |
|---|---|---|---|---|
| 1 | **기기·센서 자동 기록** (API 호출) | **0** — 사람이 없다 | **1** (API) | S11 급식기, S3 화장실 센서, S7 체중계 |
| 2 | **물리 버튼** (API 호출) | **0** — 손이 이미 거기 있다 | **1** (API) | S1 급여, S3 배변 |
| 3 | **음성·위젯·Back Tap** (API 호출) | 1 — 앱을 열지 않는다 | **1** (API) | S3 (손이 더러울 때 음성이 최적) |
| 4 | **"빠른 기록" shortcut → 초경량 그리드** | 롱프레스 + 2탭, 앱 셸 로딩 없음 | **1** | S1·S2·S5 |
| 5 | **홈 타일 1탭** | 앱 열기 + 1탭 | **1** | 기본 경로 |
| 6 | **상세 시트** (수량·메모·시각) | 위 + 이어서 | **1** | S7 체중, S9 병원, 소급 입력 |
| 7 | **제품 바코드 스캔** | 앱 + 스캐너 + 조준 | **2** | S4 투약 — **정보를 더 담기 때문에 값어치가 있다** |
| 8 | **사진 공유 타겟** | 갤러리 → 공유 → 선택 | **2** | S6 구토 |
| 9 | ~~인쇄 QR 스캔~~ | 7번과 같은 비용, **추가 정보 없음** | **보류** | 없음 |

**1~3위는 전부 같은 것 하나로 열린다** — 토큰 인증되는 `POST /api/events` (§3.6). 우리가 만드는 것은 HA 연동도 iOS 단축어도 아니고 **API 하나**다.

**시나리오 11개 중 인쇄 QR이 1순위인 것은 하나도 없었다.** 반면 제품 바코드는 S4(투약)에서 유일하게 대체 불가다 — 약이 2종 이상이면 타일로는 어느 약인지 구분할 수 없고, 실제로 준 약의 바코드를 찍으면 오기록도 막힌다.

> **manifest `shortcuts`는 프리셋별로 만들지 않는다.** 매니페스트는 정적이고 인증 없이 요청될 수 있어(프리셋 이름 노출), 플랫폼에 따라 홈 화면 추가 시점에 고정될 수 있다. 대신 **"빠른 기록" 하나**만 두고 목적지를 초경량 그리드 페이지(`/q`)로 한다. 앱 셸 로딩을 건너뛰는 이득만 취하고 위험은 없앤다. (갱신 동작은 P0-08에서 검증)

### 3.2 데이터 모델 — 프리셋

```prisma
// 프리셋 — 입력 경로의 중심. "무엇을 기록할지"를 미리 굳혀둔 것.
// 홈 타일 / 빠른 기록 항목 / (트리거 충족 시) 인쇄 라벨이 이 한 행의 표면이다.
model Preset {
  id          String   @id @default(cuid())
  householdId String
  petId       String?          // null = 현재 선택된 반려동물에 적용
  eventTypeId String
  label       String           // "사료 50g"
  quantity    Decimal? @db.Decimal(10, 2)
  unit        String?
  note        String?
  sortOrder   Int      @default(0)
  hiddenAt    DateTime?        // 타일 길게 누르기 → 숨기기 (§5.4 관리 포인트)
  archivedAt  DateTime?
  createdAt   DateTime @default(now())

  household Household   @relation(fields: [householdId], references: [id], onDelete: Cascade)
  pet       Pet?        @relation(fields: [petId], references: [id], onDelete: Cascade)
  eventType EventType   @relation(fields: [eventTypeId], references: [id])
  codes     PresetCode[]
  events    Event[]

  @@index([householdId, archivedAt, sortOrder])
}

// Phase 1에는 행이 생기지 않는다. 모델만 미리 둬서 Phase 2(제품 바코드)와
// 트리거 충족 시(인쇄 QR)의 추가가 마이그레이션 없이 끝나게 한다.
model PresetCode {
  id          String   @id @default(cuid())
  presetId    String
  householdId String              // 가구 내에서만 유니크. 전역 유니크는 틀렸다.
  value       String
  symbology   CodeSymbology @default(QR)
  source      CodeSource    @default(GENERATED)
  revokedAt   DateTime?
  lastUsedAt  DateTime?
  createdAt   DateTime @default(now())

  preset Preset @relation(fields: [presetId], references: [id], onDelete: Cascade)

  @@unique([householdId, value])
  @@index([presetId, revokedAt])
}

enum CodeSymbology { QR EAN13 UPCA CODE128 OTHER }
enum CodeSource {
  GENERATED  // 우리가 발급해 인쇄한 QR (보류)
  PRODUCT    // 제품 포장의 기존 바코드 (Phase 2)
}

// 자동 입력용 토큰. 이게 있으면 HA·iOS 단축어·ESPHome·curl·Node-RED가
// 전부 붙는다 — 우리는 연동을 만들지 않고 API를 연다 (§3.6).
model ApiToken {
  id          String   @id @default(cuid())
  householdId String
  name        String            // "사료통 버튼", "자동급식기"
  tokenHash   String   @unique  // 원문은 저장하지 않는다
  scopes      String[]          // Phase 1은 ["event:create"]만
  presetId    String?           // 지정하면 빈 본문 POST로 그 프리셋이 기록된다
  petId       String?
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  revokedAt   DateTime?
  createdAt   DateTime @default(now())

  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
}
```

**`PROJECT.md §4`에 반영할 변경**

| 변경 | 내용 | 근거 |
|---|---|---|
| 삭제 | `EventType.isQuickAction` | 그리드는 Preset이 결정한다. 다묘에서 "쿠키 사료"와 "모카 사료"를 EventType 플래그로는 표현할 수 없다 |
| 추가 | `EventType.species Species?` | null = 전 종 공통. 종 특화 확장이 **데이터 추가**로 끝난다 (K-8) |
| 추가 | `Event.presetId String?` | 게이트에서 경로별 비중을 데이터로 본다 (§5.6) |
| 교체 | `EventSource.NFC` → **`SCAN`**, 추가 `API` | Phase 2 제품 바코드 / §3.6 자동 입력 |
| 유지 | `Event.petId` **NOT NULL** | §7.1 |
| **추가** | `Event.rawText String?` | 사용자가 쓴 원문 보존. 파싱 실패·오파싱에도 손실 없음 (§3.7) |
| **추가** | `Event.entryId String?` | 한 번에 쓴 글에서 나온 여러 이벤트를 묶는다 |
| **추가** | `Event.quantityOffered Decimal?` | **제공량**. `quantity`는 섭취량으로 확정. 실기록이 둘을 구분해서 쓴다 |
| **추가** | `Event.needsReview Boolean` | 파싱 제안을 확인받기 전 표시 |
| **추가** | `EventType.aliases String[]` | 가정 내 은어("감자"=소변, "맛동산"=대변) 매칭 |
| **추가** | `Event.scaleValue Int?` | 범용 정수 척도. 대변 굳기 1~7, 식욕·활력 1~3을 **컬럼 하나**로 (§3.8) |
| **추가** | `EventType.scaleType` (`FECAL_7`/`APPETITE_3`/`ENERGY_3`/null) | 그 타입이 어떤 척도를 쓰는지. 추세 그래프 대상이라 `payload`에 넣지 않는다 |
| **추가** | `Preset.isStarter Boolean` | 온보딩 직후 노출할 3개(사료·물·배변). 나머지는 "더보기" 뒤 (G-1) |
| **승격** | `payload.vetContactId` → **`Event.contactId String?`** | `payload`는 쿼리 대상이 아니다. "이 병원 방문 이력"·"병원별 비용"이 쿼리돼야 한다 (§3.9) |
| **추가** | `Contact.{latitude, longitude, address, placeUrl}` | 지도 표기 + 내비 재실행. 좌표는 이벤트가 아니라 **Contact에** 붙는다 — 병원은 재방문한다 |
| **추가** | `Event.medicationCourseId String?` + `MedicationCourse` 모델 | 처방 수량·복약 체크. 복약 자체는 별도 테이블 없이 `Event`다 (§3.10) |

### 3.3 온보딩 — 첫 5분이 습관을 결정한다

| 단계 | 처방 |
|---|---|
| 관리자 계정 생성 | stash 부트스트랩 이식 |
| **가구 생성** | **자동 생성한다.** 이름 기본값 "우리 집". 사용자는 **가족을 초대할 때** 처음 이 단어를 본다. 다중 테넌시는 구현 개념이지 사용자 개념이 아니다 |
| **반려동물 등록** | **`name` + `species`만 필수.** 품종·성별·중성화·생일·입양일·등록번호·마이크로칩·색상·사진은 전부 사후 편집. **3초 안에 끝나야 한다** — `PROJECT.md §2-1`을 등록 화면에도 적용 |
| **홈 진입** | **종별 기본 프리셋을 자동 생성한다.** 고양이면 사료·물·대변·소변·간식·구토·체중. 사용자가 아무것도 고르지 않았는데 홈이 채워져 있다. **빈 홈 화면은 존재해선 안 된다** |
| PWA 홈 화면 추가 | 첫 기록 직후 **1회 안내** (iOS는 공유 시트에 숨어 있어 스스로 못 찾는다) |
| 사진 추가 | 홈에서 **부드러운 1회 유도**. 필수로 하면 등록에서 이탈한다 |
| 가족 초대 | **stash 패턴** — 관리자가 계정 생성 + 임시 비밀번호 1회 응답. **초대 링크는 만들지 않는다** (URL에 비밀을 싣지 않는다, K-6) |

### 3.4 보류된 것: 인쇄 QR

모델은 Phase 1에 들어가지만 **라우트·인쇄 화면·라벨 PDF는 만들지 않는다.** 다음 중 **하나라도** 충족되면 그때 만든다:

1. 프리셋이 **12개를 넘어** 타일 그리드에 스크롤이 생긴다
2. 반려동물이 **2마리 이상**이 되어 대상 확정이 실제 문제가 된다
3. 본인 외에 **정기적으로 기록하는 사람**(펫시터·가족)이 생긴다

그때 추가하는 것은 **라우트 2개 + 인쇄 화면 하나**다 (K-8: 표면의 추가이지 모델 변경이 아니다). NFC는 그보다 더 뒤의 선택 항목이며, `PresetCode`에 행을 추가하는 데이터 작업이다.

### 3.5 두 층위의 중복 방지 — 혼동 금지

| 층위 | 무엇을 막나 | 창 | 위치 | Phase |
|---|---|---|---|---|
| **프레임 중복** | 같은 코드가 카메라 프레임에서 연속 인식 | 3초 | 클라이언트 스캐너 | 2 |
| **행위 중복** | 배우자가 30분 전에 이미 급여 | 타입별 설정 | 서버 `createEvent()` | 2 |

Phase 1에는 둘 다 없다. 1~2인 가구에서 이중 급여는 대화로 해결되므로 게이트 2주를 버티는 데 문제가 없다 (F2).

### 3.6 자동 입력 — 연동을 만들지 않고 API를 연다

**특정 연동(HA·iOS 단축어)을 구현하지 않는다. 토큰으로 인증되는 REST 엔드포인트 하나만 연다.** 그러면 HA `rest_command`, iOS 단축어, ESPHome, Node-RED, cron + curl, 스마트 체중계 브리지가 전부 붙는다.

- **별도 `/api/hooks/event` 라우트를 만들지 않는다.** `POST /api/events`가 **세션 JWT와 ApiToken을 모두 받는다.** `authenticate` 훅이 어느 쪽이든 `request.householdId`를 결정하므로(K-2) 라우트는 차이를 모른다. 진입점이 하나라는 K-4와도 일치한다. (`PROJECT.md §5.3`의 별도 라우트 안에서 이탈 — 근거는 표면 축소)
- **스코프로 제한한다.** ApiToken은 `scopes: ["event:create"]`만 갖는다. 기기 토큰이 새어도 다른 라우트를 건드리지 못한다.
- **프리셋 스코프 토큰이면 본문이 비어도 된다.** 물리 버튼·ESPHome처럼 단순한 클라이언트가 붙기 쉬워야 한다:

```
POST /api/events
Authorization: Bearer kbl_xxxxxxxx
(본문 없음)          → 토큰에 묶인 프리셋으로 1건 기록
```

- **`dedupeKey`로 재시도를 안전하게.** 기기는 재시도한다. 같은 키는 한 번만 기록된다.
- **Phase 1 산출물은 `api.md` 하나** — 엔드포인트 + curl 예제. 특정 플랫폼 가이드는 쓰지 않는다.

> 이 결정으로 마찰 1~3위(기기·센서 / 물리 버튼 / 음성·위젯)가 **전부 Phase 1에서 열린다.** 게이트가 "수동 입력만으로 2주 버티는가"가 아니라 **"설계 전체가 통하는가"**를 묻게 된다.

### 3.7 채팅형 입력 — 실기록이 그렇게 생겼다

기존에 메신저 대화방에 써 온 실사용 일지를 분석했다. 결론은 하나다 — **타일 1탭으로 담기는 기록이 거의 없다.**

#### 실측된 기록 패턴 11가지

| # | 패턴 | 타일 1탭 | 설계 반영 |
|---|---|---|---|
| J1 | 한 번에 **3~5건을 몰아 쓴다** | ✗ | 줄 단위 분해 + `entryId`로 묶기 |
| J2 | **시각을 항상 손으로 쓴다** (`8시 40분`) | ✗ | 시각 파싱 + 빠른 버튼 |
| J3 | **작성 시각 ≠ 발생 시각** (밤에 아침 일을 적는다) | ✗ | `occurredAt = now()` 기본값이 실제로 거의 안 맞는다 |
| J4 | **사진·영상이 거의 모든 기록에 2~9장** | ✗ | 다중 첨부를 Phase 1로 (P1-23) |
| J5 | **제공량과 섭취량을 둘 다 쓴다** (`100g 줬는데 30g 먹음`) | ✗ | `quantityOffered` + `quantity` |
| J6 | **저울로 그릇을 재서 잔량 차이로 섭취량을 낸다** | ✗ | 잔량 입력도 받는다. 이미 사용자 워크플로에 있다 |
| J7 | **사료 종류를 구분하고 배변으로 역추적한다** | ✗ | 사료 제품을 **각각 프리셋으로**. 제품 바코드의 진짜 쓸모 (P2-02) |
| J8 | **배변을 정량화한다** (소변 덩어리 개수, 대변 횟수) | △ | `quantity`로 표현 가능. 퀵 칩에 개수 스테퍼 |
| J9 | **투약에 저항도·성공 여부가 있다** | ✗ | 단순 체크가 아니다. `note` / `payload` |
| J10 | **불확실성을 그대로 쓴다** (`~정도`, `~인듯`, `~같음`) | — | **정확한 숫자를 강요하지 않는다.** 파싱은 근사값을 그대로 받는다 |
| J11 | **가정 내 은어를 쓴다** | ✗ | `EventType.aliases` |

추가 관찰: **두 사람이 같은 방에 쓰고 상대가 읽는다는 전제로 서술한다** — 공유가 기본값이다. 그리고 기록이 가장 촘촘해지는 시기는 **아플 때**다. 즉 **앱이 가장 필요한 순간이 집중 관찰기**이고, 그때 쓴 기록은 병원에 가져가야 한다.

#### 기준선은 메신저다

메신저를 계속 쓴 이유를 세어보면:

1. **이미 열려 있다** — 앱 실행 마찰이 거의 0
2. **자유 텍스트** — 구조를 강요하지 않는다
3. **사진 여러 장이 쉽다**
4. **배우자와 자동 공유** — 초대·권한 절차가 없다
5. **시간순으로 남는다**
6. **실패하지 않는다** — 형식 검증이 없으니 거부당할 일이 없다

**kibble이 이걸 이기지 못하면 게이트를 통과할 수 없다.** 타일 그리드는 1·5는 비슷하지만 2·3·6에서 진다. 그래서 홈을 뒤집는다:

```
┌─────────────────────────┐
│  오늘 · 사료 3 · 물 2      │  ← 요약 한 줄
├─────────────────────────┤
│  08:15 처방약 [사진 3]     │
│  08:40 사료 40g / 남150g  │  ← 타임라인 = 대화 흐름
├─────────────────────────┤
│ [사료][물][배변][약]  ⋯   │  ← 퀵 칩 1탭 (평상시)
│ [📷] 입력하세요…      [↑] │  ← 자유 텍스트 + 다중 사진
└─────────────────────────┘
```

**파싱 3원칙** — 쓴 문장에서 시각·수량·타입을 뽑되:

1. **파싱 실패는 실패가 아니다.** 못 알아들으면 `NOTE`로 남긴다. **거부당하는 일이 없어야 한다** — 메신저가 이기는 가장 큰 이유다
2. **결과는 제안이지 확정이 아니다.** 저장 후 칩으로 보여주고 탭하면 고친다. `rawText`가 있어 틀려도 손실이 없다
3. **한 글이 여러 이벤트가 된다.** 줄 단위로 쪼개 각각 파싱하고 `entryId`로 묶는다

Phase 1은 **규칙 기반 최소판**이다 — 시각(`8시 40분`, `오후 3시`), 수량(`40g정도`, `7~80ml`, `2개`), 타입 키워드 + 사용자 등록 별칭(`EventType.aliases`). 오프라인·프라이버시·비용에서 낫고 공개 전제와도 맞는다. 고도화는 Phase 2.

#### 1탭 원칙은 틀리지 않았다 — 적용 구간이 틀렸다

| 구간 | 기록 성격 | 최적 경로 |
|---|---|---|
| **평상시** (건강) | 사료·물·배변. 반복적이고 수량이 일정 | **퀵 칩 1탭** — 기존 설계가 맞다 |
| **집중 관찰기** (투병) | 서술 + 사진 + 정확한 시각·수량. 기록이 가장 촘촘하고 **앱이 가장 필요한 때** | **채팅 입력** — 기존 설계가 못 담았다 |
| **자동** (급식기·센서) | 사람 개입 없음 | **REST API** (§3.6) |

세 구간이 **같은 타임라인에 쌓인다.** 하나를 위해 다른 하나를 버리지 않는다.

> **`PROJECT.md §2-1` 수정 필요**: "상세 입력은 항상 사후 편집으로 미룬다"는 실측과 어긋난다. 사용자는 **입력 시점에 이미 상세를 알고 있고 그걸 쓰고 싶어 한다.** 원칙을 "**평상시 반복 기록은 1탭, 서술이 필요한 기록은 막지 않는다**"로 좁힌다.

### 3.8 초보자 유도 — 정보는 그 순간에만 준다

§3.7의 실기록은 **숙련자**의 것이다. 변의 내용물 구성을 짚고, 겉면의 질감으로 회복 여부를 판단하는 수준의 서술이다. 초보 보호자는 이렇게 못 쓴다 — 무엇을 봐야 하는지 자체를 모르기 때문이다.

여기서 **서로 반대 방향의 문제 두 개**가 동시에 생긴다:

| 문제 | 처방 방향 |
|---|---|
| 초보는 **뭘 관찰해야 할지 모른다** | 정보를 **더** 준다 |
| 입력할 게 많으면 **아무것도 시작 못 한다** | 선택지를 **줄인다** |

둘을 동시에 만족시키는 유일한 방법은 **컨텍스트 기반 점진 공개**다. 전부 보여주고 고르게 하는 대신, **그 순간에 필요한 것만** 꺼낸다.

#### 원칙 4가지

- **G-1. 시작은 3개로.** 온보딩 직후 퀵 칩은 **사료·물·배변 3개**만. 나머지는 "더보기" 뒤에 접어둔다. 8개를 한 번에 보여주면 고르는 것부터가 일이다.
- **G-2. 정보는 그 순간에.** 설정에 가이드 문서를 두지 않는다 — **아무도 읽지 않는다.** 배변을 기록하는 그 화면에서 배변 힌트를 준다.
- **G-3. 전부 건너뛸 수 있다.** 힌트는 힌트다. 하나도 안 채워도 저장된다 (K-12).
- **G-4. 3번 무시하면 그만 보여준다.** 숙련자에게는 잔소리다. 이 앱의 첫 사용자(개발자 본인)가 이미 숙련자라는 점을 잊지 않는다.

#### 표준 척도 — 초보의 "언어 문제"를 푼다

초보가 못 하는 건 관찰이 아니라 **서술**이다. 그림·단계에서 고르게 하면 해결된다.

| 대상 | 척도 | 왜 이게 좋은가 |
|---|---|---|
| **대변 굳기** | 1~7 단계 (수의학에서 널리 쓰이는 대변 스코어) | 그림에서 고르면 끝. **수의사가 그대로 알아듣는다.** 초보의 최대 난관을 한 번에 해결 |
| 식욕 | 3단계 (평소대로 / 줄었음 / 거의 안 먹음) | 그램을 못 재도 기록이 남는다 |
| 활력 | 3단계 (평소대로 / 처짐 / 많이 처짐) | "기력없는건지 편안한건지"를 초보도 고를 수 있다 |

**모델**: `Event.scaleValue Int?` + `EventType.scaleType`(`FECAL_7` / `APPETITE_3` / `ENERGY_3` / null). 범용 정수 척도 **하나**로 전부 표현한다. `payload`에 넣지 않는 이유는 **추세 그래프의 대상**이기 때문이다.

숙련자는 자유 텍스트로 계속 쓰면 된다. 척도와 서술은 배타적이지 않다.

#### 빈 화면과 첫 며칠

| 상황 | 처방 |
|---|---|
| 타임라인이 비어 있다 | **흐릿한 예시 카드 1~2개** — "이렇게 기록됩니다". 실데이터가 아님을 시각적으로 분명히 |
| 첫 기록 직후 | "기록 1건. **3일 모이면 패턴이 보여요**" — 왜 계속해야 하는지 한 줄 |
| 하루가 지나도록 특정 기록이 없다 | 조용히 한 줄. **하루 1회 이상 재촉하지 않는다** |
| 3일치가 쌓였다 | "이제 추세를 볼 수 있어요" — 보상이자 다음 행동 안내 |

#### 병원 관련 정보 — 선을 지킨다

`PROJECT.md §1` 비목표에 **"AI 건강 진단은 하지 않는다"**가 명시돼 있다. 그 선을 지키되, 초보가 가장 막막해하는 지점("이게 병원 갈 일인가?")을 방치하지도 않는다.

- **하는 것**: 널리 알려진 일반 관찰 기준을 **정보로** 제공한다. 출처를 밝힌다
- **안 하는 것**: 증상 해석, 원인 추정, 질병명 언급
- **표현은 항상** "수의사 상담 권장"까지. 앱이 판단하지 않는다
- 문구는 i18n 사전이 아니라 **별도 콘텐츠로 분리**해 검토·수정이 쉽게 한다

#### Phase 배치

| 항목 | Phase | 근거 |
|---|---|---|
| 시작 3개 + 더보기 | **1** | 비용 거의 0, 효과 큼 |
| 빈 화면 예시 카드 / 첫 기록 안내 | **1** | K-11의 구체화 |
| **대변 스코어 1~7** | **1** | 초보 유도 중 값어치가 가장 크고 스키마에 영향 |
| 힌트 칩 (기록 화면 내 관찰 항목 제안) | **2** | Phase 1은 화면이 이미 크다 |
| 식욕·활력 척도 | **2** | 스키마는 Phase 1에 준비(`scaleType`) |
| 무시 학습 (G-4) | **2** | 데이터가 쌓여야 판단 가능 |
| 관찰 기준 정보 + 이상 감지 | **3** | 이상 감지와 함께 |

### 3.9 장소·지도·내비 — garage 스택을 그대로 가져온다

문제: 병원에 갔는데 **어느 병원인지가 안 남는다.** 다음에 또 가려면 다시 찾아야 한다.

`garage` 실사 결과 필요한 게 거의 다 있다:

| garage 자산 | 내용 | 이식 |
|---|---|---|
| `apps/api/src/routes/mapProviders.ts` | `GET /api/map/providers` — Setting에서 kakao/naver/tmap 키를 읽어 **사용 가능한 프로바이더만** 반환 | 그대로 |
| `apps/web/lib/maps/loadSdk.ts` | SDK 동적 로드 + **진행 중 Promise 공유** — "스크립트 태그는 있는데 아직 로드 안 끝남"을 완료로 착각해 주소가 영영 안 나오던 버그의 수정본 | 그대로 (주석의 사고 기록 포함) |
| `apps/web/lib/maps/geocode.ts` | `geocodeAddress` / `reverseGeocode`, kakao → naver 폴백 | 그대로 |
| `apps/web/lib/navigation/deepLinks.ts` | `buildNavUrl` — kakao `map.kakao.com/link/to/`, naver `nmap://route/car`, tmap `tmap://route` + 웹 폴백 | `appname` 파라미터만 kibble로 |
| `apps/web/components/NavLaunchButtons.tsx` | 내비 3종 실행 버튼 (compact 변형 포함) | 그대로 |
| `apps/web/components/maps/LastLocationMap.tsx` | 단일 지점 지도 | 그대로. 경로용 `*TripMap` 4종은 **불필요** |
| `apps/web/lib/maps/useMapProviders.ts` | 프로바이더 설정 훅 | 그대로 |
| `MaintenanceRecord.{shop, latitude, longitude, address}` | 정비 기록에 좌표를 **직접** 박는다 | **채택하지 않는다** — 아래 |

**garage와 다르게 갈 지점**: garage는 좌표를 레코드에 직접 넣는다. 정비소는 매번 다를 수 있어서다. 그런데 **동물병원은 단골이 있고 재방문한다.** `PROJECT.md §4`에 이미 `Contact`(VET / GROOMER / SITTER / PHARMACY)가 있으므로 **좌표를 `Contact`에 붙이고 이벤트는 참조**한다. 그래야 "이 병원 방문 이력 전부"와 "병원별 비용 합계"가 쿼리된다.

> `PROJECT.md §4`는 병원 방문을 `payload: { vetContactId }`로 두는데, **`payload`는 쿼리 대상이 아니다**(같은 문서의 자기 규칙). `Event.contactId String?` 컬럼으로 승격한다.

**garage에 없어서 새로 만들 것: 상호(키워드) 검색.** garage에는 `addressSearch`(주소만)뿐이다. "○○동물병원"으로 찾으려면 Kakao SDK의 장소 검색이 필요하다 — garage가 이미 `libraries=services`로 로드하고 있으므로 **로더는 그대로 쓰고 호출만 추가**하면 된다. 결과에서 이름·주소·좌표·상세 URL을 받아 `Contact`을 만든다.

```
병원 방문 기록 → [병원 찾기] → "○○동물병원" 검색 → 목록에서 선택
    → Contact 자동 생성(이름·주소·좌표) → 이벤트에 연결
다음 방문   → Contact 1탭, 또는 [T맵][카카오][네이버] 버튼으로 즉시 내비
```

**키가 없으면 기능이 조용히 숨는다.** 공개 배포에서 지도 API 키는 각자 발급해야 한다. `mapProviders`가 빈 목록을 주면 검색·지도·내비 UI가 나타나지 않고 **상호를 자유 텍스트로 적는 폴백**만 남는다 (K-10과 같은 원칙). 키는 `Setting`(DB)에 저장하고 `.env`·코드에 넣지 않는다.

**구현 시 확정한 것** (P2-08~P2-10):

- **지도 프로바이더는 카카오 하나만 붙인다.** garage는 osm/naver/tmap도 지원하지만 kibble의 지도는 "병원 한 곳"을 보여주는 용도뿐이고, 프로바이더를 늘리면 leaflet 의존과 다크 타일 분기가 따라온다. **내비 딥링크는 SDK 키가 필요 없으므로 T맵·카카오·네이버 3종을 그대로 유지**한다 — 좌표만 있으면 셋 다 실행된다
- **좌표는 이름이 바뀌면 함께 버린다.** `Contact`의 키가 이름이라, 검색으로 붙은 좌표를 남긴 채 이름만 손으로 고치면 다른 병원에 엉뚱한 좌표가 붙는다. 반대로 **좌표 없는 재기록이 기존 좌표를 지우지도 않는다** (병원은 재방문한다) — `upsertVetContact`가 "새 값이 있을 때만 덮어쓴다"
- **좌표 없는 옛 기록은 주소를 지오코딩해 폴백**한다. 장소 검색 이전에 자유 텍스트로 적어 둔 병원도 지도·내비를 쓸 수 있다
- **키 입력은 관리자 연동 화면 `/integrations` 한 곳**이다 (garage 이식). `GET /api/settings`는 **마스킹된 값과 출처(DB / `.env`)만** 내려주고 원문은 내보내지 않는다 — 단 `APP_PUBLIC_URL`·`VAPID_SUBJECT`처럼 비밀이 아닌 값은 화면에서 고쳐야 하므로 원문을 준다. **VAPID 개인키는 꼬리 4자도 내리지 않고**(garage와 갈라지는 지점), 키 쌍은 발급 엔드포인트만 쓴다 — 손으로 한 쪽만 바꾸면 짝이 어긋나 푸시가 조용히 죽는다

### 3.10 투약 과정 — 처방 수량과 매일 복약 체크

실기록에서 확인된 문제는 하나다. **까먹는다.** 그리고 처방약은 "며칠치, 하루 몇 회"로 정해져 나오므로 남은 양이 계산 가능하다.

```prisma
model MedicationCourse {
  id          String    @id @default(cuid())
  householdId String
  petId       String
  name        String              // "○○ 캡슐"
  dosesPerDay Int       @default(1)
  totalDoses  Int?                // 총 처방 횟수. null이면 무기한(영양제 등)
  startDate   DateTime
  endDate     DateTime?
  contactId   String?             // 처방한 병원
  note        String?
  archivedAt  DateTime?

  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  pet       Pet       @relation(fields: [petId], references: [id], onDelete: Cascade)
  contact   Contact?  @relation(fields: [contactId], references: [id], onDelete: SetNull)
  events    Event[]

  @@index([householdId, petId, archivedAt])
}
```

설계 규칙 셋:

1. **복약 자체는 별도 테이블을 만들지 않는다.** 그냥 `Event`(`eventType.key = "medication"`) + `medicationCourseId` 참조다 (`PROJECT.md §2-3` 단일 테이블 원칙).
2. **남은 수량은 유도한다.** `totalDoses` − 연결된 이벤트 수. **별도 카운터를 두지 않는다** — 소프트삭제·오기록 정정과 반드시 어긋난다.
3. **garage의 주기 추적을 확장하지 않는다.** garage `ConsumablePart`/`Reminder`는 "N km 또는 N개월마다"이고, 복약은 "하루 N회 × M일"이다. 성격이 달라 같은 엔진에 넣으면 둘 다 나빠진다. `MedicationCourse`가 직접 계산한다.

UI:

- 홈 요약 줄에 **"오늘 약 1/2"** — 미완이면 남은 횟수가 보인다
- 퀵 칩으로 복약하면 진행 중인 과정에 자동 반영
- **"2일치 남았어요"** — §3.8 원칙대로 하루 1회, 조용히
- 처방 횟수를 채우거나 `endDate`가 지나면 자동 아카이브

#### Phase 배치 (§3.9 + §3.10)

| 항목 | Phase | 근거 |
|---|---|---|
| `Contact` 좌표 필드 + `Event.contactId` + `MedicationCourse` **스키마** | **1** | 나중 마이그레이션 회피. 테이블만 만들고 UI는 안 만든다 |
| 지도 프로바이더 설정 + 상호 검색 + `Contact` CRUD | **2** | S9(병원)는 저빈도이고 **마찰이 본질이 아닌 시나리오**다 |
| 지도 표기 + 내비 실행 버튼 | **2** | 위와 같음 |
| 투약 과정 UI + 오늘 복약 체크 | **2** | Phase 1이 이미 크다. **단 게이트 기간이 실제 투약 중과 겹치면 Phase 1로 앞당긴다** — 그때가 앱이 가장 필요한 순간이다 |
| 병원 방문 요약 PDF·보험 청구 | **4** | 기존 계획 유지 |

---

## 4. Phase 0 — 스펙 확정 (코드 없음)

| ID | 항목 | 담당 | 완료 조건 |
|---|---|---|---|
| P0-01 | 3일간 수기 기록 → **프리셋 후보 확정** (8개 이하) + `scenarios.md §2` 빈도 실측 교체 | 사람 | 빈도가 붙은 프리셋 목록 |
| P0-02 | **공개용 기본 `EventType` 시드 + 종별 기본 프리셋 템플릿** 확정. **시작 3개(`isStarter`)와 척도(`scaleType`) 지정 포함** | 사람 + 에이전트 | **`seed-event-types.md` 초안 완료 — 리뷰 필요.** 개인 사용 패턴이 아니라 일반 공개 기본값 (§7.2) |
| P0-02a | **대변 스코어 1~7 도판 확보** — 라이선스가 자유로운 이미지 또는 직접 제작 | 사람 | 공개 배포 가능한 라이선스여야 한다 (§7.2). 없으면 텍스트 설명 + 자체 일러스트 |
| P0-03 | stash 재사용 모듈 목록화 | **완료** | §1.2 |
| P0-04 | 시나리오 검토 (온보딩~운영, 설계 정합성) | **완료** | [`scenarios.md`](scenarios.md) |
| P0-05 | PWA 홈 화면 추가 + 오프라인 동작 확인 | 사람 | Android / iOS standalone 동작 |
| P0-06 | 저장소명·npm 패키지명 충돌 확인 | **완료** | [`package-names.md`](package-names.md). GitHub `eigger/kibble`, `@kibble/*` npm 가용 |
| P0-07 | `PROJECT.md §4` 스키마 확정판 (§3.2 표 + §7 반영) | 에이전트 | **완료** — `PROJECT.md §4`가 확정판. 이후 변경은 두 문서를 함께 고친다 |
| P0-08 | **manifest `shortcuts` 갱신 동작 검증** | 사람 | 재배포 후 shortcut이 갱신되는지. 갱신되면 프리셋 직행을 재검토 |
| P0-09 | **파싱 벤치마크 세트 구축** — 기존 일지에서 실제 문장 100개를 뽑아 (시각·수량·타입) 정답을 붙인다 | 사람 | 개인 100문장은 로컬만. **공개 합성 세트**: [`parsing-benchmark-public.md`](parsing-benchmark-public.md) (~25케이스). 목표치는 P0-09 본문 완료 후 확정 |

> **삭제된 항목**: 라벨 실물 인쇄 테스트(r4 P0-04), NFC 세션 유지 실험(r2), 도메인 선확정(r4 P0-06 — §7.4로 해소). 인쇄 QR이 보류되면서 라벨 치수 검증도 함께 보류된다.

---

## 5. Phase 1 — 코어 MVP

### 5.0 이식 전략 — "섀시는 통째로, 도메인은 새로"

**stash를 통째로 복사하되, 첫 작업은 기능 추가가 아니라 도메인 전멸(delete)이다.**

| 방식 | 실패 지점 |
|---|---|
| 파일 선별 복사 | **말 없는 설정을 놓친다.** `docker-entrypoint.sh`의 pristine 백업, `sw.js`의 뒤 슬래시 함정, `prisma.config.ts`의 `env()` 우회 이유 — "복사할 파일 목록"에는 안 잡히고 나중에 같은 함정을 다시 밟는다 |
| 고쳐가며 전환 | **단일 테넌트 전제가 어디에 남았는지 추적 불가.** 16개 라우트를 고치면서 가면 K-1을 어디서 지켰는지 알 수 없다. 죽은 코드와 새 코드가 섞이고 `stash_media` 같은 키가 조용히 살아남는다 |
| **삭제 먼저, 그 다음 추가** | 초기 2~3일이 순전히 삭제라 진도가 안 나가는 느낌 — 그뿐이다 |

#### 유지 / 변형 / 삭제 인벤토리 (실측)

| 영역 | 유지 | 변형 | **삭제** |
|---|---|---|---|
| `apps/api/src/routes` (16) | auth, attachments, settings, backup | — | **audit, barcodes, categories, insights, items, labels, locations, lookup, maintenance, movements, push, xp (12)** |
| `apps/api/src/lib` (~22) | prisma, settings, i18n, uploads, imageProcessing, mediaAuth, tokenVersion, prismaErrors | — | **barcodeLookup/\*(4), auditScope, auditFinish, barcodeSymbology, csv, freshness, householdXp, insights, xp, qrLabel, labelSheet, push, webhook (~15)** |
| `apps/api/prisma` | — | — | **migrations 11개 전부 + schema.prisma 본문** |
| `apps/api/src/jobs` (3) | trashPurge | — | **expiryNotifications, lowStockSummary** |
| `apps/web/app` (20) | login, offline, settings, layout, register-sw, manifest | page(홈 재작성), users→household, history→timeline | **audit(2), categories, i/[id], insights, items(3), labels, locations, scan, shopping, trash** |
| `apps/web/lib` (~20) | api, auth-context, base-path, download, i18n/\*, media, theme-context, toast-context | scanQueue(IndexedDB 승격), types | **barcodeScanner, beep, currency, locationTree, xpToast, recentSelections** |
| `packages/shared` | i18n/\* | schemas 전체 재작성 | **barcodeSymbology, freshness, insights, xp** |
| 배포·툴체인 | **전부 유지** | 이름 치환만 | — |

> Phase 2 이후에 되살릴 것(`scan/page.tsx`, `barcodeScanner.ts`, `beep.ts`, `TorchButton.tsx`, `qrLabel.ts`, `labelSheet.ts`, `push.ts`, `webhook.ts`, `NotoSansKR` 폰트)은 **지금 지우되 목록으로 남긴다.** 필요할 때 stash 저장소에서 다시 꺼낸다 — 죽은 코드로 들고 있는 것보다 낫다.

#### 절차

| 단계 | 작업 | 체크포인트 |
|---|---|---|
| **0** | `stash` → `kibble` 복사. **git history는 가져오지 않는다**(배경은 로컬 stash에서 `git log -S`). `chore: import stash chassis (v0.7.5)` 단일 커밋 | — |
| **1** | **도메인 전멸.** 인벤토리의 삭제 열을 전부 지운다. `schema.prisma`는 `User`만, `migrations/` 통째 삭제, `translations.ts`는 common/nav/login만 | **`build`+`lint`+`test` 통과, `docker compose up`으로 빈 껍데기가 뜬다.** 이 전략의 안전판 |
| **2** | **이름 치환.** 커밋 분리 필수 | 재검증 + `grep -ri stash` 0건 |
| **3** | §5.1~5.5 WBS. **도메인은 새로 쓴다** | K-1~K-11 |

#### 이름 치환 — 놓치면 조용히 깨지는 것

컴파일 에러로 안 잡힌다:

| 종류 | stash 값 | 위험 |
|---|---|---|
| localStorage 키 | `stash_token`, `stash_locale`, `stash_scan_queue` | 동작은 한다 → **잔재 영구화** |
| 쿠키 이름 | `stash_media` (+ `path=/api/attachments/file`) | 이름과 path가 어긋나면 사진이 전부 401 |
| SW 캐시 이름 | `stash-shell-v6`, `stash-api-v1` | 버전을 안 올리면 **구 캐시가 계속 서빙** |
| 패키지 | `@stash/shared`, `@stash/api`, `@stash/web` | tsconfig paths·imports 동반 |
| 배포 | `/opt/stash`, `STASH_DIR`, `STASH_REPO`, `STASH_REF`, `ghcr.io/*/stash-api`, `stash.service` | 기존 LXC와 충돌 |
| env | `POSTGRES_USER/DB` 기본값 `stash`, `INVENTORY_WEBHOOK_URL` | DB 이름 충돌 |

> `grep -ri stash`가 0이 될 때까지 (README 원저작자 표기 제외) 2단계를 닫지 않는다.

#### 가져오지 않는 것: 마이그레이션

**stash 마이그레이션 11개는 절대 가져오지 않는다.** 가져오면 첫 배포가 `Item`·`Barcode`·`AuditSession`을 만들고 지운다. 특히 `barcode_value_globally_unique`는 kibble에서 **틀린 제약**이다. kibble의 첫 마이그레이션은 `init` 하나다.

### 5.1 기반

| ID | 작업 | 완료 조건 |
|---|---|---|
| P1-01 | §5.0 0~1단계: 섀시 복사 + 도메인 전멸 | **완료** — `build`+`lint`+`test` 통과, `docker compose config` 검증 |
| P1-02 | §5.0 2단계: 이름 치환 | **완료** — 코드·compose·proxmox에서 `stash` 잔재 0건 (stash 저장소 출처 주석만 유지) |
| P1-03 | Prisma 스키마 신규 작성 + 초기 마이그레이션. **Phase 2에서 쓸 테이블도 지금 만든다** — `PresetCode`, `Contact`(좌표 포함), `MedicationCourse`, `ApiToken` | **완료** — `PROJECT.md §4` 전체 + stash `Setting`·`UserRole`·`tokenVersion` 유지. `EventType_system_key_key` 부분 유니크 포함. `build`+`lint`+`test` 통과 |
| P1-04 | EventType 시드 + **종별 기본 프리셋 템플릿** (P0-02) | **완료** — `POST /api/pets`에서 `ensurePresetsForPet` 호출 |

### 5.2 인증 / 테넌시 / 온보딩

| ID | 작업 | 완료 조건 |
|---|---|---|
| P1-05 | 인증 이식 + **JWT 30일** + `resolveJwtSecret` + 로그 마스킹 + 로그인 rate limit | **완료** — `jwtSecret.ts` + 프로덕션 약한 시크릿 테스트 |
| P1-06 | `request.householdId` 데코레이터 + 스코프 헬퍼 (K-2) | **완료** — `authenticate` resolve + `householdWhere`/`requireHouseholdId` |
| P1-06a | **`ApiToken` 발급/폐기 + `authenticate`가 Bearer 토큰도 수용** (§3.6) | **완료** — `POST/GET/DELETE /api/tokens`, `kbl_*` Bearer, `event:create` 스코프 |
| P1-07 | **온보딩**: 부트스트랩 시 가구 자동 생성 → 반려동물 등록(이름+종) → 기본 프리셋 자동 생성 | **완료** — API + 홈 UI(P1-27a starter 칩). PWA 안내는 P1-27b |
| P1-08 | 가구 **계정 추가** / 역할 (OWNER / MEMBER / VIEWER) + 임시 비밀번호 1회 응답 | **완료(Phase 1)** — `/users` UI + `householdMode` JOIN/SEPARATE(§7.12). VIEWER 쓰기 403 |
| P1-09 | **가구 격리 테스트 스위트** (K-3) | **완료(Phase 1a)** — inject+Prisma mock. **attachment** POST/DELETE 격리 포함. **실 DB 통합 테스트**는 CI PostgreSQL 도입 시 P1-09b |
| P1-10 | 미디어 접근 인증 (`purpose` 분리 쿠키) | **완료** — 첨부 파일 서빙 시 미디어 쿠키·Bearer + **가구 소유권 검사**(404) |

### 5.3 도메인

| ID | 작업 | 완료 조건 |
|---|---|---|
| P1-11 | 반려동물 CRUD + 사진 + 사후 편집 필드 전체 | **완료** — GET/PATCH/DELETE(archive)·사진·`/pets` UI 12필드 편집 |
| P1-12 | **`createEvent()` 단일 서비스 함수** | **완료** — `services/createEvent.ts` |
| P1-13 | `POST /api/events` + 목록 / 수정 / 소프트삭제. **세션·토큰 양쪽 인증 + `dedupeKey` + 빈 본문 처리** (§3.6) | **완료** — GET/PATCH/DELETE/restore 포함. 단건 `GET /api/events/:id`는 세션 전용(토큰은 개체 스코프라 임의 id 읽기를 열지 않는다). `api.md`는 P1-18 |
| P1-14 | **`Preset` CRUD + 숨기기/순서 + `aliases`** | **완료** — API POST/PATCH/DELETE·`EventTypeAlias`·부분 유니크·`/presets` UI(이름·순서·숨김·별칭)·칩 길게 누르기 메뉴. 생성·삭제 UI는 미포함 |
| P1-15 | **한국어 파싱 서비스 (규칙 기반 최소판)** — 시각·수량·타입/별칭, 줄 단위 분해 | **완료** — `lib/parseEntry.ts` + `parseEntry.benchmark.test.ts`(공개 벤치마크 100%). KST 시각(§7.11). 실패 → NOTE |
| P1-16 | 다중 첨부 (`Attachment` 여러 장) + 이미지 파이프라인 + **청크 업로드**(drop 이식) | **완료** — multipart(≤20MB)·청크(8MB·영상/대용량), sharp JPEG, `FILE_SIZE_LIMIT_MB`, 영상은 업로드 후 서버 백그라운드 720p (이미 작으면 건너뜀) |
| P1-17 | 소프트삭제 퍼지 잡 (`trashPurge` 이식) | **완료** — 30일 경과 `Event` 하드삭제 + 첨부 디스크 정리, 매일 04:00 크론 |
| P1-18 | `api.md` — 엔드포인트 + curl 예제 | **완료**. 관리자 화면 `/api-explorer`(garage 이식)가 읽기 20종을 실제로 눌러 볼 수 있게 보완한다 — 쓰기는 curl 예시만 |

### 5.4 웹

| ID | 작업 | 완료 조건 |
|---|---|---|
| P1-19 | PWA 셸: manifest(**"빠른 기록" shortcut 1개**), 아이콘, SW, 오프라인 페이지 | **완료** — shortcut `/q`, SW 셸 v3, 오프라인 페이지·배너 |
| P1-20 | **홈 = 타임라인 + 하단 입력 바** (§3.7). 상단 오늘 요약 한 줄 | **완료** — 텍스트 입력 P1-22에서 활성화. 반려동물 탭 2마리+ |
| P1-21 | **퀵 칩 1탭 기록** + 실행취소 토스트 3초 | **완료** — 홈 칩 → POST /api/events, 실행취소 DELETE |
| P1-22 | **자유 텍스트 입력 + 파싱 제안 칩** | **완료(Phase 1)** — `POST /api/parse/entry`, 입력 즉시 저장(K-12·K-13)·`rawText`는 줄 단위·`entryId` 공유·`dedupeKey` 멱등. 검토 칩·저장 실패 재시도. 편집 시트는 P1-24 |
| P1-23 | **다중 사진·영상 첨부** (카메라 / 갤러리) | **완료** — 홈·상세 시트 첨부 UI, 텍스트 저장 시 첫 이벤트에 연결 |
| P1-24 | 상세 시트 + **시각 빠른 버튼**("방금 / 1시간 전 / 어제 저녁") + **제공량·섭취량 2필드** | **완료** — 칩 길게 누르기·검토 칩·타임라인 탭 → `EventDetailSheet`, `@kibble/shared/quickTime` |
| P1-25 | **`/q` 빠른 기록 초경량 화면** | **완료** — 프리셋 칩 1탭·실행취소·더보기, 하단 네비 숨김 |
| P1-26 | 오프라인 큐 (IndexedDB, **첨부 Blob 포함**) | **완료** — 칩 기록 큐·온라인 자동 전송·4xx 거부 알림 |
| P1-27 | 타임라인 무한 스크롤 + 삭제/복구 + 편집 | **완료** — IntersectionObserver 페이지네이션·상세 시트 삭제·실행취소 복구 |
| P1-27a | **시작 3개 + "더보기"** (G-1) | **완료** (#7) |
| P1-27b | **빈 화면 예시 카드 + 첫 기록 안내 + 3일 안내** (§3.8) | **완료** — 흐릿한 예시 타임라인·`journalStats` 기반 안내 문구 |
| P1-27c | **대변 스코어 1~7 선택 UI** | **완료** — 상세 시트 FECAL_7 칩, 미선택 저장 가능 (G-3) |
| P1-28 | **i18n ko + en 양쪽 사전** | **완료** — UI `t()` 전수·LanguageToggle. **한계:** PWA manifest·Next `<metadata>`·`<html lang>`은 정적(영문/고정) — OS 설치 UI·SSR 제약 |

### 5.5 공개·배포

| ID | 작업 | 완료 조건 |
|---|---|---|
| P1-29 | Dockerfile 2종 + entrypoint + compose + Caddyfile | **완료** — `apps/{api,web}/Dockerfile`, compose migrate+seed, Caddy `/api` 프록시 |
| P1-30 | GHCR 릴리스 워크플로 + Proxmox LXC 스크립트 | **완료** — `docker-release.yml` dispatch, `proxmox/ct/kibble.sh`·`kibble-install.sh` |
| P1-31 | LXC 배포 + Tailscale 접근 | **완료(문서)** — `deploy.md` §3 Tailscale·PWA. 실기 접속은 게이트 |
| P1-32 | `README.md`(en) + `README.ko.md` + `LICENSE`(MIT) | **완료** — 배포 링크·Phase 1 구현 완료 상태 반영 |
| P1-33 | `.env.example` + `deploy.md` | **완료** — Compose·GHCR·Proxmox(`KIBBLE_REF=master`)·env·트러블슈팅. `.env`에 셸 치환 금지 명시 |

### 5.6 Phase 1 게이트

> **여기서 멈춘다.** 2주간 개발자 본인이 실사용. 판정 지표는 하나 — **중단 없이 계속 쓰는가.**

**판정의 기준선은 메신저다.** "메신저 대신 이걸 쓰는가"가 실질 질문이다 (§3.7).

`Event.source` + `presetId` + `rawText` 유무로 **경로별 비중**을 본다:

| 관측 | 해석 | Phase 2 방향 |
|---|---|---|
| **API(`source=API`) 비중이 높다** | 자동 입력이 답이었다 | 센서·기기 확대 |
| **자유 텍스트(`rawText` 있음) 비중이 높다** | 채팅형이 맞았다 | 파싱 고도화 |
| **퀵 칩 비중이 높다** | 1탭 원칙이 맞았다 | 정확도(제품 바코드·중복 경고) |
| **여전히 메신저에 쓴다** | **게이트 실패.** 기능으로 덮지 않는다 | 입력 UX를 다시 판다 |

파싱 정확도도 함께 잰다 — **`needsReview`로 남은 비율과 사용자가 실제로 고친 비율.** 오파싱이 잦으면 파싱을 줄이고 원문 보존 쪽으로 후퇴한다.

동시에 [`scenarios.md §6`](scenarios.md)의 예상 마찰 F1~F9를 실측과 대조한다.

**게이트 통과 시에만 첫 릴리스(`v0.1.0`) 태그를 발행한다.**

---

## 6. Phase 2~5

### Phase 2 — 앱을 열지 않는 입력 (우선순위 재정렬)

| ID | 작업 | 비고 |
|---|---|---|
| P2-01 | **파싱 고도화** — 실측 문장 벤치마크 세트로 정확도 개선 | Phase 1 게이트의 `needsReview` 비율을 근거로 |
| P2-02 | **스캐너 이식 + 제품 바코드 바인딩** (`PresetCode.source = PRODUCT`) | S4 투약 구분, 사료 종류 추적. `@zxing` 동적 import 규칙 + 테스트 함께. 자동 생성은 하지 않는다 |
| P2-03 | Web Share Target (drop 이식) | S6 |
| P2-04 | **`GET /api/states` (역방향)** | **완료** — 이름을 `/api/ha/states`에서 바꿨다: 경로에 플랫폼 이름을 박지 않는다 (K-14). `state:read` 스코프 토큰 또는 세션으로 읽는다. 반려동물별 마지막 기록·오늘 합계·밀린 복약·리마인더. **선택 기능** — HA 없이도 앱이 완전하다 (K-10) |
| P2-05 | 행위 중복 경고 | `createEvent()` 내부에서만 (F2) |
| P2-06 | 퀵 칩 시간대 가중 자동 정렬 | 게이트 2주 데이터를 근거로 |
| P2-07 | 가족 공유 실사용 검증 | 2인 이상 동시 기록 |
| **P2-08** | **지도 프로바이더 설정** (`GET /api/map/providers` + 키 입력 UI) | **완료** — `routes/mapProviders.ts` + **관리자 연동 화면 `/integrations`**(garage `integrations/page.tsx` 이식). `KAKAO_MAP_APP_KEY`를 `Setting`에 저장. 키가 없으면 `providers: []` → 검색·지도 UI가 숨는다 |
| **P2-09** | **상호(키워드) 검색 → `Contact` 자동 생성** | **완료** — `ClinicSearchModal`(Kakao `Places.keywordSearch`, 카테고리 `HP8` 필터·현위치 가중·미리보기 지도). 선택 결과의 이름·주소·좌표·`place_url`이 `upsertVetContact`로 들어간다 |
| **P2-10** | **지도 표기 + 내비 실행 버튼** | **완료** — `ClinicMap`(단일 지점·다크 필터·recenter) + `NavLaunchButtons`(T맵/카카오/네이버, `appname=kibble`). 좌표가 없는 옛 기록은 주소를 지오코딩해 폴백. **`Contact` 관리 화면(CRUD)은 미구현** — 병원은 기록 흐름에서 자동 생성되므로 별도 화면의 필요가 아직 확인되지 않았다 |
| **P2-11** | **병원 방문 이벤트에 `Contact` 연결** + 병원별 방문 이력·비용 집계 | **부분 완료** — `Event.contactId` 연결, 자주 가는 병원 제안(`clinicSuggestionsForPet`), **이벤트 단위 비용(`costKrw`) 입력·`/analytics` 추세 그래프**(2026-09-04)까지 동작. **병원(`Contact`)별로 나눠 묶는 방문 이력·비용 집계 쿼리는 여전히 미구현** |
| **P2-12** | **투약 과정 UI** — 과정 등록, "오늘 약 1/2", 잔여 안내, 자동 아카이브 | 남은 수량은 **유도**한다(카운터 금지). **게이트 기간이 실제 투약과 겹치면 Phase 1로 앞당긴다** |
| **P2-13** | **제품(사료·영양제·용품) 관리 및 기록 연동** | **완료 (PR #66)** — `Product` 모델(사료/영양제/간식/위생/기기/기타), CRUD 및 사진 업로드(WebP 1000px), `createEvent()`/`PATCH` 연동(K-4), 퀵 칩 자동 입력, KST 기반 D-Day 계산, 타임라인 페이로드 경량화 |

> **`ApiToken` + 자동 입력 API는 Phase 1(P1-06a·P1-13)로 올라갔다** (§3.6). Phase 2에 남은 HA 관련 작업은 역방향 노출뿐이다 — 연동 자체는 사용자가 API로 직접 붙인다.

### Phase 3 — 인사이트
체중 / 음수량 / 사료량 추세 그래프, 이상 감지 알림(**진단 문구 금지, "수의사 상담 권장"까지**), 리마인더 엔진(INTERVAL), 캘린더 뷰, ~~비용 집계~~(이벤트 단위 추세는 P2-11에서 완료 — 병원별 집계만 남음), **웹 푸시 이식**(stash `push.ts` + VAPID UI 발급), `pg_dump` + 볼륨 스냅샷 백업 자동화.

### Phase 4 — 한국 특화 + 다묘·다종 확장
동물등록번호(15자리) 검증, 국내 표준 백신 스케줄 프리셋, 병원 방문용 요약 PDF(`pdfkit` + NotoSansKR 도입), 펫보험 청구 묶음 내보내기, 공공데이터포털 동물병원 연동 검토, 종별 EventType 시드 확충, **공용 이벤트·다묘 대상 확정 전략 재검토**.

### Phase 5 — 공개 마무리
보안 감사(웹훅 인증 / 업로드 검증 / **가구 격리** 전면 재점검), JSON·CSV 내보내기·가져오기, 스크린샷, 배포 문서 다듬기. **인쇄 QR·NFC는 §3.4 트리거 충족 시에만.**

---

## 7. 확정된 방향

### 7.1 반려동물 — 구조는 다종·다묘, UI는 1마리 최적화

| 결정 | 내용 |
|---|---|
| `Pet.species` | `DOG` / `CAT` / `OTHER`. Phase 1부터 존재 |
| **`EventType.species Species?`** | null = 전 종 공통. 종 특화 확장이 데이터 추가로 끝난다 (K-8) |
| **홈 반려동물 탭 조건부 렌더** | 1마리면 숨긴다. 1마리에서 탭은 순수 마찰 |
| `Preset.petId` nullable | 유지 |
| **`Event.petId` NOT NULL** | 공용 이벤트를 위해 미리 nullable로 열지 않는다. nullable의 비용(모든 쿼리·인덱스·격리 검사가 분기로 오염)이 **아직 존재하지도 않는** 시나리오의 이득보다 크다. Phase 4에서 재검토 |
| Phase 1 시드 | 전 종 공통 위주 + `CAT` 특화 소수. 개발자 개인 고양이에 종속되지 않게 |

### 7.2 공개 — 처음부터 공개 전제

| 결정 | 내용 |
|---|---|
| 라이선스 | MIT, `Copyright (c) 2026 eigger` |
| README | `README.md`(en) + `README.ko.md`, 배지 + 상호 링크. **Phase 1** |
| **i18n을 Phase 4 → Phase 1로** | en 사전을 처음부터 채운다. stash는 755줄을 소급 번역해야 했다 (K-9) |
| GHCR + Proxmox | Phase 1. 단 **태그 발행은 게이트 통과 후** — 실패하면 회수할 릴리스가 없어야 한다 |
| **HA 의존 금지** | HA 연동은 선택 기능. HA 없는 사용자에게도 앱이 완전해야 한다 (K-10) |
| 시드·기본값 | 개인 정보·개인 사용 패턴 금지 |
| 보안 | Phase 5에 몰지 않고 K-1~K-11로 Phase 1에 분산 |

### 7.3 알림 — 웹 푸시 (stash 이식)

`web-push` + **VAPID 키를 관리 UI 버튼으로 발급해 Setting에 저장**. Phase 3. SW의 `push`/`notificationclick` 핸들러는 P1-16에서 stash 셸과 함께 들어오므로 Phase 3에서 서버만 붙이면 된다. **HA 위임을 택하지 않은 이유**: 공개 전제에서 HA 없는 사용자가 알림을 못 받는다.

### 7.4 접근 — 내부 http, 외부 도메인은 설정 가능 (stash 동일)

- `APP_PUBLIC_URL`: Setting(DB) → env 폴백. 관리 화면에서 변경 가능
- `COOKIE_SECURE`: env, 기본 false. **기본 설치가 http라 무조건 켜면 사진이 안 뜬다**
- Caddy `:80` 그대로. TLS는 외부 도메인을 붙일 때
- 인쇄 QR이 보류되면서 **주소 선확정 압력이 사라졌다**

### 7.5 입력 경로 — 인쇄 QR 보류

시나리오 11개 대조 결과 **QR이 1순위인 경우가 없다** (§3.1). 모델은 남기고 표면만 보류하며, §3.4의 트리거 충족 시 라우트 2개 + 화면 하나로 복원한다. **제품 바코드는 별개로 Phase 2에서 살린다** — 타일로 표현할 수 없는 정보를 담기 때문이다.

### 7.6 JWT 수명 — 7일 → 30일

stash는 보안 강화로 90일 → 7일로 줄였지만, 그대로 쓰면 **게이트 2주 중 최소 1회 재로그인**이 발생해 판정을 오염시킨다 (F5).

근거: (a) `tokenVersion`으로 비밀번호 변경·로그아웃 시 **즉시 무효화**가 가능하다, (b) 셀프호스트 + 가구 단위라 노출면이 좁다, (c) 재로그인 마찰의 비용이 더 크다. `/logout-all`과 비밀번호 변경은 그대로 전 기기 무효화한다.

### 7.7 나머지 확정

| 항목 | 확정 |
|---|---|
| 프리셋 단일 테이블 | 홈 타일과 (향후) 라벨을 같은 `Preset` 행으로 |
| 타일 정렬 | Phase 1은 고정 순서 + 수동 숨기기. 자동 정렬은 게이트 데이터 후 (P2-08) |
| PostgreSQL | **신규 인스턴스** |
| 이벤트 생성 진입점 | `createEvent()` 하나 (K-4) |
| 가구 UI 노출 | **가족 초대 전까지 숨김** (§3.3) |
| **오늘 요약 일 경계** | Phase 1은 **KST(UTC+9) 자정** 고정. 타임존 설정 UI는 Phase 2 이후(§7.11) |
| **ApiToken 발급·폐기** | **가구 OWNER만** — MEMBER/VIEWER는 `POST/GET/DELETE /api/tokens` 불가 (§7.8) |
| **영상 재인코딩** | 업로드는 원본. 서버가 백그라운드에서 긴 변 1280·H.264로 줄인다. 이미 작으면 건너뜀(≤8MB / ≤2Mbps / 긴 변≤1280이고 ≤2.5Mbps). 폰 선압축 안 함. 변환 중에도 원본 재생, 끝나면 같은 `path`를 바꿔 끼움 |
| **첨부 전송** | 기록 POST는 즉시 저장. 파일은 Chromium(Android·데스크톱 PWA)이면 Background Fetch로 앱을 닫아도 이어 올리고, iOS 홈화면 PWA처럼 API가 없으면 이 화면에서 올린다. 전 기기 OS 백그라운드를 전제로 두지 않는다 |

### 7.11 오늘 요약 — Phase 1 일 경계는 KST 고정

§3.7 홈 상단 "오늘 · 사료 3 · 물 2"는 **사용자가 인지하는 하루**와 맞아야 한다. UTC 자정(한국 09:00)은 실사용과 어긋난다.

| 단계 | 처방 |
|---|---|
| **Phase 1** | `todaySummaryForPet`의 `occurredAt >= since`에서 **`since` = KST(UTC+9) 당일 00:00**을 UTC instant로 변환. 타임존 설정 UI 없음. **웹 상세 시트 `datetime-local`·타임라인 시각 표시도 KST 벽시계**(`datetimeLocal.ts`, `timeZone: Asia/Seoul`) — 서버·파서·빠른 버튼과 일치 |
| **Phase 2+** | `Setting` 또는 가구별 IANA 타임존. P2-06(퀵 칩 시간대 가중)과 함께 검토 |

근거: (a) Phase 1 주 사용자·게이트 실사용이 KST, (b) 클라이언트 오프셋 전송은 오프라인·API·curl 경로와 불일치, (c) UTC는 문서화 없이 넣으면 매 세션 재논의.

### 7.12 가구 공유 — 셀프호스트는 "초대"가 아니라 "계정 + 모드"

셀프호스트 인스턴스에는 **이미 사용자 계정이 존재**한다. P1-08의 "가족 초대"는 **관리자가 계정을 만들어 주는 것**(stash 패턴, R15)이지 링크 초대가 아니다.

| 모드 | DB | 누가 쓰나 | 언제 |
|---|---|---|---|
| **`JOIN` (공유 가구, 기본값)** | 새 사용자 → **관리자와 같은 `Household`**, 역할 MEMBER/VIEWER | 배우자·가족이 **같은 반려동물·같은 타임라인**을 함께 기록 | §3.7 메신저 대체 — **Phase 1 기본** |
| **`SEPARATE` (별도 일지)** | 새 사용자 → **새 `Household` 생성**, 그 사용자가 OWNER | 같은 물리적 반려동물이라도 **일지·프리셋·이벤트가 분리** | 각자 기록하고 싶을 때. 온보딩에서 자기 펫 등록 |

**Phase 1에 넣지 않는 것**: 한 Household 안에서 펫별로 "이 계정만" 보이게 하는 ACL — 복잡도 대비 게이트 전 불필요. 필요하면 `SEPARATE` Household 또는 Phase 2 `Setting`.

관리 UI(`/users`): 계정 생성 시 **`householdMode: JOIN | SEPARATE`** 선택. **GET /users는 인스턴스 전체 사용자**를 반환하고 `inSharedHousehold`로 공유·별도를 구분한다. **DELETE·reset-password는 ADMIN이 인스턴스 내 임의 사용자**(본인 제외)에 대해 가능 — SEPARATE 계정도 관리 가능.

### 7.8 자동 입력 — Phase 1, 연동이 아니라 API

`ApiToken` + `POST /api/events`의 토큰 인증을 **Phase 1에 넣는다.** 별도 `/api/hooks/event` 라우트는 만들지 않고 기존 엔드포인트가 두 인증을 받는다 (§3.6, `PROJECT.md §5.3`에서 이탈).

특정 연동을 구현하지 않는 것이 핵심이다 — API 하나면 HA·iOS 단축어·ESPHome·Node-RED·curl이 전부 붙는다. Phase 1 산출물은 `api.md` 하나이며 플랫폼별 가이드는 쓰지 않는다. **`/api/tokens` CRUD는 JWT 세션 + 가구 OWNER만** — 토큰은 사실상 가구 쓰기 권한(`event:create`)이므로 MEMBER/VIEWER에게 열지 않는다.

### 7.9 입력 UI — 채팅형을 1급으로

실사용 일지 분석(§3.7) 결과 **타일 1탭으로 담기는 기록이 거의 없었다.** 한 번에 3~5건, 시각 수기, 사진 2~9장, 제공량·섭취량 구분, 서술이 본체.

홈을 **타임라인 + 하단 입력 바**로 뒤집는다 (§3.7). 퀵 칩 1탭은 평상시 경로로 남기고, 자유 텍스트·다중 사진을 1급으로 올린다. 쓴 문장은 규칙 기반으로 파싱하되 **원문(`rawText`)을 항상 보존하고 파싱 실패를 `NOTE`로 흡수한다** — 거부당하지 않는다는 것이 메신저가 이기는 이유이기 때문이다.

`PROJECT.md §2-1`의 "상세 입력은 항상 사후 편집으로 미룬다"는 실측과 어긋나므로 **"평상시 반복 기록은 1탭, 서술이 필요한 기록은 막지 않는다"**로 수정한다.

### 7.13 제품 관리 — 카테고리 Enum과 텍스트 불변성

| 결정 | 내용 |
|---|---|
| **`ProductCategory` Enum** | `MEAL`, `SUPPLEMENT`, `TREAT`, `HYGIENE`, `DEVICE`, `OTHER`. 도메인 수명주기 및 기능(급여 힌트, 개봉일·소비기한 D-Day 등)을 분기하는 고정 축 (R91) |
| **제형·입자크기** | `ProductForm`(건식·습식·반습식·겔형·츄르형·츄잉형·파우더·캡슐·정제·액상) + `KibbleSize`(소립·중립·대립). 알갱이 크기는 **건식일 때만** 존재하며, 제형이 바뀌면 서버가 `kibbleSizeForForm()`으로 정리한다 (R102) |
| **구매 중량** | g 정수로 저장(2kg → 2000), 입력만 kg/g 선택. 문자열로 두면 단가·소진일 계산을 못 붙인다 (R103) |
| **제품 사진** | `ProductPhoto` 여러 장(최대 9). `Product.photoPath`는 **대표 한 장을 가리키는 포인터**로 남아 목록 카드·기록 화면의 읽기 경로가 그대로 산다. 첫 장은 자동 대표, 이후 사용자가 지정. 대표를 지우면 남은 첫 장이 올라온다 (R106) |
| **`MEDICATION` 카테고리** | 지사제·억제제 같은 약·제제. 투약(`MedicationCourse`·`medication` 이벤트) 축과 짝이 맞아 R91의 "동작을 가르는 축" 기준을 충족한다. "급성/만성"은 상태라 `usage`에 적는다 (R111) |
| **표기사항** | 사료관리법 라벨 항목 — `usage`·`registeredIngredients`·`ingredientRegistrationNo`·`importer`·`storage`. 제조일자는 표기사항이 아니라 **기한 묶음**(제조→유통기한→개봉)에 둔다. 전부 자유 텍스트·선택 입력 |
| **주성분·전성분** | `mainIngredients`(200자)는 목록 카드에 한 줄로, `ingredients`(4000자)는 상세에서 접어서. 목록에 전성분을 띄울 수 없어 컬럼을 나눈다 (R105) |
| **원산지** | 자유 텍스트. 국가명이든 "국내산"이든 쓰는 대로 (K-12) |
| **노출 카테고리** | 제형·원산지·중량은 사료·영양제·간식(`FORM_DETAIL_CATEGORIES`)에만. 기기·위생용품에는 묻지 않는다 (R104) |
| **`Event.productName` 유지** | K-12 제로 마찰 입력 보장. 미등록 제품도 빠른 텍스트 입력 가능 및 제품 삭제·수정 시 과거 기록 불변성 유지 (R92) |
| **타임라인 페이로드 경량화** | `eventWithRelationsSelect.product`는 목록 표시에 필요한 경량 필드(`id, name, brand, category, photoPath, dosage, isActive`)만 포함. 전성분(4000자)·메모 등은 상세 시트에서 지연 로드 |
| **일 경계 KST 동기화** | 제품 유통기한 D-Day 및 개봉 경과일 계산은 §7.11에 따라 `kstDayDiff` (Asia/Seoul 자정 기준) 사용 |

### 7.14 디자인 시스템, 하단 내비 레이아웃 및 번역 키 무결성

| 결정 | 내용 |
|---|---|
| **디자인 시스템 & 라인아트 SVG** | 컬러 이모지를 전면 제거하고 모노크롬 라인아트 SVG로 통일 (`ProductIcons.tsx`). 모든 SVG 아이콘에 `aria-hidden: true`, `focusable: false` 기본 부여하여 스크린리더 이중 낭독 방지 (R94) |
| **하단 내비 높이 및 안전 영역 계산** | `* { box-sizing: border-box }` 전제 하에서 `height: calc(var(--nav-height) + env(safe-area-inset-bottom))`으로 정의하여 노치 기기에서 내비 내부 콘텐츠가 30px로 찌그러지던 현상 및 전역 34px 오프셋 오차 영구 해결 (R93) |
| **플로팅 버튼 레이어 및 터치 영역 분리** | `.bottom-nav`(`z-index: 50`), `.home-input-bar`(`z-index: 40`) 계층 엄수. 18px 돌출 플로팅 버튼이 잘리지 않도록 유지하고, 칩과의 간섭은 `.home-input-bar-inner`에 `padding-bottom: 20px`을 주어 물리적으로 해결. CSS transition은 `transform: scale(0.94)`를 적용해 리플로우 방지 (R96) |
| **접근성 있는 독립 버튼 분리** | 칩 내부 `<span onClick>` 중첩을 배제하고, `.product-quick-chip-wrap` 컨테이너 아래 형제 `<button>`으로 분리하여 `aria-label` 및 키보드 접근성 보장 (R97) |
| **`t()` 번역 키 타입 엄격화** | `t(key: TranslationKey)`로 `| string` 탈출구 제거. 누락/오타 i18n 키를 컴파일 타임에 원천 차단하고 K-9(ko/en 동시 작성) 강제 (R95) |
| **DB 라벨 분리 (`tLabel`) 및 캐스트 제로** | 사용자가 지은 프리셋 등 DB 리터럴은 `tLabel(labelOrKey: string)`으로 명시적 분리. 템플릿 리터럴 타입(`Scale3ValueLabelKey`, `PresetCategoryShortKey`)을 도입하여 코드베이스 전역의 `as TranslationKey` 캐스트 0건 달성 (R98) |
| **디자인 토큰(치수 체계) 도입** | `:root`에 `--radius-*`(6/8/12/999px), `--text-*`(0.75/0.82/0.9/1.05rem), `--space-*`(4/8/12/16px), `--shadow-chip-hover` 정의. 제품 화면 4px 반경을 `--radius-sm`(6px)으로 정돈, 임의 폰트 크기(0.74/0.84/0.92rem) 및 뱃지 여백을 기존 스케일에 일치. 다크 모드 칩 호버 시인성 확보 및 보조 버튼 44px 터치 타깃(`::before`) 보장 (R99) |

### 7.10 지금 결정하지 않는 것

| 항목 | 언제 | 근거가 될 것 |
|---|---|---|
| **파싱을 규칙 기반으로 계속할지, LLM을 붙일지** | Phase 2 | 규칙 기반이 오프라인·프라이버시·비용·공개 전제에서 낫다. 다만 J10(불확실 표현)·J11(은어)을 얼마나 커버하는지는 **실제 문장으로 시험해야** 안다 (P0-09) |
| **파싱 실패율이 얼마면 쓸 만한가** | Phase 1 게이트 | `needsReview` 비율 + 사용자가 실제로 고친 비율 |
| **"집중 관찰 모드"를 앱이 인지해야 하나** | Phase 3 이상 | 아플 때 기록 밀도가 달라진다. 모드를 켜면 힌트·요약이 달라질 수 있다 |
| 인쇄 QR / NFC 도입 | §3.4 트리거 충족 시 | 프리셋 수, 반려동물 수, 기록자 수 |
| 공용 이벤트 처리 | Phase 4 | 2마리 이상이 됐을 때의 사용 로그 |
| 타일 자동 정렬 알고리즘 | Phase 2 | 게이트 2주 시간대별 분포 |
| manifest shortcut 프리셋 직행 | P0-08 결과에 따라 | 갱신 동작 검증 |
| 백업 보관 주기·오프사이트 | Phase 3 | DB·볼륨 증가율 |

---

## 8. 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| **`§2-2` 원칙(앱 없이 기록)을 Phase 1이 만족하지 못한다** | 게이트에서 F4가 이탈 원인이 될 수 있다 | **숨기지 않고 게이트 판정 대상으로 삼는다.** 확인되면 Phase 2의 1번은 웹훅. 아니면 원칙을 고친다 |
| 가구 격리 누락 (stash 패턴 복사) | 데이터 유출 | K-1~K-3, P1-09 테스트를 Phase 1 안에 |
| **이름 치환 누락** (`stash_media` 쿠키, `stash-shell-v6` 캐시) | 컴파일 통과 후 **런타임에 조용히** 사진 401 / 구 캐시 서빙 | §5.0 목록 + `grep -ri stash` 0건을 P1-02 완료 조건으로 |
| **stash 잔재 코드가 덜 지워짐** | "kibble 건가 stash 건가" 혼란 영구화 | §5.0 1단계를 **삭제만 하는 커밋**으로 분리, 빈 껍데기 기동을 체크포인트로 |
| **온보딩에서 이탈** | 습관이 시작되지 않음 | P1-07. 등록 2필드 + 프리셋 자동 생성 + **빈 홈 금지** |
| **파싱이 자주 틀려 신뢰가 깨진다** | 사용자가 다시 메신저로 돌아간다 | K-12·K-13. 결과는 제안일 뿐이고 `rawText`가 항상 남는다. 게이트에서 `needsReview` 비율을 재고, 나쁘면 **파싱을 줄이는 쪽으로 후퇴** |
| **채팅형으로 뒤집으면서 Phase 1이 커졌다** | 게이트까지 도달이 늦어짐 | 파싱은 **규칙 기반 최소판**(시각·수량·타입)만. 고도화는 P2-01. 인쇄 QR·스캐너를 뺀 만큼으로 상쇄된다 |
| **초보 유도가 숙련자에게 잔소리가 된다** | 첫 사용자(개발자 본인)가 이미 숙련자라 게이트에서 역효과 | G-3(건너뛰기)·G-4(3번 무시하면 중단)·K-15. Phase 1은 **시작 3개·빈 화면 안내·대변 스코어**까지만 |
| **입력할 게 많아 보여 시작을 못 한다** | 온보딩 이탈 | G-1. 퀵 칩 3개로 시작하고 나머지는 접는다 (P1-27a). "전부 보여주고 고르게 하기"를 금지 |
| **관찰 기준 문구가 진단으로 읽힌다** | 책임 범위 이탈 (`PROJECT.md §1` 비목표) | K-16. "수의사 상담 권장"까지, 출처 명시, 문구를 별도 콘텐츠로 분리해 검토 가능하게 |
| **기기 토큰 유출** | 남의 가구에 기록이 들어감 | 해시 저장 + `scopes:["event:create"]` + 폐기. 다른 라우트는 403 (P1-06a) |
| **지도 API 키 없이 배포된 인스턴스** | 병원 검색·내비 UI가 깨져 보임 | `mapProviders`가 빈 목록이면 **UI 자체가 렌더되지 않고** 상호 자유 텍스트 폴백만 남는다 (§3.9, K-10) |
| **지도 API 키가 저장소·백업으로 샌다** | 과금·오남용 | 키는 `Setting`(DB)에만. `.env`·코드 금지. stash·garage처럼 **백업 대상에서 제외** |
| **복약 잔여 수량을 카운터로 두면 어긋난다** | 소프트삭제·오기록 정정 후 숫자가 틀림 | `totalDoses` − 연결 이벤트 수로 **유도**한다 (§3.10) |
| **다중 기기 작업 중 계획서가 갈라진다** | 여러 장소에서 서로 다른 전제로 작업 | `WORKPLAN.md`가 단일 진실 원천. 결정이 바뀌면 **코드보다 먼저** 이 문서를 고치고 push. 세션 종료 시 [`WORKLOG.md`](WORKLOG.md)에 기록 ([`../CLAUDE.md`](../CLAUDE.md)) |
| **앱 로딩이 느림** | 로딩 2초 = 마찰 (F8) | Phase 1에서 `@zxing`·`pdfkit` 등 제외. `/q` 초경량 경로 |
| `PresetCode.value` 전역 유니크로 잘못 이식 | 두 가구가 같은 사료 EAN을 못 씀 | `@@unique([householdId, value])`. stash 마이그레이션을 복사하지 말 것 |
| **en 사전이 뒤처짐** | 공개 시점에 소급 번역 폭탄 | 키 추가 시 en 동시 작성. 미번역 0건을 P1-22 완료 조건으로 |
| `packages/db` 위치 변경으로 prisma 경로 파손 | 배포 실패 | P1-03에서 경로 확정 후 P1-23 전에 compose로 1회 검증 |
| **게이트 전에 릴리스 발행** | 실패 시 회수 부담 | 저장소는 public이되 **태그는 게이트 통과 후** |
| Phase 1 게이트 실패 | 프로젝트 중단 | 그게 이 게이트의 목적이다. 기능 추가로 덮지 않는다 |

---

## 9. 작업 규약

`PROJECT.md §9`에 더해 확정한 것:

1. **K-1**: 모든 리소스 쿼리의 `where`에 `householdId`가 있다. 예외 없음.
2. **K-2**: `householdId`는 `authenticate` 훅이 결정한다. 라우트가 직접 읽지 않는다.
3. **K-3**: 가구 격리는 테스트로 고정한다 (P1-09).
4. **K-4**: 이벤트 생성은 `createEvent()` 하나만 통과한다.
5. **K-5**: 웹훅·토큰 엔드포인트를 만드는 커밋에 인증이 함께 들어간다.
6. **K-6**: stash에서 파일을 가져올 때는 **읽고 옮긴다.** 무인증 공개 라우트·URL 토큰·전역 유니크 패턴은 복사하지 않는다. 초대 링크도 만들지 않는다.
7. **K-7**: **GET은 절대 쓰기를 하지 않는다.** `/q` 빠른 기록도 클라이언트가 `POST`를 발사한다 — 프리페치·링크 미리보기로 기록이 생기면 안 된다.
8. **K-8**: 프리셋·이벤트 타입·종 확장은 **데이터 추가**다. 코드 변경이 필요하면 멈추고 모델을 재검토한다.
9. **K-9**: **UI 문자열은 ko/en을 동시에 추가한다.** en 미번역 키를 남기지 않는다.
10. **K-10**: **HA는 선택 기능이다.** HA가 없어도 모든 핵심 경로가 동작해야 한다.
11. **K-11**: **빈 화면을 만들지 않는다.** 반려동물 0마리, 프리셋 0개, 타임라인 0건 상태에는 항상 다음 행동이 제시돼야 한다.
12. **K-12**: **거부당하는 입력이 없다.** 파싱 실패·형식 불일치는 `NOTE`로 흡수한다. 사용자가 쓴 것을 앱이 되돌려보내면 안 된다 — 메신저가 이기는 가장 큰 이유다.
13. **K-13**: **원문을 버리지 않는다.** 파싱해서 구조를 얻더라도 `rawText`를 보존한다. 오파싱은 복구 가능해야 한다.
14. **K-14**: **연동이 아니라 API를 만든다.** 특정 플랫폼용 코드를 넣지 않는다. 붙이는 쪽은 문서 하나로 충분해야 한다.
15. **K-15**: **안내는 그 순간에만, 건너뛸 수 있게, 반복하지 않게.** 설정에 가이드 문서를 두지 않는다(아무도 읽지 않는다). 힌트를 3번 무시하면 그만 보여준다 (§3.8).
16. **K-16**: **진단하지 않는다.** 증상 해석·원인 추정·질병명 언급 금지. 표현은 항상 "수의사 상담 권장"까지이고 출처를 밝힌다.
17. **K-17**: **세션을 마칠 때 [`WORKLOG.md`](WORKLOG.md)에 기록한다.** 확정·변경한 결정과 근거, **기각한 안과 사유**(§1 표), 다음 세션이 이어받을 것. 여러 장소로 작업이 쪼개지므로 기록하지 않으면 같은 논의를 반복한다. 순서는 `WORKPLAN` → (`PROJECT §4`) → `WORKLOG`.
18. 커밋 접두사 `feat:` / `fix:` / `chore:` / `docs:`. 스키마 변경은 항상 마이그레이션 파일.
