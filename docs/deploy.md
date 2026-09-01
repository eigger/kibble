# kibble 배포 가이드

셀프호스트 반려동물 일지 kibble을 새 서버(LXC·VM·로컬)에서 기동하는 방법입니다.

**앱 버전:** `0.1.0` (모노레포 `package.json` · 웹 더보기 메뉴 하단)

## 요구 사항

| 항목 | 최소 |
|---|---|
| OS | Linux (Debian 12+ 권장) 또는 Docker Desktop |
| RAM | **2 GB** (Proxmox LXC 기본값) |
| 디스크 | 16 GB |
| CPU | 1 vCPU (LXC 기본값) |
| 포트 | **80** (HTTP). HTTPS는 역프록시·Tailscale Serve 등으로 앞단 처리 |

스택: **PostgreSQL 16** · **Node API** · **Next.js web** · **Caddy** (리버스 프록시)

> **릴리스 태그·GHCR 이미지가 아직 없을 수 있습니다.**  
> 이 경우 **§1.1 소스 빌드** 또는 **§2 Proxmox + `KIBBLE_REF=master`** 를 사용합니다 ([`docs/WORKPLAN.md`](WORKPLAN.md) §5.6).

---

## 1. Docker Compose (로컬·수동 서버)

### 1.1 소스에서 빌드 — **게이트 전 기본 경로**

```bash
git clone https://github.com/eigger/kibble.git
cd kibble
cp .env.example .env
```

`.env`에서 반드시 설정 (값은 **미리 생성**해서 붙여 넣습니다 — Compose `.env`는 셸이 아닙니다):

```bash
# 예: 터미널에서 생성한 뒤 복사
openssl rand -hex 16   # → POSTGRES_PASSWORD
openssl rand -hex 32   # → JWT_SECRET
```

`.env` 파일 예:

```ini
POSTGRES_USER=kibble
POSTGRES_PASSWORD=a1b2c3d4e5f6789012345678abcdef01
POSTGRES_DB=kibble
JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
APP_PUBLIC_URL=http://localhost
COOKIE_SECURE=false
```

```bash
docker compose up --build -d
```

- 접속: **http://localhost** (Caddy `:80`)
- API 헬스: `http://localhost/health`
- 첫 방문 시 관리자 계정 생성 화면

중지: `docker compose down`  
데이터 유지: `pgdata`, `uploads` 볼륨 삭제하지 않기

대용량 영상 첨부는 **청크 업로드**(8MB 단위)를 사용합니다. 총 파일 상한은 API 환경 변수 `FILE_SIZE_LIMIT_MB`(기본 500)입니다. `uploads` 볼륨에 `tmp/` 임시 조각이 생길 수 있으며, 24시간 지난 세션은 API가 정리합니다.

### 1.2 GHCR 이미지 (프로덕션)

**전제:** GitHub Release + [Docker Release](../../.github/workflows/docker-release.yml) 워크플로로 이미지가 GHCR에 올라간 뒤에만 사용합니다.  
게이트 전이거나 워크플로를 한 번도 돌리지 않았다면 **§1.1**을 쓰세요.

```bash
mkdir -p /opt/kibble && cd /opt/kibble
curl -fsSL -o docker-compose.prod.yml \
  https://raw.githubusercontent.com/eigger/kibble/master/docker-compose.prod.yml
curl -fsSL -o Caddyfile \
  https://raw.githubusercontent.com/eigger/kibble/master/Caddyfile
```

비밀번호·시크릿을 **터미널에서 먼저 생성**한 뒤, `.env`에 **문자 그대로** 넣습니다 (`$(openssl …)` 문법은 동작하지 않습니다):

```bash
openssl rand -hex 16   # POSTGRES_PASSWORD용
openssl rand -hex 32   # JWT_SECRET용
```

`.env` 예시:

```ini
GH_REPOSITORY_OWNER=eigger
POSTGRES_USER=kibble
POSTGRES_PASSWORD=a1b2c3d4e5f6789012345678abcdef01
POSTGRES_DB=kibble
JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
APP_PUBLIC_URL=http://YOUR_HOSTNAME
# HTTPS 프록시 뒤에서만:
# COOKIE_SECURE=true
```

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

이미지: `ghcr.io/eigger/kibble-api`, `ghcr.io/eigger/kibble-web`

---

## 2. Proxmox LXC (원클릭)

### LXC 기본 스펙 (`proxmox/ct/kibble.sh`)

| 항목 | 기본값 |
|---|---|
| RAM | 2048 MB |
| CPU | 1 |
| 디스크 | 16 GB |
| OS | Debian 13 (unprivileged) |

### 설치

설치·업데이트 스크립트는 GitHub **`releases/latest`** 태그에서 배포 파일을 받습니다.  
**릴리스가 없으면 `master`로 자동 fallback** 합니다. 게이트 전에는 명시적으로 `KIBBLE_REF=master`를 권장합니다.

Proxmox VE 호스트에서:

```bash
# 게이트 전 (권장)
export KIBBLE_REF=master
bash -c "$(curl -fsSL https://raw.githubusercontent.com/eigger/kibble/master/proxmox/ct/kibble.sh)"
```

또는 컨테이너 안에서 수동:

```bash
export KIBBLE_REF=master
curl -fsSL https://raw.githubusercontent.com/eigger/kibble/master/proxmox/install/kibble-install.sh | bash
```

> 릴리스 태그가 생긴 뒤에는 `KIBBLE_REF` 없이 실행해도 됩니다 (`releases/latest` 사용).

설치 스크립트가 수행하는 것:

- Docker Engine 설치
- `/opt/kibble`에 `docker-compose.prod.yml`, `Caddyfile`, `.env` 생성 (비밀번호는 스크립트가 `openssl`로 생성)
- `kibble.service` systemd 등록 및 기동
- `/usr/bin/update` 명령 설치 (`proxmox/install/update.sh`)

컨테이너 콘솔에 표시되는 `http://<IP>:80` 으로 접속합니다.

### 업데이트

LXC 안에서:

```bash
# 게이트 전
KIBBLE_REF=master update

# 릴리스 이후 (최신 태그)
update
```

`update` (`proxmox/install/update.sh`) 동작:

1. `docker-compose.prod.yml` · `Caddyfile` · 자기 자신을 최신 ref에서 받음
2. 로컬 수정이 있으면 중단 (`--force`로 덮어쓰기). `.kibble-manifest`로 compose/Caddy 해시 추적
3. `docker compose pull` → `up -d`
4. `/health` 확인 (최대 60초)
5. **성공 시** `docker image prune -f` — dangling 이미지 정리
6. 실패 시 compose/Caddy **롤백** 후 스택 재기동

Proxmox 커뮤니티 스크립트 UI의 **Update** 버튼도 컨테이너 안에서 `update`를 호출합니다.

---

## 3. Tailscale로 폰·외부 접속

1. LXC/서버에 [Tailscale](https://tailscale.com/) 설치 후 로그인
2. MagicDNS 이름 확인 — Tailscale 관리 콘솔의 **Machine name** (예: `kibble`) 또는 FQDN (예: `kibble.tail-abcd1234.ts.net`)
3. `.env`의 `APP_PUBLIC_URL`을 **실제로 브라우저에 치는 URL**과 일치시킵니다  
   예: `http://kibble` (MagicDNS short name) 또는 `https://kibble.tail-abcd1234.ts.net` (Serve·HTTPS 사용 시)
4. 폰 Tailscale 앱에서 같은 URL 열기 → 로그인 → **홈 화면에 추가** (PWA)

HTTPS가 필요하면 Tailscale Serve/Funnel 또는 앞단 Caddy에 TLS를 추가합니다.  
`COOKIE_SECURE=true`는 HTTPS에서만 설정하세요.

---

## 4. GHCR 릴리스 워크플로

- GitHub **Actions → Docker Release → Run workflow** (`workflow_dispatch`)
- 또는 GitHub **Release** 발행 시 자동 빌드·푸시

태그 예: `v0.1.0` → `ghcr.io/eigger/kibble-api:0.1.0`, `:latest`

> Phase 1 **게이트 통과 전**에는 태그를 남발하지 않습니다 ([`docs/WORKPLAN.md`](WORKPLAN.md) §5.6).  
> 그 전까지는 §1.1 빌드 또는 `KIBBLE_REF=master` Proxmox 설치를 사용합니다.

---

## 5. 환경 변수 요약

| 변수 | 필수 | 설명 |
|---|---|---|
| `POSTGRES_PASSWORD` | ✓ | DB 비밀번호 |
| `JWT_SECRET` | ✓ | 세션 서명 (`openssl rand -hex 32`). 프로덕션에서 `changeme`·`dev-secret-change-me` 거부 |
| `APP_PUBLIC_URL` | 권장 | 미디어 쿠키·절대 URL용, **프로덕션 CORS 허용 오리진**. **브라우저 접속 URL과 동일** |
| `CORS_EXTRA_ORIGINS` | 선택 | 접속 도메인이 여럿이거나 웹·API 호스트가 다를 때 쉼표로 나열 |
| `COOKIE_SECURE` | HTTPS 시 | `true` — HTTP만 쓰면 `false` 또는 생략 |
| `GH_REPOSITORY_OWNER` | prod | GHCR 이미지 소유자 (기본 `eigger`) |
| `KIBBLE_REF` | Proxmox | `master` 또는 릴리스 태그. 설치·`update` 스크립트용 |

전체 예시: [`.env.example`](../.env.example)

---

## 6. 첫 실행 후

1. 브라우저에서 `/` 접속
2. **관리자 계정** 생성 (최초 1회)
3. 온보딩에서 반려동물 이름·종 입력 → 기본 기록 칩 자동 생성
4. 하단 네비: **홈** · **기록**(`/q`) · **이력** · **더보기**
5. (선택) 더보기 → **백업/복원**(`/backup`) — **계정·가구·설정만** 다룹니다. 일지(반려동물·이벤트·프리셋·첨부)는 포함되지 않습니다

---

## 7. 데이터베이스 마이그레이션

- 마이그레이션은 **`apps/api/prisma/migrations/20260902100000_init` 단일 파일**로 스쿼시되어 있습니다.
- **신규 설치**: API 기동 시 `prisma migrate deploy`가 자동 실행됩니다 (`docker-compose.prod.yml`의 `command`).
- **기존 DB를 증분 마이그레이션 이력에서 올릴 때**: 이력이 맞지 않으면 실패합니다. 개발·셀프호스트에서 스키마를 맞추려면:

```bash
cd /opt/kibble   # 또는 apps/api
docker compose -f docker-compose.prod.yml exec api \
  npx prisma migrate reset --schema apps/api/prisma/schema.prisma --config apps/api/prisma.config.ts
```

> ⚠️ `migrate reset`은 **DB 데이터를 전부 삭제**합니다. `/backup`의 보내기는 **계정·가구·설정만** 담으므로 이것만으로는 일지를 되살릴 수 없습니다. 실행 전 **반드시 `pg_dump` + uploads 볼륨 스냅샷**을 먼저 뜨십시오:
>
> ```bash
> docker compose -f docker-compose.prod.yml exec -T postgres >   pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > kibble_db_$(date +%F).sql.gz
> docker run --rm -v kibble_uploads:/data -v "$PWD":/out alpine >   tar -czf /out/kibble_uploads_$(date +%F).tar.gz -C /data .
> ```
>
> 되돌리기: `gunzip -c kibble_db_*.sql.gz | docker compose ... exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"`

### 7.1 데이터 마이그레이션 (Prisma 외 — 시드)

스키마 변경이 아닌 **기존 행 갱신**은 `prisma db seed` / API 기동 시 `seedSystemEventTypes`가 처리합니다. Prisma 마이그레이션 파일은 추가하지 않습니다.

| 변경 | 처리 | 운영 시 |
|---|---|---|
| 시스템 `EventType` 메타 갱신 | `seedSystemEventTypes` (기동 시) | API 재시작만으로 반영 |
| `energy` → `observation` | `migrateEnergyToObservation` (시드 내) | 업그레이드 후 **한 번** `npm run seed -w apps/api` 또는 API 재기동(시드가 돌면 자동) |
| 프리셋 라벨 `eventType.energy` | 시드가 `eventType.observation`으로 갱신 | 동일 |

`energy`와 `observation`이 동시에 있던 DB는 시드가 이벤트·프리셋을 `observation`으로 합치고 `energy` 타입을 보관(archive)합니다.

```bash
# 소스/Compose 개발
npm run seed -w apps/api

# 프로덕션 컨테이너
docker compose -f docker-compose.prod.yml exec api \
  npm run seed -w apps/api
```

---

## 8. 문제 해결

프로덕션·LXC 경로(`/opt/kibble`)에서는 compose 파일 이름이 `docker-compose.prod.yml` 입니다.

| 증상 | 확인 |
|---|---|
| 502 / 연결 안 됨 | `docker compose -f docker-compose.prod.yml ps` · `docker compose -f docker-compose.prod.yml logs api web caddy` |
| 로그인 후 바로 로그아웃 | `JWT_SECRET` 변경 후 기존 토큰 무효 — 재로그인 |
| 사진 안 보임 | `APP_PUBLIC_URL`과 실제 접속 URL 일치, HTTPS면 `COOKIE_SECURE` |
| 브라우저 콘솔에 CORS 오류 | 프로덕션은 `APP_PUBLIC_URL` 오리진만 허용한다. 접속 도메인이 여럿이면 `CORS_EXTRA_ORIGINS`에 추가 |
| 마이그레이션 실패 | API 로그에서 Prisma 오류 — DB 비밀번호·`DATABASE_URL` 확인. 스쿼시 후 기존 DB면 §7 `migrate reset` |
| Proxmox 설치 실패 (release) | `export KIBBLE_REF=master` 후 재시도 (§2). 릴리스 없을 때는 자동 fallback되지만 명시 권장 |
| 업데이트 후 디스크 부족 | `update` 성공 시 `docker image prune -f` 실행됨. 수동: `docker image prune -f` |
| 대용량 영상 업로드 실패 | `FILE_SIZE_LIMIT_MB` 확인. 15MB 이하는 multipart, 그 이상·영상은 청크 — [`docs/api.md`](./api.md) |
| `energy`·`관찰` 칩 중복 | API 재기동 또는 `npm run seed -w apps/api` — §7.1 |

로컬 소스 빌드(`git clone` 루트)에서는 `-f docker-compose.prod.yml` 없이 `docker compose logs …` 를 씁니다.

API 문서: [`docs/api.md`](./api.md)
