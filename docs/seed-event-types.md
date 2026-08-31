# EventType 시드 + 종별 프리셋 템플릿 (P0-02)

- 작성일: 2026-08-31
- 상태: **에이전트 초안 — 리뷰 필요**
- 근거: [`WORKPLAN.md`](../WORKPLAN.md) §3.2·§3.3·§3.8, [`PROJECT.md`](../PROJECT.md) §4, [`docs/scenarios.md`](scenarios.md)
- 원칙: **개인 사용 패턴이 아니라 공개 배포용 일반 기본값** (§7.2). P0-01 실측으로 프리셋 수량·기본 수량은 조정 가능.

---

## 1. 시드 구조

| 계층 | `householdId` | 생성 시점 | 비고 |
|---|---|---|---|
| **시스템 EventType** | `null` | `prisma db seed` (최초 배포) | 모든 가구가 공유. `@@unique([householdId, key])`에서 `null`은 시스템 행 |
| **가구 EventType** | 가구 ID | 사용자가 설정에서 추가 | K-8: 코드 변경 없이 데이터 추가 |
| **Preset** | 가구 ID | **반려동물 등록 직후** | 종(`Pet.species`)에 맞는 템플릿에서 복사 |

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

은어는 가구마다 다르다. 시드는 **흔한 한국어 키워드**만 넣고, 사용자가 설정에서 수정한다. 파서는 `EventType.aliases` + 프리셋 `label`을 함께 본다.

| key | aliases (ko, 제안) |
|---|---|
| `meal` | `밥`, `사료`, `급여`, `먹이` |
| `water` | `물`, `급수`, `정수` |
| `treat` | `간식`, `츄르`, `스낵` |
| `poop` | `대변`, `똥`, `변`, `응가` |
| `pee` | `소변`, `쉬`, `감자` |
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

프리셋 `label`은 **구체 표시**를 위해 i18n 키 대신 짧은 ko 문자열을 DB에 둘 수 있다 (예: `사료`). en UI에서는 `preset.{key}` 키로 매핑하거나 `EventType` 라벨을 재사용한다.

---

## 4. 종별 프리셋 템플릿

반려동물 등록(`POST /api/pets`) 성공 시, 해당 종 템플릿으로 `Preset` 행을 **자동 생성**한다 (`petId = null` → 현재 선택 반려동물). 수량·단위는 **비워 둔다** — 가구마다 사료·급여량이 다르고, P0-01 실측 후 시드만 조정한다.

### 4.1 공통 규칙

| 필드 | 값 |
|---|---|
| `isStarter` | **true** = 온보딩 직후 퀵 칩 3개 (G-1: 사료·물·배변) |
| `sortOrder` | 아래 표 순서 |
| `quantity` / `unit` | `null` (1탭 기록은 타입만; 상세 시트에서 입력) |
| `petId` | `null` |

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
1. 시스템 EventType upsert (householdId = null, key 기준)
2. (부트스트랩·첫 가구 생성은 별도 — P1-07)
3. POST /api/pets { name, species } 시:
   a. species 템플릿 선택 (§4.2~4.4)
   b. Preset 행 bulk insert (householdId, eventTypeId resolve)
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

- [ ] 시작 3개(G-1): 사료·물·대변(배변) — **종无关 동일**
- [ ] 공개 저장소에 개인 패턴·실제 반려동물 이름 없음
- [ ] `poop` + `FECAL_7`만 Phase 1 척도 UI (§3.8)
- [ ] 프리셋 ≤ 8 (종별)
- [ ] P0-01 실측 빈도와 충돌 없음 (사람 확인)

**리뷰 후** P1-04 시드 구현 시 이 문서를 단일 진실 원천으로 사용한다.
