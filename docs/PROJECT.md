# kibble

셀프호스트 반려동물 일지. 입력 마찰을 0에 가깝게 만드는 것이 유일한 설계 목표.

- 저장소: `eigger/kibble`
- 배포 대상: Proxmox LXC (기존 홈랩 환경)
- 상태: **Phase 1 구현 완료** — 실사용 게이트 진행 중 (앱 버전 **0.1.0**)

> **이 문서는 원 스펙이다.** 이후 조사·검증으로 확정된 변경과 실행 계획은 [`WORKPLAN.md`](WORKPLAN.md)에 있으며, 충돌 시 **WORKPLAN이 우선**한다. 특히 §4 스키마와 §5 입력 경로는 이미 여러 항목이 갱신됐다(WORKPLAN §3.2 변경표 참조). §4 스키마 확정판 반영(P0-07)은 진행 중이며, 구현·배포 현황은 WORKPLAN·[`deploy.md`](deploy.md)를 본다.

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

## 4. 데이터 모델 (확정판)

> **P0-07 완료.** WORKPLAN §3.2의 변경표가 이 절에 반영됐다. 이후 변경은 이 문서와 WORKPLAN을 **함께** 고친다.
>
> Phase 1 마이그레이션은 **Phase 2에서 쓸 테이블까지 한 번에 만든다** — `PresetCode`, `Contact`(좌표 포함), `MedicationCourse`, `ApiToken`. UI 없는 테이블이 있는 건 정상이며, 나중 마이그레이션을 회피하기 위한 의도적 선택이다.

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

  members     HouseholdMember[]
  pets        Pet[]
  eventTypes  EventType[]
  presets     Preset[]
  presetCodes PresetCode[]
  contacts    Contact[]
  courses     MedicationCourse[]
  tokens      ApiToken[]
  events      Event[]
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
  presets    Preset[]
  reminders  Reminder[]
  courses    MedicationCourse[]

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
//
// 주의: 아래 @@unique([householdId, key])는 시스템 행(householdId = null)에는
// 걸리지 않는다 — PostgreSQL은 UNIQUE에서 NULL을 서로 구별되는 값으로 취급한다.
// 시드를 두 번 돌리면 (NULL, 'meal')이 조용히 중복된다. 초기 마이그레이션에
// 부분 유니크 인덱스를 raw SQL로 추가하고, 시드는 upsert가 아니라
// findFirst → create로 쓴다 (seed-event-types.md §1.1):
//   CREATE UNIQUE INDEX "EventType_system_key_key"
//     ON "EventType" ("key") WHERE "householdId" IS NULL;
model EventType {
  id           String   @id @default(cuid())
  householdId  String?
  key          String   // "meal", "water", "poop", "walk", "medication", "vomit", "weight" ...
  label        String   // 표시명 (i18n 키로 대체 가능)
  icon         String
  color        String
  category     EventCategory
  defaultUnit  String?  // "g", "ml", "kg", "min"
  // null이면 전 종 공통. 종 특화 타입 확장이 "데이터 추가"로 끝나게 한다.
  species      Species?
  // 가정 내 은어 매칭용 ("감자"→소변, "맛동산"→대변). 자유 텍스트 파싱이 참조한다.
  aliases      String[]
  // 이 타입이 쓰는 표준 척도. 초보 보호자는 서술을 못 하지만 단계는 고를 수 있다.
  scaleType    ScaleType?
  sortOrder    Int      @default(0)
  archivedAt   DateTime?

  household Household? @relation(fields: [householdId], references: [id], onDelete: Cascade)
  events    Event[]
  presets   Preset[]
  reminders Reminder[]

  @@unique([householdId, key])
}

// 범용 정수 척도. 대변 굳기 1~7, 식욕·활력 1~3을 Event.scaleValue 컬럼 하나로 표현한다.
// payload에 넣지 않는 이유는 추세 그래프의 대상이기 때문.
enum ScaleType {
  FECAL_7      // 대변 굳기 1~7
  APPETITE_3   // 식욕: 평소대로 / 줄었음 / 거의 안 먹음
  ENERGY_3     // 활력: 평소대로 / 처짐 / 많이 처짐
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

// ---------- 프리셋 (입력의 축) ----------
// "무엇을 기록할지"를 미리 굳혀둔 것. 홈 퀵 칩이자 빠른 기록 항목이며,
// 트리거 충족 시 인쇄 라벨의 대상이 된다. 표면이 여럿이고 실체는 하나다.
// EventType.isQuickAction을 대체한다 — 다묘에서 "A 사료"와 "B 사료"는
// 서로 다른 타일이어야 하는데 타입 플래그로는 표현할 수 없다.
model Preset {
  id          String   @id @default(cuid())
  householdId String
  petId       String?          // null = 현재 선택된 반려동물에 적용(홈 칩)
                               // 지정 = 대상이 확정된 프리셋(인쇄 라벨용)
  eventTypeId String
  label       String           // "사료 50g"
  quantity    Decimal? @db.Decimal(10, 2)
  unit        String?
  note        String?
  // 온보딩 직후 노출할 3개. 나머지는 "더보기" 뒤.
  // 둘째 반려동물 등록 시에는 항상 false로 넣는다 — 아니면 시작 칩이 6개가 된다.
  isStarter   Boolean  @default(false)
  sortOrder   Int      @default(0)
  hiddenAt    DateTime?        // 칩 길게 누르기 → 숨기기
  archivedAt  DateTime?
  createdAt   DateTime @default(now())

  household Household   @relation(fields: [householdId], references: [id], onDelete: Cascade)
  pet       Pet?        @relation(fields: [petId], references: [id], onDelete: Cascade)
  eventType EventType   @relation(fields: [eventTypeId], references: [id])
  codes     PresetCode[]
  events    Event[]
  tokens    ApiToken[]

  // 활성 행만 유니크 — 부분 인덱스 `Preset_householdId_petId_eventTypeId_active_key`
  @@index([householdId, archivedAt, sortOrder])
}

// 가구별 파싱 별칭 — 시스템 EventType 행을 복제하지 않는다.
model EventTypeAlias {
  id           String   @id @default(cuid())
  householdId  String
  eventTypeKey String   // 시스템 EventType.key
  aliases      String[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  @@unique([householdId, eventTypeKey])
}

// 하나의 프리셋에 여러 코드를 붙인다 (stash의 Item:Barcode와 같은 모양).
// Phase 1에는 행이 생기지 않는다 — 모델만 미리 둬서 Phase 2(제품 바코드)와
// 인쇄 QR 복원이 마이그레이션 없이 끝나게 한다.
model PresetCode {
  id          String   @id @default(cuid())
  presetId    String
  // 가구 내에서만 유니크하다. 전역 유니크는 틀렸다 — 두 가구가 같은 사료 EAN을 쓴다.
  householdId String
  value       String
  symbology   CodeSymbology @default(QR)
  source      CodeSource    @default(GENERATED)
  revokedAt   DateTime?
  lastUsedAt  DateTime?
  createdAt   DateTime @default(now())

  preset    Preset    @relation(fields: [presetId], references: [id], onDelete: Cascade)
  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  @@unique([householdId, value])
  @@index([presetId, revokedAt])
}

enum CodeSymbology {
  QR
  EAN13
  UPCA
  CODE128
  OTHER
}

enum CodeSource {
  GENERATED  // 우리가 발급해 인쇄한 QR (보류 — 트리거 충족 시)
  PRODUCT    // 제품 포장의 기존 바코드 (Phase 2)
}

// ---------- 이벤트 (핵심) ----------
model Event {
  id           String   @id @default(cuid())
  householdId  String              // K-1·dedupeKey 가구 스코프. pet.householdId와 동기화(createEvent 책임).
  petId        String              // NOT NULL 유지. 공용 이벤트를 위해 미리 nullable로 열지
                                   // 않는다 — 모든 쿼리·인덱스·가구 격리 검사가 분기로 오염된다.
  eventTypeId  String
  presetId     String?             // 어느 경로로 들어왔는지. 게이트에서 경로별 비중을 본다.
  occurredAt   DateTime            // 실제 발생 시각. 실사용에서는 기록 시각과 다른 게 기본이다
                                   // (밤에 아침 일을 적는다) — now() 기본값에 기대지 않는다.
  // quantity는 "섭취량". 급여는 제공량과 섭취량이 다르고 실사용자는 둘 다 적는다
  // ("100g 줬는데 30g 먹음"). 둘 다 추세 그래프 대상이라 payload가 아닌 컬럼이다.
  quantity        Decimal? @db.Decimal(10, 2)
  quantityOffered Decimal? @db.Decimal(10, 2)
  unit            String?
  // 표준 척도 값 (EventType.scaleType이 의미를 정한다). 초보 보호자용 입력 경로.
  scaleValue   Int?
  note         String?
  costKrw      Int?                // 비용 추적 / 보험 청구용
  contactId    String?             // 병원 등. payload가 아닌 컬럼 — "이 병원 방문 이력",
                                   // "병원별 비용"이 쿼리돼야 한다.
  medicationCourseId String?       // 복약 이벤트가 어느 처방 과정에 속하는지
  payload      Json?               // 타입별 확장 필드 (쿼리 대상이 아닌 것만)
  // 사용자가 쓴 원문. 파싱해서 구조를 얻더라도 절대 버리지 않는다 —
  // 오파싱이 복구 가능해야 하고, 파싱 실패는 NOTE로 흡수된다.
  rawText      String?
  entryId      String?             // 한 번에 쓴 글에서 나온 여러 이벤트를 묶는다
  needsReview  Boolean  @default(false)  // 파싱 제안을 아직 확인받지 않음
  source       EventSource @default(WEB)
  createdById  String?             // 시스템 생성 시 null
  updatedById  String?             // 마지막으로 고친 사람. 생성 직후엔 createdById와 같다.
                                   // PATCH 때마다 세션 사용자로 갱신 — "누가 마지막으로 고쳤는지"
                                   // 표시용(상세 화면 "{이름} · {날짜} 수정"). 계정 삭제 시 SetNull.
  dedupeKey    String?             // 외부 자동화 재시도 중복 방지. @@unique([householdId, dedupeKey])
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?

  pet         Pet               @relation(fields: [petId], references: [id], onDelete: Cascade)
  household   Household         @relation(fields: [householdId], references: [id], onDelete: Cascade)
  eventType   EventType         @relation(fields: [eventTypeId], references: [id])
  preset      Preset?           @relation(fields: [presetId], references: [id], onDelete: SetNull)
  contact     Contact?          @relation(fields: [contactId], references: [id], onDelete: SetNull)
  course      MedicationCourse? @relation(fields: [medicationCourseId], references: [id], onDelete: SetNull)
  createdBy   User?             @relation("EventCreator", fields: [createdById], references: [id])
  updatedBy   User?             @relation("EventEditor", fields: [updatedById], references: [id], onDelete: SetNull)
  attachments Attachment[]

  @@index([petId, occurredAt(sort: Desc)])
  @@index([petId, eventTypeId, occurredAt(sort: Desc)])
  @@index([medicationCourseId])
  @@index([entryId])
  @@unique([householdId, dedupeKey])
}

enum EventSource {
  WEB
  QUICK          // 빠른 기록 경량 화면
  SCAN           // 제품 바코드 (Phase 2)
  API            // 토큰 인증 외부 자동화 — 물리 버튼, 급식기, 단축어, 스크립트
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
  // 영상 목록용 대표 프레임 JPEG (업로드 시 ffmpeg로 1프레임 추출).
  // 목록이 <img>로 이걸 쓰면 타임라인이 영상 바이트를 받지 않는다.
  // 이 컬럼 이전 영상과 ffmpeg 없는 설치에서는 null — 그때는 <video>로 되돌아간다.
  posterPath String?
  // 영상 백그라운드 720p 변환. pending/processing/skipped/ready/failed. 사진은 null.
  transcodeStatus String?
  createdAt DateTime @default(now())

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

// ---------- 투약 과정 ----------
// 처방 1건 = 과정 1개. 복약 자체는 별도 테이블을 만들지 않는다 —
// 그냥 Event(eventType.key = "medication") + medicationCourseId 참조다 (§2-3 단일 테이블).
// 남은 수량도 컬럼으로 두지 않는다: totalDoses - 연결된 이벤트 수로 유도한다.
// 카운터를 따로 두면 소프트삭제·오기록 정정 후 반드시 어긋난다.
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
  createdAt   DateTime  @default(now())

  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  pet       Pet       @relation(fields: [petId], references: [id], onDelete: Cascade)
  contact   Contact?  @relation(fields: [contactId], references: [id], onDelete: SetNull)
  events    Event[]

  @@index([householdId, petId, archivedAt])
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
  lastEvent Event?    @relation("ReminderLastEvent", fields: [lastEventId], references: [id], onDelete: SetNull)

  @@index([petId, active, nextDueAt])
}

enum ReminderRule {
  INTERVAL       // 마지막 이벤트로부터 N일 후
  FIXED          // 고정 일자
  VACCINE_SERIES // 접종 차수 프리셋 (Phase 4)
}

// ---------- 연락처 ----------
// 좌표는 이벤트가 아니라 Contact에 붙인다 — 동물병원은 단골이 있고 재방문한다.
// (garage는 정비 기록에 직접 박는데, 정비소는 매번 다를 수 있어서다.)
model Contact {
  id          String   @id @default(cuid())
  householdId String
  type        ContactType
  name        String
  phone       String?
  address     String?
  latitude    Float?
  longitude   Float?
  placeUrl    String?            // 지도 서비스의 장소 상세 URL
  note        String?
  isFavorite  Boolean  @default(false)

  household Household          @relation(fields: [householdId], references: [id], onDelete: Cascade)
  events    Event[]
  courses   MedicationCourse[]
}

enum ContactType {
  VET
  GROOMER
  SITTER
  PHARMACY
  OTHER
}

// ---------- API 토큰 (외부 자동화 인증) ----------
// 특정 연동을 구현하지 않고 이 토큰으로 열리는 API 하나만 둔다.
// HA·물리버튼·ESPHome·단축어·Node-RED·curl이 전부 같은 문으로 들어온다.
model ApiToken {
  id          String   @id @default(cuid())
  householdId String
  name        String            // "사료통 버튼", "자동급식기"
  tokenHash   String   @unique  // 원문은 저장하지 않음. 발급 시 1회만 노출.
  scopes      String[]          // Phase 1은 ["event:create"]만
  // 프리셋에 묶으면 본문 없는 POST 한 줄로 기록된다 — 단순한 기기가 붙기 쉬워야 한다.
  presetId    String?
  petId       String?           // 특정 반려동물로 스코프 제한
  eventTypeId String?           // 특정 이벤트 타입으로 스코프 제한
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  revokedAt   DateTime?
  createdAt   DateTime @default(now())

  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  preset    Preset?   @relation(fields: [presetId], references: [id], onDelete: SetNull)
  pet       Pet?      @relation(fields: [petId], references: [id], onDelete: SetNull)
  eventType EventType? @relation(fields: [eventTypeId], references: [id], onDelete: SetNull)
}
```

### 모델 관련 결정 사항

- `Event.payload`는 타입별 확장용이지만 **쿼리 대상이 되는 필드는 절대 payload에 넣지 않는다.** 그래프·집계에 쓰이는 값은 컬럼으로 승격한다 — `quantity`, `quantityOffered`, `scaleValue`, `costKrw`, `contactId`, `medicationCourseId`.
- 체중은 별도 테이블이 아니라 `eventType.key = "weight"` + `quantity` 이벤트로 처리한다.
- 병원 방문은 `MEDICAL` 카테고리 이벤트 + `contactId`(병원) + `costKrw` + 영수증 `Attachment`. 진단명·처방 내용처럼 **쿼리하지 않는** 값만 `payload`에 남긴다.
- 복약은 `Event` + `medicationCourseId`다. **복약 전용 테이블을 만들지 않는다.**
- **남은 약 수량은 컬럼이 아니라 유도값이다** (`totalDoses` − 연결 이벤트 수). 카운터를 두면 소프트삭제·정정 후 어긋난다.
- 소프트 삭제(`deletedAt`)를 쓴다. 오입력 복구가 실사용에서 자주 필요하다.
- **`rawText`는 어떤 경우에도 버리지 않는다.** 파싱은 구조를 얻기 위한 것이고, 실패하면 `NOTE`로 흡수한다 — 사용자가 쓴 것을 앱이 되돌려보내면 안 된다.
- **`PresetCode.value`는 `@@unique([householdId, value])`다.** 전역 유니크는 다중 테넌트에서 틀렸다 — 두 가구가 같은 제품 바코드를 쓴다. (stash가 전역 유니크로 마이그레이션한 이력이 있으니 복사하지 말 것.)
- **`Event.dedupeKey`도 가구 스코프다** — `@@unique([householdId, dedupeKey])`. HA가 넣는 `ha-<entity>-<timestamp>` 형식은 가구 간 충돌할 수 있다.

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
├── README.md
├── CLAUDE.md
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
    ├── PROJECT.md           # 제품 스펙
    ├── WORKPLAN.md          # 작업 계획 · WBS
    ├── WORKLOG.md           # 작업 이력 + 기각된 안
    ├── deploy.md
    ├── api.md
    └── scenarios.md
```

---

## 9. 에이전트 작업 지침

이 저장소에서 작업하는 에이전트는 다음을 따를 것. **전체 규약은 [`WORKPLAN.md`](WORKPLAN.md) §9 (K-1~K-16), 작업 시작 절차는 [`CLAUDE.md`](../CLAUDE.md).**

1. **Phase 0 스펙 확정은 끝났다.** 이후 작업은 Phase 1 구현·게이트·배포 문서를 따른다. 스펙 문서(이 파일)와 구현이 어긋나면 WORKPLAN을 먼저 갱신한다.
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
