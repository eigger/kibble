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

필드: `typeKey`, `occurredAt`(ISO 또는 null=now), `quantity`, `quantityOffered`, `unit`, `rawLine`

---

## 단일 줄 — 시각

| # | input | expected |
|---|---|---|
| T01 | `8시 40분 사료` | `[{ typeKey: meal, occurredAt: today 08:40, rawLine }]` |
| T02 | `오후 3시 물` | `[{ typeKey: water, occurredAt: today 15:00 }]` |
| T03 | `어제 저녁 대변` | `[{ typeKey: poop, occurredAt: yesterday ~19:00 }]` — 상대 시각은 Phase 1 "어제 저녁" 버튼과 동일 규칙 |
| T04 | `방금 간식` | `[{ typeKey: treat, occurredAt: now }]` |

## 단일 줄 — 수량

| # | input | expected |
|---|---|---|
| Q01 | `사료 40g` | `[{ typeKey: meal, quantity: 40, unit: g }]` |
| Q02 | `100g 줬는데 30g 먹음` | `[{ typeKey: meal, quantityOffered: 100, quantity: 30, unit: g }]` |
| Q03 | `물 7~80ml` | `[{ typeKey: water, quantity: 75, unit: ml }]` — 범위는 중간값 또는 `~` 근사 (J10) |
| Q04 | `대변 2개` | `[{ typeKey: poop, quantity: 2, unit: 개 }]` |

## 단일 줄 — 타입 키워드·별칭

| # | input | expected |
|---|---|---|
| K01 | `밥` | `[{ typeKey: meal }]` |
| K02 | `감자` | `[{ typeKey: pee }]` — alias |
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
| N01 | `기분 좋아 보임` | `[{ typeKey: note, rawText: full input }]` |
| N02 | `???` | `[{ typeKey: note }]` — 거부 없음 |

## 불확실 표현 (J10)

| # | input | expected |
|---|---|---|
| U01 | `사료 40g정도` | `quantity: 40`, needsReview: false |
| U02 | `구토한 것 같음` | `[{ typeKey: vomit, note: "한 것 같음" }]` or note — **리뷰 시 규칙 확정** |

---

## 목표치 (Phase 1 게이트 전 가설)

| 지표 | 목표 |
|---|---|
| 공개 합성 세트 (위 ~25케이스) | **100%** 타입 매칭 (단위 테스트) |
| 개인 100문장 (로컬) | 타입 80%+, 시각 70%+ (가설 — P0-09 후 확정) |
| `needsReview` 비율 | 게이트에서 실측 (§5.6) |

---

## 로컬 픽스처 (커밋 금지)

`.gitignore`에 추가 권장:

```
fixtures/parsing-private/
```

P0-09: 기존 메신저 일지에서 100문장 추출 → 동일 JSON 형식으로 저장.
