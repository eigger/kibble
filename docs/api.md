# kibble HTTP API

셀프호스트 반려동물 일지 REST API. Phase 1 기준 엔드포인트와 `curl` 예제만 다룬다. 특정 플랫폼(Home Assistant, iOS 단축어 등) 가이드는 포함하지 않는다.

**기본 URL**: 배포 환경에 맞게 `BASE`를 바꾼다. 아래 예제는 `http://localhost:8080`을 가정한다.

```bash
BASE=http://localhost:8080
```

---

## 인증

### 세션 (JWT)

로그인하면 `accessToken` 쿠키와 응답 본문에 JWT가 내려온다. `curl`에서는 `Authorization: Bearer` 헤더를 쓴다.

```bash
# 첫 관리자 생성 (인스턴스에 사용자가 없을 때만)
curl -sS -X POST "$BASE/api/auth/bootstrap" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Admin","email":"admin@example.com","password":"change-me-12"}'

# 로그인
curl -sS -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"change-me-12"}'

# 이후 요청 (응답 JSON의 accessToken 사용)
TOKEN="<accessToken from login>"
AUTH="Authorization: Bearer $TOKEN"
```

### API 토큰 (`kbl_…`)

자동 입력용. **가구 OWNER 세션으로만** 발급·폐기할 수 있다. 기본적으로 대부분의 라우트는 ApiToken을 거부한다(403).

허용 라우트와 스코프:

| 라우트 | 필요한 스코프 |
|---|---|
| `POST /api/events` | `event:create` |
| `GET /api/states` | `state:read` |

`scopes`를 생략하면 `["event:create"]`만 발급된다. **기존 토큰은 `state:read`가 없으므로 상태 조회를 하려면 새로 발급해야 한다.**

```bash
# 토큰 발급 (plaintext는 이 응답에서만 한 번 노출)
curl -sS -X POST "$BASE/api/tokens" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"name":"feeder","presetId":"<preset-id>"}'

API_TOKEN="kbl_…"

# 이벤트 기록 (스코프에 맞는 presetId/petId만)
curl -sS -X POST "$BASE/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d '{"dedupeKey":"sensor:meal:2026-08-31T08:00:00Z"}'
```

`dedupeKey`는 재시도 시 중복 생성을 막는다. 같은 키로 다시 보내면 기존 이벤트가 반환된다(소프트삭제된 경우 복구).

---

## 헬스

```bash
curl -sS "$BASE/health"
# {"status":"ok"}
```

---

## 홈

```bash
curl -sS "$BASE/api/home" -H "$AUTH"
# pets, activePet, presets, todaySummary, recentEvents
```

특정 반려동물 기준:

```bash
curl -sS "$BASE/api/home?petId=<pet-id>" -H "$AUTH"
```

---

## 반려동물

```bash
# 목록
curl -sS "$BASE/api/pets" -H "$AUTH"

# 등록 (name + species만 필수)
curl -sS -X POST "$BASE/api/pets" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"name":"보리","species":"CAT"}'
```

`species`: `CAT` | `DOG` | `OTHER`

---

## 프리셋

```bash
curl -sS "$BASE/api/presets?petId=<pet-id>" -H "$AUTH"
```

---

## 상태 조회 (역방향)

밖에서 kibble의 현재 상태를 읽는다. 세션 또는 `state:read` 토큰. **읽기 전용이다 (K-7).**

```bash
# 세션으로
curl -sS "$BASE/api/states?petId=<pet-id>" -H "$AUTH"

# 자동화(홈어시스턴트 등)에서 토큰으로 — 개체 스코프 토큰이면 petId 생략 가능
curl -sS "$BASE/api/states" -H "Authorization: Bearer kbl_..."
```

응답에 담기는 것:

| 필드 | 내용 |
|---|---|
| `pet` | 대상 반려동물 |
| `lastEvents[]` | 이벤트 타입별 **마지막 기록** — 시각, 수량·단위, 척도값, `hoursSince`(경과 시간) |
| `today[]` | 오늘(KST 기준) 타입별 **건수와 합계** — 급여량·음수량 등 |
| `todaySince` | 오늘 합계의 시작 경계 |
| `medication` | 진행 중 과정 수, 오늘 먹인/계획된 횟수, **시각이 지난 슬롯** |
| `reminders[]` | 예정일과 지남 여부 |

이벤트 타입을 코드에 나열하지 않으므로(K-8), **프리셋·타입을 늘리면 응답이 저절로 따라온다.**

---

## 이벤트

### 생성

세션 또는 ApiToken(`event:create` 스코프).

```bash
# 프리셋 1탭 기록 (웹 퀵 칩과 동일)
curl -sS -X POST "$BASE/api/events" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{
    "petId": "<pet-id>",
    "presetId": "<preset-id>",
    "source": "WEB",
    "dedupeKey": "curl:meal:1"
  }'
```

빈 본문 + ApiToken(프리셋 스코프 고정)도 가능:

```bash
curl -sS -X POST "$BASE/api/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d '{"dedupeKey":"auto:001"}'
```

선택 필드: `occurredAt`(ISO 8601), `quantity`, `quantityOffered`, `unit`, `scaleValue`, `costKrw`(병원비, 정수), `note`, `rawText`, `eventTypeId`(프리셋 없이 직접 지정 시).

### 단건 읽기

```bash
curl -sS "$BASE/api/events/<event-id>" -H "$AUTH"
```

**세션 전용이다.** 토큰은 개체·프리셋 스코프인데 임의 `:id` 읽기를 열면 가구 안의 다른 기록까지 보인다 — 밖에서 읽을 것은 `GET /api/states`다.

### 목록 (타임라인)

```bash
curl -sS "$BASE/api/events?petId=<pet-id>&limit=30" -H "$AUTH"
```

페이지네이션 커서: `before`(ISO 시각) + `beforeId`(이벤트 id).

### 수정

```bash
curl -sS -X PATCH "$BASE/api/events/<event-id>" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"note":"잘 먹음","quantity":40,"unit":"g"}'
```

### 소프트 삭제 / 복구

```bash
curl -sS -X DELETE "$BASE/api/events/<event-id>" -H "$AUTH"
# 204

curl -sS -X POST "$BASE/api/events/<event-id>/restore" -H "$AUTH"
```

---

## API 토큰 관리

```bash
# 목록
curl -sS "$BASE/api/tokens" -H "$AUTH"

# 발급
curl -sS -X POST "$BASE/api/tokens" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"name":"water-bowl","petId":"<pet-id>","eventTypeId":"<type-id>"}'

# 폐기
curl -sS -X DELETE "$BASE/api/tokens/<token-id>" -H "$AUTH"
```

---

## 파싱 (텍스트 입력)

```bash
curl -sS -X POST "$BASE/api/parse/entry" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"petId":"<pet-id>","text":"8시 40분 사료 40g\n물"}'
```

응답: `entryId`, `rawText`, `suggestions[]`(줄별 eventType·quantity·occurredAt). 파싱 실패 줄은 `note` 타입으로 제안된다(K-12).

---

## 가구 격리 (K-1~K-3)

모든 리소스 쿼리는 인증된 사용자의 `householdId`로 스코프된다. 다른 가구의 `petId`·`presetId`·`eventId`를 넣으면 **404**(존재 여부를 노출하지 않음).

---

## 오류 코드

| 코드 | 의미 |
|------|------|
| 401 | 인증 실패 (JWT 만료·잘못된 토큰) |
| 403 | 권한 없음 (가구 미소속, VIEWER 쓰기, OWNER 아닌 토큰 관리, ApiToken 미허용 라우트) |
| 404 | 리소스 없음 또는 다른 가구 |
| 400 | 본문 검증 실패 |
| 429 | rate limit (`POST /api/events` — 120/분) |

---

## 백업 / 복원 (관리자)

계정·가구·설정(`User`, `Household`, `HouseholdMember`, `Setting`)과 업로드 파일을 `.tar.gz`로 보내고 복원합니다. UI는 **더보기 → 백업/복원** (`/backup`).

> ⚠️ **일지 데이터는 포함되지 않습니다.** `Pet`·`Event`·`Preset`·`Attachment` 행은 담기지 않으므로 이 아카이브만으로 일지를 복구할 수 없습니다. 전체 백업은 `pg_dump` + uploads 볼륨 스냅샷을 쓰십시오 ([`deploy.md §7`](deploy.md)).
>
> 푸시 서명키(`VAPID_*`)는 **아카이브에서 제외**되며 복원이 서버의 기존 값을 지우지도 않습니다 (WORKPLAN §8).

```bash
# 1) 보내기 티켓 (60초 유효, 1회용)
curl -sS -X POST "$BASE/api/backup/export-ticket" -H "$AUTH"
# → {"ticket":"…","expiresIn":60}

# 2) 아카이브 다운로드
curl -sS -o kibble_backup.tar.gz "$BASE/api/backup/export?ticket=<ticket>"

# 3) 복원 (관리자만 — 기존 계정·설정을 덮어씀)
curl -sS -X POST "$BASE/api/backup/restore" \
  -H "$AUTH" \
  -F "file=@kibble_backup.tar.gz"
```

복원 시 백업에 `passwordHash`가 없으면 임시 비밀번호가 응답에 포함됩니다. 아카이브의 `households`·`householdMembers`가 함께 복원되므로 복원 후에도 각 계정이 원래 가구에 그대로 붙습니다.

---

## 첨부 (사진·영상)

이벤트당 최대 **9개**. MIME: `image/jpeg`, `png`, `webp`, `heic`, `heif`, `video/mp4`, `video/quicktime`.

### 단건 업로드 (15MB 이하 사진 등)

```bash
curl -sS -X POST "$BASE/api/attachments?eventId=<event-id>" \
  -H "$AUTH" \
  -F "file=@photo.jpg"
```

서버에서 이미지는 **1600px·JPEG q82**로 변환한다. 요청 본문 상한 **20MB**.

### 청크 업로드 (영상·대용량 — drop 이식)

총 파일 상한: `FILE_SIZE_LIMIT_MB` 환경 변수(기본 **150MB**). 청크 크기 **8MB** (`@kibble/shared` `UPLOAD_CHUNK_SIZE_BYTES`).

상한을 넘으면 첫 요청(`POST /api/attachments/uploads`)이 바로 **413**을 돌려준다 — 바이트를 보내기 전이다. 150MB는 1080p 30fps 약 2분, 4K 30fps 약 40초에 해당한다. 그보다 큰 파일은 청크 왕복이 수십 분이 되어 실제로 끝까지 올라가지 못하는 경우가 많다.

```bash
# 1) 세션 시작
curl -sS -X POST "$BASE/api/attachments/uploads" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"eventId":"<event-id>","filename":"clip.mov","mimeType":"video/quicktime","totalSize":12345678}'

# → {"uploadId":"…"}

# 2) 청크 (index 0부터 순서대로)
curl -sS -X PUT "$BASE/api/attachments/uploads/<uploadId>/chunks/0" \
  -H "$AUTH" -H "Content-Type: application/octet-stream" \
  --data-binary @chunk0.bin

# 3) 진행 확인 (선택)
curl -sS "$BASE/api/attachments/uploads/<uploadId>" -H "$AUTH"

# 4) 완료
curl -sS -X POST "$BASE/api/attachments/uploads/<uploadId>/complete" -H "$AUTH"
```

웹 UI는 영상 또는 **15MB 초과** 파일을 자동으로 청크 경로로 올린다. 미디어 조회: `GET /api/attachments/file/<path>` (미디어 쿠키·Bearer).

업로드 세션은 **API 프로세스 메모리**에 있다(셀프호스트 단일 인스턴스 전제). 따라서:

- API를 재시작하면 진행 중이던 업로드는 무효가 되고 `404`가 난다 — 클라이언트는 새 세션으로 다시 시작한다
- 청크는 **순차 전송**이다. 같은 세션에 동시에 두 청크를 보내면 뒤에 온 요청이 `409`(`expectedIndex` 포함)로 거절된다

---

## 관련 문서

- [`docs/PROJECT.md`](PROJECT.md) — 데이터 모델
- [`docs/WORKPLAN.md`](WORKPLAN.md) — Phase 1 WBS
- [`docs/deploy.md`](deploy.md) — 배포·마이그레이션·Proxmox
- [`docs/seed-event-types.md`](seed-event-types.md) — 시스템 이벤트 타입
