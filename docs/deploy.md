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

---

## 1. Docker Compose (로컬·수동 서버)

### 1.1 소스에서 빌드 (개발·검증)

```bash
git clone https://github.com/eigger/kibble.git
cd kibble
cp .env.example .env
```

`.env`에서 반드시 설정:

- `POSTGRES_PASSWORD` — 임의의 강한 비밀번호
- `JWT_SECRET` — `openssl rand -hex 32` 로 생성

```bash
docker compose up --build -d
```

- 접속: **http://localhost** (Caddy `:80`)
- API 헬스: `http://localhost/health`
- 첫 방문 시 관리자 계정 생성 화면

중지: `docker compose down`  
데이터 유지: `pgdata`, `uploads` 볼륨 삭제하지 않기

### 1.2 GHCR 이미지 (프로덕션)

릴리스 태그가 GHCR에 올라간 뒤:

```bash
mkdir -p /opt/kibble && cd /opt/kibble
curl -fsSL -o docker-compose.prod.yml \
  https://raw.githubusercontent.com/eigger/kibble/master/docker-compose.prod.yml
curl -fsSL -o Caddyfile \
  https://raw.githubusercontent.com/eigger/kibble/master/Caddyfile
```

`.env` 예시:

```bash
GH_REPOSITORY_OWNER=eigger
POSTGRES_USER=kibble
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=kibble
JWT_SECRET=$(openssl rand -hex 32)
APP_PUBLIC_URL=http://YOUR_HOST_OR_TAILSCALE_NAME
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

Proxmox VE 호스트에서:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/eigger/kibble/master/proxmox/ct/kibble.sh)"
```

또는 컨테이너 안에서 수동:

```bash
curl -fsSL https://raw.githubusercontent.com/eigger/kibble/master/proxmox/install/kibble-install.sh | bash
```

설치 스크립트가 수행하는 것:

- Docker Engine 설치
- `/opt/kibble`에 `docker-compose.prod.yml`, `Caddyfile`, `.env` 생성
- `kibble.service` systemd 등록 및 기동

컨테이너 콘솔에 표시되는 `http://<IP>:80` 으로 접속합니다.

### 업데이트

LXC 안에서:

```bash
update
```

(`proxmox/install/update.sh` — 이미지 pull 후 `docker compose up -d`)

---

## 3. Tailscale로 폰·외부 접속 (P1-31)

1. LXC/서버에 [Tailscale](https://tailscale.com/) 설치 후 로그인
2. MagicDNS 이름 확인 (예: `kibble.lan`)
3. `.env`의 `APP_PUBLIC_URL`을 해당 URL로 맞춤  
   예: `http://kibble` 또는 `https://kibble` (Serve 사용 시)
4. 폰 Tailscale 앱에서 같은 URL 열기 → 로그인 → **홈 화면에 추가** (PWA)

HTTPS가 필요하면 Tailscale Serve/Funnel 또는 앞단 Caddy에 TLS를 추가합니다.  
`COOKIE_SECURE=true`는 HTTPS에서만 설정하세요.

---

## 4. GHCR 릴리스 워크플로 (P1-30)

- GitHub **Actions → Docker Release → Run workflow** (`workflow_dispatch`)
- 또는 GitHub **Release** 발행 시 자동 빌드·푸시

태그 예: `v0.7.4` → `ghcr.io/eigger/kibble-api:0.7.4`, `:latest`

> Phase 1 **게이트 통과 전**에는 태그를 남발하지 않습니다 ([`WORKPLAN.md`](../WORKPLAN.md) §5.6).

---

## 5. 환경 변수 요약

| 변수 | 필수 | 설명 |
|---|---|---|
| `POSTGRES_PASSWORD` | ✓ | DB 비밀번호 |
| `JWT_SECRET` | ✓ | 세션 서명 (`openssl rand -hex 32`). 프로덕션에서 `changeme`·`dev-secret-change-me` 거부 |
| `APP_PUBLIC_URL` | 권장 | 미디어 쿠키·절대 URL용. 실제 접속 URL과 일치 |
| `COOKIE_SECURE` | HTTPS 시 | `true` — HTTP만 쓰면 `false` 또는 생략 |
| `GH_REPOSITORY_OWNER` | prod | GHCR 이미지 소유자 (기본 `eigger`) |

전체 예시: [`.env.example`](../.env.example)

---

## 6. 첫 실행 후

1. 브라우저에서 `/` 접속
2. **관리자 계정** 생성 (최초 1회)
3. 온보딩에서 반려동물 이름·종 입력 → 기본 기록 칩 자동 생성
4. (선택) 설정 → 백업, 계정 추가, API 토큰

---

## 7. 문제 해결

| 증상 | 확인 |
|---|---|
| 502 / 연결 안 됨 | `docker compose ps`, `docker compose logs api web caddy` |
| 로그인 후 바로 로그아웃 | `JWT_SECRET` 변경 후 기존 토큰 무효 — 재로그인 |
| 사진 안 보임 | `APP_PUBLIC_URL`과 실제 접속 URL 일치, HTTPS면 `COOKIE_SECURE` |
| 마이그레이션 실패 | API 로그에서 Prisma 오류 — DB 비밀번호·`DATABASE_URL` 확인 |

API 문서: [`docs/api.md`](./api.md)
