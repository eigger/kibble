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

자동 입력용. **가구 OWNER 세션으로만** 발급·폐기할 수 있다. 기본적으로 대부분의 라우트는 ApiToken을 거부한다(403). `POST /api/events`만 `allowApiToken: true`로 허용된다.

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

선택 필드: `occurredAt`(ISO 8601), `quantity`, `quantityOffered`, `unit`, `scaleValue`, `note`, `rawText`, `eventTypeId`(프리셋 없이 직접 지정 시).

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

계정·설정(`User`, `Setting`)과 업로드 파일을 `.tar.gz`로 보내고 복원합니다. UI는 **더보기 → 백업/복원** (`/backup`).

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

복원 시 백업에 `passwordHash`가 없으면 임시 비밀번호가 응답에 포함됩니다.

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

총 파일 상한: `FILE_SIZE_LIMIT_MB` 환경 변수(기본 **500MB**). 청크 크기 **8MB** (`@kibble/shared` `UPLOAD_CHUNK_SIZE_BYTES`).

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

---

## 관련 문서

- [`docs/PROJECT.md`](PROJECT.md) — 데이터 모델
- [`docs/WORKPLAN.md`](WORKPLAN.md) — Phase 1 WBS
- [`docs/deploy.md`](deploy.md) — 배포·마이그레이션·Proxmox
- [`docs/seed-event-types.md`](seed-event-types.md) — 시스템 이벤트 타입
