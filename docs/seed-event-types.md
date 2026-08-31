# EventType 시드 + 종별 프리셋 템플릿 (P0-02)

- 작성일: 2026-08-31
- 상태: **에이전트 초안 — 리뷰 필요**
- 근거: [`WORKPLAN.md`](../WORKPLAN.md) §3.2·§3.3·§3.8, [`PROJECT.md`](../PROJECT.md) §4, [`docs/scenarios.md`](scenarios.md)
- 원칙: **개인 사용 패턴이 아니라 공개 배포용 일반 기본값** (§7.2). P0-01 실측으로 프리셋 수량·기본 수량은 조정 가능.

---

## 1. 시드 구조

| 계층 | `householdId` | 생성 시점 | 비고 |
|---|---|---|---|
| **시스템 EventType** | `null` | `prisma db seed` (최초 배포) | 모든 가구가 공유 |
| **가구 EventType** | 가구 ID | 사용자가 설정에서 추가 | K-8: 코드 변경 없이 데이터 추가 |
| **Preset** | 가구 ID | **반려동물 등록 직후** | 종(`Pet.species`)에 맞는 템플릿에서 복사 |

### 1.1 시스템 행의 유니크 제약 — `@@unique([householdId, key])`로는 부족하다

**PostgreSQL은 UNIQUE 인덱스에서 NULL을 서로 구별되는 값으로 취급한다.** 따라서 `householdId = null`인 시스템 행에는 `@@unique([householdId, key])`가 **적용되지 않는다.** 이대로 두면:

- `prisma db seed`를 두 번 실행하면 `(NULL, 'meal')`이 중복 삽입되고 **오류도 나지 않는다** (배포 스크립트 재실행, 컨테이너 재기동 시 seed 포함, 개발 중 반복 실행에서 실제로 발생)
- 이후 §5의 key → `eventTypeId` resolve가 비결정적이 되어 홈 퀵 칩에 같은 타입이 두 번 뜬다
- Prisma의 `upsert`는 **복합 unique의 구성 요소가 NULL이면 `where`에 그 unique 입력을 넘길 수 없어** 실행 자체가 불가능하다

**대응 (P1-03 초기 마이그레이션에 포함)**

1. `@@unique([householdId, key])`는 가구 커스텀 타입용으로 유지한다.
2. 시스템 행 전용 **부분 유니크 인덱스**를 raw SQL로 추가한다. Prisma 스키마 문법으로는 표현할 수 없으므로 마이그레이션 파일에 직접 쓴다:

```sql
CREATE UNIQUE INDEX "EventType_system_key_key"
  ON "EventType" ("key")
  WHERE "householdId" IS NULL;
```

3. 시드는 **`upsert`가 아니라 `findFirst` → 없으면 `create`**로 쓴다.

`PresetCode`는 `householdId`가 NOT NULL이라 이 문제가 없다.

**i18n**: DB `label`은 시드 키(`eventType.meal` 등)를 저장하고, UI는 [`apps/web/lib/i18n/translations.ts`](../apps/web/lib/i18n/translations.ts)에서 ko/en을 렌더한다. 시드 스크립트는 키 문자열만 넣는다.

**아이콘·색**: Lucide 아이콘 이름 + Tailwind 색 토큰. Phase 1 UI에서 매핑 테이블로 해석한다.

---

## 2. 시스템 EventType 목록

`sortOrder`는 타임라인 필터·설정 목록 순서. **8개 이하 프리셋** 원칙(§4 Phase 0 P0-01)과 별개로, 타입 자체는 NOTE·커스텀 확장 여지를 위해 더 둔다. **홈 퀵 칩은 Preset `isStarter` + `sortOrder`로만 노출**한다.

### 2.1 전 종 공통

| key | label (i18n 키) | icon | color | category | defaultUnit | scaleType | sortOrder | 비고 |
|---|---|---|---|---|---|---|---|---|
| `meal` | `eventType.meal` | `utensils` | `amber` | FEEDING | `g` | — | 10 | 사료·습식·건식 |
| `water` | `eventType.water` | `droplet` | `sky` | FEEDING | `ml` | — | 20 | 급수·정수기 |
| `treat` | `eventType.treat` | `cookie` | `orange` | FEEDING | — | — | 30 | 간식 |
| `poop` | `eventType.poop` | `circle-dot` | `amber-900` | EXCRETION | — | **FECAL_7** | 40 | 대변. Phase 1 척도 UI 대상 |
| `pee` | `eventType.pee` | `droplets` | `yellow` | EXCRETION | — | — | 50 | 소변 |
| `vomit` | `eventType.vomit` | `frown` | `rose` | HEALTH | — | — | 60 | 구토·역류 |
| `medication` | `eventType.medication` | `pill` | `violet` | HEALTH | — | — | 70 | 투약·영양제 |
| `weight` | `eventType.weight` | `scale` | `slate` | HEALTH | `kg` | — | 80 | 체중 |
| `symptom` | `eventType.symptom` | `stethoscope` | `red` | HEALTH | — | — | 90 | 기침·통증 등. `scaleType`은 Phase 2 |
| `play` | `eventType.play` | `gamepad-2` | `green` | ACTIVITY | `min` | — | 100 | 놀이 |
| `grooming` | `eventType.grooming` | `scissors` | `pink` | CARE | — | — | 110 | 빗질·발톱·양치 |
| `vet_visit` | `eventType.vet_visit` | `hospital` | `blue` | MEDICAL | — | — | 120 | 병원·응급 |
| `vaccination` | `eventType.vaccination` | `syringe` | `indigo` | MEDICAL | — | — | 130 | 예방접종·구충 |
| `note` | `eventType.note` | `sticky-note` | `gray` | NOTE | — | — | 999 | 파싱 실패·자유 메모 폴백 (K-12) |

### 2.2 종 특화 (`species` 컬럼)

| key | label (i18n 키) | species | icon | color | category | defaultUnit | sortOrder |
|---|---|---|---|---|---|---|---|
| `walk` | `eventType.walk` | DOG | `footprints` | `lime` | ACTIVITY | `min` | 95 |
| `litter_change` | `eventType.litter_change` | CAT | `box` | `stone` | CARE | — | 115 |

> `symptom`에 `APPETITE_3` / `ENERGY_3`는 Phase 2 UI까지 **`scaleType` null 유지**. 스키마·i18n 키만 Phase 1에 준비 (`eventType.appetite`, `eventType.energy`는 Phase 2 시드 추가).

### 2.3 시스템 기본 aliases (가구 생성 시 복사)

은어는 가구마다 다르다. 시드는 **누구에게나 통하는 일반 한국어 키워드**만 넣고, 사용자가 설정에서 수정한다. 파서는 `EventType.aliases` + 프리셋 `label`을 함께 본다.

**커뮤니티 은어는 시드에 넣지 않는다.** "감자"(소변 덩어리)·"맛동산"(대변) 같은 표현은 국내 반려묘 커뮤니티에서 널리 쓰이지만 특정 집단의 말이고, 개를 키우는 가구에서는 오탐을 유발한다. §6·§7의 "공개 저장소에 개인·가정 패턴을 넣지 않는다" 원칙과도 어긋난다. 대신 **설정 화면에서 "추가할 만한 별칭" 후보로 제시**하고 사용자가 고르게 한다 (Phase 2).

| key | aliases (ko, 제안) |
|---|---|
| `meal` | `밥`, `사료`, `급여`, `먹이` |
| `water` | `물`, `급수`, `정수` |
| `treat` | `간식`, `츄르`, `스낵` |
| `poop` | `대변`, `똥`, `변`, `응가` |
| `pee` | `소변`, `쉬`, `오줌` |
| `vomit` | `구토`, `토`, `역류` |
| `medication` | `약`, `투약`, `복약` |
| `weight` | `체중`, `몸무게` |
| `walk` | `산책`, `산책함` |
| `vet_visit` | `병원`, `진료`, `검진` |

---

## 3. i18n 키 (ko / en)

Phase 1 `translations.ts`에 **동시 추가** (K-9).

| 키 | ko | en |
|---|---|---|
| `eventType.meal` | 사료 | Meal |
| `eventType.water` | 물 | Water |
| `eventType.treat` | 간식 | Treat |
| `eventType.poop` | 대변 | Stool |
| `eventType.pee` | 소변 | Urine |
| `eventType.vomit` | 구토 | Vomit |
| `eventType.medication` | 투약 | Medication |
| `eventType.weight` | 체중 | Weight |
| `eventType.symptom` | 증상 | Symptom |
| `eventType.play` | 놀이 | Play |
| `eventType.grooming` | 그루밍 | Grooming |
| `eventType.walk` | 산책 | Walk |
| `eventType.litter_change` | 모래갈이 | Litter change |
| `eventType.vet_visit` | 병원 | Vet visit |
| `eventType.vaccination` | 접종 | Vaccination |
| `eventType.note` | 메모 | Note |

### 3.1 프리셋 라벨은 무엇을 저장하는가 — 확정

한글 문자열을 그대로 넣으면 en 로케일 사용자가 첫 실행부터 `사료`·`물`·`대변`을 보게 되어 K-9(ko/en 동시 제공)와 P1-28 완료 조건("en 미번역 키 0건")을 위반한다. 공개 배포가 전제(§7.2)이므로 실제로 발생하는 경로다. 따라서:

| 출처 | `Preset.label`에 들어가는 값 | 렌더링 |
|---|---|---|
| **시드 템플릿** (§4.2~4.4) | i18n 키 — 해당 `EventType`의 키를 그대로 (`eventType.meal`) | 사전에서 ko/en 해석 |
| **사용자 생성·수정** | 사용자가 입력한 리터럴 (`저녁 사료 50g`) | 그대로 표시 |

**판별 규칙**: `label`이 `eventType.` 또는 `preset.` 접두사로 시작하면 i18n 키로 보고 사전을 탄다. 그 외에는 리터럴로 그대로 렌더한다. 사용자가 시드 프리셋의 이름을 한 번이라도 고치면 리터럴로 바뀌고, 그 시점부터 로케일을 따르지 않는 것이 맞다 — 사용자가 직접 붙인 이름이기 때문이다.

아래 §4.2~4.4 표의 `label (ko)` 열은 **사람이 읽기 위한 참고 표시**이며, 시드에 들어가는 실제 값은 `eventType.{key}`다.

---

## 4. 종별 프리셋 템플릿

반려동물 등록(`POST /api/pets`) 성공 시, 해당 종 템플릿으로 `Preset` 행을 **자동 생성**한다 (`petId = null` → 현재 선택 반려동물). 수량·단위는 **비워 둔다** — 가구마다 사료·급여량이 다르고, P0-01 실측 후 시드만 조정한다.

### 4.0 두 번째 반려동물 — petId별 프리셋

온보딩 시드 프리셋은 **`petId`에 묶는다.** `petId = null`(가구 전유)이면 다종 가구에서 종 특화 칩(예: 개 `walk`)이 다른 반려동물 퀵바에도 노출된다.

**삽입 규칙** (반려동물 등록 직후, 해당 `petId`로):

```
templates = species 템플릿 (§4.2~4.4)
existing  = 이 petId의 Preset eventTypeId 집합
isFirst   = 가구 내 Pet 수 === 1 (등록 직후 count)

for t in templates:
    if t.eventTypeId in existing: continue
    insert Preset(t, petId, isStarter = t.isStarter AND isFirst)
```

- **`isStarter`는 가구의 첫 반려동물 등록 때만** 설정한다 (G-1).
- 둘째 반려동물(다른 종 포함)은 종 템플릿 전체를 **자기 petId**로 새로 넣는다 — 가구 공유 프리셋과 중복 검사하지 않는다.
- 동시 등록 방어: `@@unique([householdId, petId, eventTypeId])` + 트랜잭션 + `createMany({ skipDuplicates: true })`.

### 4.1 공통 규칙

| 필드 | 값 |
|---|---|
| `isStarter` | **true** = 온보딩 직후 퀵 칩 3개 (G-1: 사료·물·배변) |
| `sortOrder` | 아래 표 순서 |
| `quantity` / `unit` | `null` (1탭 기록은 타입만; 상세 시트에서 입력) |
| `petId` | 등록한 반려동물 ID (종 특화 칩 분리) |

### 4.2 고양이 (`CAT`) — 7개

| sort | isStarter | eventType.key | label (ko) | 비고 |
|---|---|---|---|---|
| 0 | **true** | `meal` | 사료 | |
| 1 | **true** | `water` | 물 | |
| 2 | **true** | `poop` | 대변 | `FECAL_7` 척도 UI 연결 |
| 3 | false | `pee` | 소변 | |
| 4 | false | `treat` | 간식 | |
| 5 | false | `vomit` | 구토 | |
| 6 | false | `weight` | 체중 | |

[`scenarios.md`](scenarios.md) O5와 동일. **8개 이하** 충족.

### 4.3 개 (`DOG`) — 7개

| sort | isStarter | eventType.key | label (ko) |
|---|---|---|---|
| 0 | **true** | `meal` | 사료 |
| 1 | **true** | `water` | 물 |
| 2 | **true** | `poop` | 대변 |
| 3 | false | `pee` | 소변 |
| 4 | false | `treat` | 간식 |
| 5 | false | `walk` | 산책 |
| 6 | false | `weight` | 체중 |

### 4.4 기타 (`OTHER`) — 6개

개·고양이 특화 타입 제외. 시작 3개 동일.

| sort | isStarter | eventType.key | label (ko) |
|---|---|---|---|
| 0 | **true** | `meal` | 사료 |
| 1 | **true** | `water` | 물 |
| 2 | **true** | `poop` | 대변 |
| 3 | false | `pee` | 소변 |
| 4 | false | `treat` | 간식 |
| 5 | false | `weight` | 체중 |

---

## 5. 시드 스크립트 동작 (P1-04 참고)

```
1. 시스템 EventType: key로 findFirst(householdId = null) → 없으면 create
   ※ upsert 금지. 복합 unique에 NULL이 끼어 있어 Prisma가 where를 못 만든다 (§1.1)
2. (부트스트랩·첫 가구 생성은 별도 — P1-07)
3. POST /api/pets { name, species } 시:
   a. species 템플릿 선택 (§4.2~4.4)
   b. §4.0 삽입 규칙으로 Preset bulk insert — 이미 있는 eventTypeId는 건너뛴다
   c. EventType aliases는 시스템 행 참조 (가구 복사본은 Phase 2 커스텀 시)
```

**K-8 검증**: 위 표에 없는 타입(예: `symptom`)을 쓰려면 설정에서 EventType 행 추가만 하면 된다. 코드 변경 불필요.

---

## 6. P0-01 실측 시 조정할 항목

| 항목 | 현재 초안 | 실측 후 |
|---|---|---|
| 프리셋 개수 | CAT/DOG 7, OTHER 6 | 8개 초과 시 `isStarter` 외 항목을 "더보기"만 또는 숨김 |
| 기본 `quantity` | null | "항상 같은 양"인 항목만 숫자 채움 (예: 사료 50g) |
| `aliases` | 표 §2.3 | 실제 가정 은어는 **저장소에 넣지 않음** — 사용자 설정 |
| 투약 프리셋 | 없음 (타입만) | 약 종류별 프리셋은 Phase 2 바코드 또는 수동 추가 |

---

## 7. 리뷰 체크리스트

- [ ] 시작 3개(G-1): 사료·물·대변(배변) — **종 무관 동일**
- [ ] 공개 저장소에 개인 패턴·실제 반려동물 이름 없음
- [ ] **§3.1** 시드 프리셋 `label`에 i18n 키를 넣는 방식이 맞는지 (한글 리터럴 대신)
- [ ] **§2.3** 커뮤니티 은어를 시드에서 빼고 설정 후보로 미룬 판단이 맞는지
- [ ] `poop` + `FECAL_7`만 Phase 1 척도 UI (§3.8)
- [ ] 프리셋 ≤ 8 (종별)
- [ ] P0-01 실측 빈도와 충돌 없음 (사람 확인)

**리뷰 후** P1-04 시드 구현 시 이 문서를 단일 진실 원천으로 사용한다.
