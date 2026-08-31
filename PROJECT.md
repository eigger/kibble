# kibble

셀프호스트 반려동물 일지. 입력 마찰을 0에 가깝게 만드는 것이 유일한 설계 목표.

- 저장소: `eigger/kibble`
- 배포 대상: Proxmox LXC (기존 홈랩 환경)
- 상태: **Phase 0 (스펙 확정) — 코드 작성 전**

> **이 문서는 원 스펙이다.** 이후 조사·검증으로 확정된 변경과 실행 계획은 [`WORKPLAN.md`](WORKPLAN.md)에 있으며, 충돌 시 **WORKPLAN이 우선**한다. 특히 §4 스키마와 §5 입력 경로는 이미 여러 항목이 갱신됐다(WORKPLAN §3.2 변경표 참조). 이 문서에 확정판을 반영하는 것은 Phase 0 작업 **P0-07**이며 아직 완료되지 않았다.

---

## 1. 문제 정의

반려동물 일지 앱은 기능 부족으로 죽지 않는다. **입력이 귀찮아서** 죽는다.

하루에 5~10회 기록해야 하는데 `앱 실행 → 반려동물 선택 → 카테고리 선택 → 시각 입력 → 저장`을 요구하면 3일 안에 사용이 중단된다. 시중 앱은 기능은 충분하지만 전부 클라우드 종속 + 구독제이고, 셀프호스트 대안은 사실상 존재하지 않는다 (조사 결과: GitHub의 유사 프로젝트는 전부 개인 습작 수준, OpenVPMS는 동물병원 진료관리 시스템이라 개인용으로 과함).

### 성공 기준

**Phase 1 완료 후 개발자 본인이 2주간 중단 없이 사용하는가.** 이것 하나만 본다. 이 기준을 통과하지 못하면 Phase 2 이후는 진행하지 않는다.

### 비목표 (Non-goals)

- 동물병원용 진료 관리 (SaaS 영역, OpenVPMS가 있음)
- 소셜 기능, 공개 피드, 커뮤니티
- 반려동물 SNS / 사진 공유 플랫폼
- 멀티테넌트 상용 서비스 (가구 단위 격리까지만)
- AI 건강 진단 (책임 범위 밖. 이상 "감지" 알림까지만 하고 진단은 하지 않는다)

---

## 2. 설계 원칙

1. **기록은 1탭 안에 끝난다.** 상세 입력은 항상 사후 편집으로 미룬다.
   - → *WORKPLAN §3.7에서 수정됨: "평상시 반복 기록은 1탭, 서술이 필요한 기록은 막지 않는다"*
2. **앱을 열지 않고도 기록할 수 있어야 한다.** NFC, 물리 버튼, 사진 공유가 1급 입력 경로다.
   - → *WORKPLAN §3.6에서 갱신됨: 토큰 인증 REST API가 이 원칙의 답이다. NFC는 보류*
3. **이벤트 스키마는 단일 테이블 + 타입 참조.** 타입별 테이블 분리는 금지 (확장할 때마다 마이그레이션이 생김).
4. **보안은 Phase 1부터.** stash 감사에서 지적된 웹훅 페이로드 인증 / 딥링크 인증 경계 문제를 처음부터 올바르게 설계한다. 나중에 붙이지 않는다.
5. **코드베이스는 영문, 사용자 대면은 한글.** i18n 레이어로 분리.
   - → *WORKPLAN §7.2에서 갱신됨: 공개 전제라 ko/en 동시 작성*

---

## 3. 기술 스택

기존 stash / drop과 동일하게 간다. 재사용 가능한 자산이 많다.

| 레이어 | 선택 |
|---|---|
| API | Fastify (TypeScript) |
| ORM | Prisma |
| DB | PostgreSQL (LXC 내 또는 기존 인스턴스 공유) |
| Web | Next.js (App Router), PWA |
| 리버스 프록시 | Caddy |
| 배포 | Proxmox LXC + Docker Compose |
| 네트워킹 | Tailscale (외부 접근), Caddy (LAN) |
| 파일 저장 | 로컬 볼륨 (사진 첨부) |

### stash에서 재사용 검토 대상

Phase 0에서 실제 코드를 열어보고 재사용 범위를 확정할 것.

- 인증/세션 모듈
- 이미지 업로드 + 썸네일 생성 파이프라인
- HA webhook 연동 모듈 (단, 인증 부분은 재설계)
- Caddy / Compose 배포 스캐폴딩
- 한글 로컬라이제이션 구조

> **완료**: 실사 결과는 WORKPLAN §1.2 (stash) 및 §3.9 (garage) 참조.

---

## 4. 데이터 모델 (초안)

> **주의**: 이 절은 초안이며 WORKPLAN §3.2의 변경표가 우선한다. 확정판 반영은 P0-07.

```prisma
// ---------- 사용자 / 가구 ----------
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  createdAt    DateTime @default(now())

  memberships  HouseholdMember[]
  events       Event[]           @relation("EventCreator")
}

model Household {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())

  members    HouseholdMember[]
  pets       Pet[]
  eventTypes EventType[]
  contacts   Contact[]
  tokens     ApiToken[]
}

model HouseholdMember {
  id          String   @id @default(cuid())
  householdId String
  userId      String
  role        Role     @default(MEMBER)

  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([householdId, userId])
}

enum Role {
  OWNER
  MEMBER
  VIEWER
}

// ---------- 반려동물 ----------
model Pet {
  id            String    @id @default(cuid())
  householdId   String
  name          String
  species       Species
  breed         String?
  sex           Sex?
  neutered      Boolean   @default(false)
  birthDate     DateTime?
  adoptionDate  DateTime?
  registrationNo String?  // 동물등록번호 15자리
  microchipNo   String?
  photoPath     String?
  color         String?
  archivedAt    DateTime?
  sortOrder     Int       @default(0)

  household  Household  @relation(fields: [householdId], references: [id], onDelete: Cascade)
  events     Event[]
  reminders  Reminder[]

  @@index([householdId, archivedAt])
}

enum Species {
  DOG
  CAT
  OTHER
}

enum Sex {
  MALE
  FEMALE
  UNKNOWN
}

// ---------- 이벤트 타입 ----------
// householdId가 null이면 시스템 기본 타입(시드). 사용자는 커스텀 타입 추가 가능.
model EventType {
  id           String   @id @default(cuid())
  householdId  String?
  key          String   // "meal", "water", "poop", "walk", "medication", "vomit", "weight" ...
  label        String   // 표시명 (i18n 키로 대체 가능)
  icon         String
  color        String
  category     EventCategory
  defaultUnit  String?  // "g", "ml", "kg", "min"
  isQuickAction Boolean @default(false)  // 홈 화면 그리드 노출 여부
  sortOrder    Int      @default(0)
  archivedAt   DateTime?

  household Household? @relation(fields: [householdId], references: [id], onDelete: Cascade)
  events    Event[]
  reminders Reminder[]

  @@unique([householdId, key])
}

enum EventCategory {
  FEEDING     // 사료, 간식, 물
  EXCRETION   // 대변, 소변
  ACTIVITY    // 산책, 놀이
  HEALTH      // 투약, 구토, 증상, 체중
  CARE        // 목욕, 발톱, 양치, 미용
  MEDICAL     // 병원 방문, 예방접종, 구충
  NOTE        // 자유 메모
}

// ---------- 이벤트 (핵심) ----------
model Event {
  id           String   @id @default(cuid())
  petId        String
  eventTypeId  String
  occurredAt   DateTime            // 실제 발생 시각 (기본값 = 기록 시각)
  quantity     Decimal? @db.Decimal(10, 2)
  unit         String?
  note         String?
  costKrw      Int?                // 비용 추적 / 보험 청구용
  payload      Json?               // 타입별 확장 필드
  source       EventSource @default(WEB)
  createdById  String?             // 시스템 생성 시 null
  dedupeKey    String?  @unique    // 웹훅 중복 방지
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?

  pet         Pet         @relation(fields: [petId], references: [id], onDelete: Cascade)
  eventType   EventType   @relation(fields: [eventTypeId], references: [id])
  createdBy   User?       @relation("EventCreator", fields: [createdById], references: [id])
  attachments Attachment[]

  @@index([petId, occurredAt(sort: Desc)])
  @@index([petId, eventTypeId, occurredAt(sort: Desc)])
}

enum EventSource {
  WEB
  NFC
  WEBHOOK        // HA, 물리 버튼
  SHARE_TARGET   // PWA 사진 공유
  IMPORT
}

model Attachment {
  id        String   @id @default(cuid())
  eventId   String
  path      String
  mime      String
  size      Int
  width     Int?
  height    Int?
  createdAt DateTime @default(now())

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

// ---------- 리마인더 ----------
model Reminder {
  id           String   @id @default(cuid())
  petId        String
  eventTypeId  String
  label        String
  ruleType     ReminderRule
  intervalDays Int?              // INTERVAL: 심장사상충 30일, 구충 90일
  fixedDate    DateTime?         // FIXED: 특정 일자
  nextDueAt    DateTime
  lastEventId  String?
  active       Boolean  @default(true)

  pet       Pet       @relation(fields: [petId], references: [id], onDelete: Cascade)
  eventType EventType @relation(fields: [eventTypeId], references: [id])

  @@index([petId, active, nextDueAt])
}

enum ReminderRule {
  INTERVAL       // 마지막 이벤트로부터 N일 후
  FIXED          // 고정 일자
  VACCINE_SERIES // 접종 차수 프리셋 (Phase 4)
}

// ---------- 연락처 ----------
model Contact {
  id          String   @id @default(cuid())
  householdId String
  type        ContactType
  name        String
  phone       String?
  address     String?
  note        String?
  isFavorite  Boolean  @default(false)

  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
}

enum ContactType {
  VET
  GROOMER
  SITTER
  PHARMACY
  OTHER
}

// ---------- API 토큰 (NFC / 웹훅 인증) ----------
model ApiToken {
  id          String   @id @default(cuid())
  householdId String
  name        String            // "현관 NFC", "HA 급식기"
  tokenHash   String   @unique  // 원문은 저장하지 않음
  scopes      String[]          // ["event:create"]
  petId       String?           // 특정 반려동물로 스코프 제한
  eventTypeId String?           // 특정 이벤트 타입으로 스코프 제한
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  revokedAt   DateTime?
  createdAt   DateTime @default(now())

  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
}
```

### 모델 관련 결정 사항

- `Event.payload`는 타입별 확장용이지만 **쿼리 대상이 되는 필드는 절대 payload에 넣지 않는다.** 그래프/집계에 쓰이는 값은 `quantity`/`unit`/`costKrw` 컬럼으로 승격.
- 체중은 별도 테이블이 아니라 `eventType.key = "weight"` + `quantity` 이벤트로 처리한다.
- 병원 방문은 `MEDICAL` 카테고리 이벤트 + `payload: { diagnosis, vetContactId, prescription }` + `costKrw` + 영수증 `Attachment`.
  - → *WORKPLAN §3.9에서 수정됨: `vetContactId`는 쿼리 대상이므로 `Event.contactId` 컬럼으로 승격*
- 소프트 삭제(`deletedAt`)를 쓴다. 오입력 복구가 실사용에서 자주 필요하다.

---

## 5. 입력 경로 설계

이 프로젝트의 전부다. 모든 경로를 같은 API 엔드포인트(`POST /api/events`)로 수렴시킨다.

> **갱신됨**: 확정된 입력 경로 포트폴리오와 Phase 배치는 WORKPLAN §3에 있다. 아래는 원 초안이다.

### 5.1 웹 원탭 그리드 (Phase 1)

- 홈 화면 = 입력 화면. 반려동물 탭 + 퀵액션 타일 그리드.
  - → *WORKPLAN §3.7에서 수정됨: 홈 = 타임라인 + 하단 입력 바(채팅형), 퀵 칩은 하단*
- 타일 1탭 → `occurredAt = now()`로 즉시 저장 → 토스트에 "실행 취소" / "상세 입력" 버튼 3초 노출.
- 길게 누르기 → 시각/수량/메모 입력 시트.
- 오프라인 큐: 네트워크 실패 시 IndexedDB에 적재 후 재전송.

### 5.2 NFC 태그 (Phase 2)

> **보류됨** — WORKPLAN §3.4의 트리거 충족 시에만 재검토. 시나리오 검증에서 1순위인 경우가 없었다.

- 태그에 `https://kibble.<domain>/t/<tagId>` 기록. 사료통, 화장실, 현관, 약통 옆에 부착.
- 폰으로 태그 → 브라우저 열림 → 세션 있으면 즉시 기록 + 결과 화면.
- **인증 경계 주의**: 태그 URL 자체는 비밀이 아니다(누구나 태그를 읽을 수 있음). 반드시 **로그인 세션을 요구**하고, 태그 ID는 "무엇을 기록할지"만 지정한다. 태그 URL에 토큰을 박아 인증을 대체하면 stash QR 딥링크와 같은 문제가 재발한다.

### 5.3 HA Webhook / 물리 버튼 (Phase 2)

> **Phase 1로 이동 + 재설계됨** — WORKPLAN §3.6. 별도 라우트 대신 `POST /api/events`가 세션과 ApiToken을 모두 받는다.

- 인증: `Authorization: Bearer <token>` (ApiToken, 해시 저장, 스코프 제한). **평문 공유 시크릿을 페이로드에 넣지 않는다.**
- 페이로드에 `dedupeKey`(예: `ha-<entity>-<timestamp>`)를 포함해 재시도 중복을 차단.
- Zigbee 버튼, 자동급식기, 급수기 이벤트를 수집.
- 역방향: `GET /api/ha/states`로 "오늘 약 미투여" 등을 HA 센서로 노출.

### 5.4 PWA Web Share Target (Phase 2)

- drop에서 만든 구조 재사용.
- 갤러리에서 사진 공유 → kibble → 반려동물/타입 선택 화면(기본값 미리 채움) → 저장.
- 구토/배변 사진은 진료 시 실제 근거 자료가 된다.

### 5.5 중복 방지 (Phase 2)

- 급여/투약 계열 타입은 저장 직전에 최근 N분 내 동일 타입 이벤트를 조회.
- 있으면 확정 저장 전에 경고: "30분 전 <이름>님이 기록했습니다. 그래도 기록할까요?"
- 다묘/다견 가정, 부부 공동 양육에서 이중 급여가 실제로 자주 발생한다.

---

## 6. 아키텍처

```
[모바일 PWA] ──┐
[외부 자동화]──┤   (HA · 물리버튼 · 단축어 · 스크립트)
[공유 타겟]  ──┼──> Caddy (TLS) ──> Fastify API ──> PostgreSQL
[기기/센서] ──┘                        │
                                       └──> 로컬 볼륨 (사진)

배포: Proxmox LXC + Docker Compose
외부 접근: Tailscale
```

- Next.js는 API와 분리 배포하되 같은 도메인 하위 경로로 Caddy가 라우팅.
- 백업: `pg_dump` + 사진 볼륨 스냅샷. Phase 3에서 자동화.

---

## 7. 로드맵

> **갱신됨**: 확정된 WBS와 Phase 배치는 WORKPLAN §4~§6에 있다. 아래는 원 초안의 골격이다.

### Phase 0 — 스펙 확정 (코드 없음)

**목표: 실물/실사용 기반으로 가정을 검증한다.**

Phase 0 산출물: 이 문서의 §4 스키마 확정판 + 시드 데이터 목록 + 재사용 모듈 목록.

### Phase 1 — 코어 MVP

**게이트: 여기서 멈추고 2주간 실사용. 계속 쓰이지 않으면 Phase 2로 넘어가지 않고 입력 UX를 다시 판다.**

### Phase 2 — 무마찰 입력

### Phase 3 — 인사이트

체중 추세, 음수량/사료량 추세, 이상 감지 알림(**진단 문구는 쓰지 않고 "수의사 상담 권장"까지만**), 리마인더 엔진, 캘린더 뷰, 비용 집계, 백업 자동화.

### Phase 4 — 한국 특화

- 동물등록번호 필드 + 검증
- 국내 표준 백신 스케줄 프리셋
  - 개: DHPPL, 코로나, 켄넬코프, 인플루엔자, 광견병 (차수 포함)
  - 고양이: 3종 종합, 백혈병, 광견병
- 병원 방문용 요약 PDF (최근 2주 타임라인 + 체중 그래프 1장)
- 펫보험 청구 묶음 내보내기 (진료 이벤트 + 영수증 + 진단명 + 금액)
- 공공데이터포털 동물병원 데이터 연동 검토 (LOCALDATA 인허가 데이터, 주소 기반 병원 검색 → Contact 자동 생성)
- i18n (ko 기본, en 지원) — *WORKPLAN §7.2에서 Phase 1로 이동*

### Phase 5 — 공개 준비

보안 감사(stash 감사 항목 전체 재점검: 웹훅 인증, 딥링크 인증 경계, 파일 업로드 검증, 가구 간 데이터 격리), 데이터 내보내기/가져오기, 원클릭 배포 문서, Proxmox LXC 헬퍼 스크립트, README·스크린샷·라이선스.

---

## 8. 저장소 구조

```
kibble/
├── PROJECT.md
├── WORKPLAN.md
├── CLAUDE.md
├── README.md
├── docker-compose.yml
├── Caddyfile
├── apps/
│   ├── api/                 # Fastify
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── plugins/          # auth, prisma, upload
│   │   │   ├── services/
│   │   │   └── server.ts
│   │   └── package.json
│   └── web/                 # Next.js App Router + PWA
│       ├── app/
│       │   ├── (app)/            # 인증 필요 영역
│       │   └── share/            # Web Share Target
│       ├── public/manifest.json
│       └── package.json
├── packages/
│   ├── db/                  # Prisma schema, migrations, seed
│   └── shared/              # 타입, zod 스키마, 상수
└── docs/
```

---

## 9. 에이전트 작업 지침

이 저장소에서 작업하는 에이전트는 다음을 따를 것. **전체 규약은 [`WORKPLAN.md`](WORKPLAN.md) §9 (K-1~K-16), 작업 시작 절차는 [`CLAUDE.md`](CLAUDE.md).**

1. **Phase 0이 끝나기 전에는 애플리케이션 코드를 작성하지 않는다.** Phase 0 체크리스트 항목은 사람이 실물/실사용으로 확인해야 하는 것들이다.
2. **Phase는 순서대로.** Phase 1 게이트(2주 실사용)를 통과하기 전에 Phase 2 기능을 미리 만들지 않는다. 기능을 늘려서 실패하는 게 이 카테고리의 전형적인 실패 모드다.
3. **모든 이벤트 생성은 하나의 서비스 함수를 통과한다.** 웹/자동화/공유 경로가 각자 Prisma를 직접 호출하면 중복 방지와 검증이 흩어진다.
4. **인증을 나중으로 미루지 않는다.** 토큰 엔드포인트를 만드는 커밋에 토큰 검증이 함께 들어간다.
5. **커밋 단위는 기능 단위로 작게.** `feat:`, `fix:`, `chore:`, `docs:` 접두사 사용.
6. **스키마 변경은 항상 마이그레이션 파일로.** `prisma db push`는 로컬 실험에서만.
7. 새 이벤트 타입 추가는 코드 변경이 아니라 **데이터 추가**여야 한다. 만약 코드를 고쳐야 한다면 모델 설계가 잘못된 것이므로 멈추고 재검토.

---

## 10. 미해결 질문

> **대부분 해소됨** — 확정 사항은 WORKPLAN §7, 의도적으로 열어둔 것은 §7.10.

| 원 질문 | 상태 |
|---|---|
| iOS Safari에서 NFC 태그 → 세션 유지? | **소멸** — NFC 보류, 앱 내 경로가 1급 (WORKPLAN §3.4) |
| 퀵액션 타일이 8개를 넘으면? | **확정** — 시작 3개 + 더보기, 자동 정렬은 Phase 2 (§3.8, §7.7) |
| 다묘 가정의 "누가 먹었는지 모르는" 이벤트 | **보류** — `Event.petId`는 NOT NULL 유지, Phase 4 재검토 (§7.1) |
| PostgreSQL 신규 vs 기존 공유 | **확정** — 신규 (§7.7) |
| 알림 경로: 웹 푸시 vs HA 위임 | **확정** — 웹 푸시, Phase 3 (§7.3) |
