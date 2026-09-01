# kibble 배포 가이드

셀프호스트 반려동물 일지 kibble을 새 서버(LXC·VM·로컬)에서 기동하는 방법입니다.

## 요구 사항

| 항목 | 최소 |
|---|---|
| OS | Linux (Debian 12+ 권장) 또는 Docker Desktop |
| RAM | 1 GB (LXC 기본값) |
| 디스크 | 16 GB |
| 포트 | **80** (HTTP). HTTPS는 역프록시·Tailscale Serve 등으로 앞단 처리 |

스택: **PostgreSQL 16** · **Node API** · **Next.js web** · **Caddy** (리버스 프록시)

> **Phase 1 게이트 전:** GitHub **릴리스 태그·GHCR 이미지가 아직 없을 수 있습니다.**  
> 이 경우 기본 경로는 **§1.1 소스 빌드** 또는 **§2 Proxmox + `KIBBLE_REF=master`** 입니다 ([`WORKPLAN.md`](../WORKPLAN.md) §5.6).

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

설치·업데이트 스크립트는 기본적으로 GitHub **`releases/latest`** 태그에서 배포 파일을 받습니다.  
**릴리스가 없으면 실패합니다.** 게이트 전에는 `KIBBLE_REF=master`를 지정하세요.

Proxmox VE 호스트에서:

```bash
# 게이트 전 (릴리스 태그 없음)
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

컨테이너 콘솔에 표시되는 `http://<IP>:80` 으로 접속합니다.

### 업데이트

LXC 안에서:

```bash
# 게이트 전
KIBBLE_REF=master update

# 릴리스 이후 (최신 태그)
update
```

(`proxmox/install/update.sh` — 배포 파일 갱신 후 `docker compose -f docker-compose.prod.yml pull` · `up -d`)

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

> Phase 1 **게이트 통과 전**에는 태그를 남발하지 않습니다 ([`WORKPLAN.md`](../WORKPLAN.md) §5.6).  
> 그 전까지는 §1.1 빌드 또는 `KIBBLE_REF=master` Proxmox 설치를 사용합니다.

---

## 5. 환경 변수 요약

| 변수 | 필수 | 설명 |
|---|---|---|
| `POSTGRES_PASSWORD` | ✓ | DB 비밀번호 |
| `JWT_SECRET` | ✓ | 세션 서명 (`openssl rand -hex 32`). 프로덕션에서 `changeme`·`dev-secret-change-me` 거부 |
| `APP_PUBLIC_URL` | 권장 | 미디어 쿠키·절대 URL용. **브라우저 접속 URL과 동일** |
| `COOKIE_SECURE` | HTTPS 시 | `true` — HTTP만 쓰면 `false` 또는 생략 |
| `GH_REPOSITORY_OWNER` | prod | GHCR 이미지 소유자 (기본 `eigger`) |
| `KIBBLE_REF` | Proxmox | `master` 또는 릴리스 태그. 설치·`update` 스크립트용 |

전체 예시: [`.env.example`](../.env.example)

---

## 6. 첫 실행 후

1. 브라우저에서 `/` 접속
2. **관리자 계정** 생성 (최초 1회)
3. 온보딩에서 반려동물 이름·종 입력 → 기본 기록 칩 자동 생성
4. (선택) 설정 → 백업, 계정 추가, API 토큰

---

## 7. 문제 해결

프로덕션·LXC 경로(`/opt/kibble`)에서는 compose 파일 이름이 `docker-compose.prod.yml` 입니다.

| 증상 | 확인 |
|---|---|
| 502 / 연결 안 됨 | `docker compose -f docker-compose.prod.yml ps` · `docker compose -f docker-compose.prod.yml logs api web caddy` |
| 로그인 후 바로 로그아웃 | `JWT_SECRET` 변경 후 기존 토큰 무효 — 재로그인 |
| 사진 안 보임 | `APP_PUBLIC_URL`과 실제 접속 URL 일치, HTTPS면 `COOKIE_SECURE` |
| 마이그레이션 실패 | API 로그에서 Prisma 오류 — DB 비밀번호·`DATABASE_URL` 확인 |
| Proxmox 설치 실패 (release) | `export KIBBLE_REF=master` 후 재시도 (§2) |

로컬 소스 빌드(`git clone` 루트)에서는 `-f docker-compose.prod.yml` 없이 `docker compose logs …` 를 씁니다.

API 문서: [`docs/api.md`](./api.md)
