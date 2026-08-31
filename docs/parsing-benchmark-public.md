# 파싱 벤치마크 — 공개 합성 세트 (P0-09 보조)

- 작성일: 2026-08-31
- 목적: 규칙 기반 파서(P1-15) 단위 테스트용 **공개 가능한** 문장·정답 쌍
- **개인 일지 100문장**(P0-09 본문)은 로컬 픽스처로 두고 `.gitignore` — 이 파일과 합쳐 정확도를 본다

---

## 형식

각 케이스:

- `input`: 사용자가 입력 바에 쓴 문자열 (한 줄 또는 여러 줄)
- `expected`: 파서가 **제안**해야 할 이벤트 배열 (확정 아님 — `needsReview` 가능)
- `notes`: 규칙 우선순위·알려진 한계

필드: `typeKey`, `occurredAt`(ISO 또는 null=now), `quantity`, `quantityOffered`, `unit`, `scaleValue`, `rawText`, `needsReview`

**`rawText`는 `PROJECT.md §4`의 `Event.rawText`와 같은 필드다** (이 문서에서 `rawLine`이라는 별칭을 쓰지 않는다).

**여러 줄일 때 무엇을 저장하는가** — 각 이벤트의 `rawText`에는 **그 이벤트가 나온 줄만** 넣고, 같은 입력에서 나온 이벤트들은 `entryId`를 공유한다. 한 줄 입력이면 결과적으로 `rawText == 입력 전체`가 된다. 줄 단위로 나누지 못한 입력(파싱 실패)은 이벤트 1건에 입력 전체를 넣는다.

### 상대 시각 기준값

`occurredAt` 추정에 쓰는 값. **P1-24의 시각 빠른 버튼도 같은 표를 쓴다** — 두 경로가 다른 시각을 쓰면 타임라인 정렬이 어긋난다.

| 표현 | 시각 |
|---|---|
| 새벽 | 04:00 |
| 아침 | 08:00 |
| 점심 | 12:00 |
| 오후 | 15:00 |
| 저녁 | 19:00 |
| 밤 | 22:00 |
| 방금 / (표현 없음) | now |

`어제`·`그제`는 위 시각에서 날짜만 뺀다.

### `needsReview`가 true가 되는 조건

`WORKPLAN §5.6`이 게이트 지표로 쓰는 값이므로 규칙을 여기서 고정한다. **아래 중 하나라도 해당하면 true.**

1. 타입 후보가 2개 이상이라 하나를 임의로 골랐다
2. 시각을 상대 표현에서 **추정**했다 (위 표 사용) — 명시적 `8시 40분`은 false
3. 수량 범위를 단일값으로 **환산**했다 (`70~80` → 75)
4. 타입을 못 찾아 `note`로 흡수했다 (K-12)

`~정도`, `~인듯` 같은 근사 표현은 **그 자체로는 true가 아니다** (J10 — 사용자는 원래 그렇게 쓴다). 값이 하나로 확정되면 false.

---

## 단일 줄 — 시각

| # | input | expected |
|---|---|---|
| T01 | `8시 40분 사료` | `[{ typeKey: meal, occurredAt: today 08:40, needsReview: false }]` |
| T02 | `오후 3시 물` | `[{ typeKey: water, occurredAt: today 15:00, needsReview: false }]` — `오후 3시`는 명시 시각이다 |
| T03 | `어제 저녁 대변` | `[{ typeKey: poop, occurredAt: yesterday 19:00, needsReview: true }]` — 상대 시각 추정(조건 2) |
| T04 | `방금 간식` | `[{ typeKey: treat, occurredAt: now, needsReview: false }]` |

## 단일 줄 — 수량

| # | input | expected |
|---|---|---|
| Q01 | `사료 40g` | `[{ typeKey: meal, quantity: 40, unit: g }]` |
| Q02 | `100g 줬는데 30g 먹음` | `[{ typeKey: meal, quantityOffered: 100, quantity: 30, unit: g }]` |
| Q03 | `물 70~80ml` | `[{ typeKey: water, quantity: 75, unit: ml, needsReview: true }]` — 범위는 **중간값**. 환산했으므로 조건 3 |
| Q03b | `물 7~80ml` | `[{ typeKey: water, quantity: 75, unit: ml, needsReview: true }]` — **앞자리 생략 보정**: `N~M`에서 N의 자릿수가 M보다 적으면 M의 앞자리를 빌려 채운다(`7~80` → `70~80`). 실사용에서 흔한 표기 |
| Q04 | `대변 2개` | `[{ typeKey: poop, quantity: 2, unit: 개 }]` |

## 단일 줄 — 타입 키워드·별칭

| # | input | expected |
|---|---|---|
| K01 | `밥` | `[{ typeKey: meal }]` |
| K02 | `오줌` | `[{ typeKey: pee }]` — 시드 alias (커뮤니티 은어는 시드에 없다 — `seed-event-types.md §2.3`) |
| K03 | `토함` | `[{ typeKey: vomit }]` |
| K04 | `3.2kg` | `[{ typeKey: weight, quantity: 3.2, unit: kg }]` |

## 복합

| # | input | expected |
|---|---|---|
| C01 | `8시 40분 사료 40g정도` | `[{ typeKey: meal, occurredAt: 08:40, quantity: 40, unit: g }]` |
| C02 | `오후 2시 약` | `[{ typeKey: medication, occurredAt: 14:00 }]` |

## 다중 줄 (`entryId` 공유)

| # | input | expected |
|---|---|---|
| M01 | `8시 사료\n9시 물\n10시 대변` | 3 events, same `entryId` |
| M02 | `아침 밥 50g\n점심 츄르` | `[meal 50g, treat]` |

## 실패 → NOTE (K-12)

| # | input | expected |
|---|---|---|
| N01 | `기분 좋아 보임` | `[{ typeKey: note, rawText: "기분 좋아 보임", needsReview: true }]` — 조건 4 |
| N02 | `???` | `[{ typeKey: note, needsReview: true }]` — 거부 없음 |

## 불확실 표현 (J10)

| # | input | expected |
|---|---|---|
| U01 | `사료 40g정도` | `[{ typeKey: meal, quantity: 40, unit: g, needsReview: false }]` — 근사 표현 자체는 조건에 없다 |
| U02 | `구토한 것 같음` | `[{ typeKey: vomit, needsReview: false }]` — 타입 후보가 하나뿐이라 조건 1에 해당하지 않는다. 불확실성은 `rawText`에 남는다 |
| U03 | `밥이나 간식 줌` | `needsReview: true` — 타입 후보 2개(meal / treat), 조건 1 |

---

## 목표치 (Phase 1 게이트 전 가설)

| 지표 | 목표 |
|---|---|
| 공개 합성 세트 (위 ~25케이스) | **100%** 타입 매칭 (단위 테스트) |
| 개인 100문장 (로컬) | 타입 80%+, 시각 70%+ (가설 — P0-09 후 확정) |
| `needsReview` 비율 | 게이트에서 실측 (§5.6) |

---

## 로컬 픽스처 (커밋 금지)

**경로는 `fixtures/private/` 하나다.** 이미 `.gitignore`에 등재돼 있으므로 다른 경로를 새로 만들지 않는다 — 등재되지 않은 경로에 개인 일지를 두면 다음 `git add -A`에서 그대로 공개 저장소에 커밋된다.

```
fixtures/private/parsing-cases.json
```

P0-09: 기존 메신저 일지에서 100문장 추출 → 위 경로에 동일 JSON 형식으로 저장. **저장 후 `git status`로 추적되지 않는지 반드시 확인할 것.**
