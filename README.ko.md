# kibble

[![CI](https://github.com/eigger/kibble/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/eigger/kibble/actions/workflows/ci.yml)
[![Docker Release](https://github.com/eigger/kibble/actions/workflows/docker-release.yml/badge.svg)](https://github.com/eigger/kibble/actions/workflows/docker-release.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/eigger/kibble)](https://github.com/eigger/kibble/blob/master/LICENSE)
[![Self-hosted](https://img.shields.io/badge/hosting-self--hosted-2563EB)](proxmox/ct/kibble.sh)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Feigger%2Fkibble-2496ED?logo=docker&logoColor=white)](https://github.com/eigger/kibble/pkgs/container/kibble-api)

**[English README](./README.md)**

**입력 마찰을 최소화**하는 셀프호스트 반려동물 일지 — 평소엔 퀵 칩 1탭, 필요할 땐 자유 텍스트·사진, 자동화는 토큰 API로.

> **상태:** Phase 1 **구현 완료** — 실사용 게이트 진행 중 ([`docs/WORKPLAN.md`](docs/WORKPLAN.md) §5.6). 배포는 [`docs/deploy.md`](./docs/deploy.md). 릴리스 태그는 게이트 통과 후.

문서: [`docs/`](./docs/) · [`docs/PROJECT.md`](docs/PROJECT.md) · [`docs/WORKPLAN.md`](docs/WORKPLAN.md) · [`docs/deploy.md`](docs/deploy.md)

---

## 원클릭 설치 (Proxmox)

**Proxmox VE** 호스트에서:

```bash
export KIBBLE_REF=master   # 첫 릴리스 태그 전까지; 이후 생략 가능
bash -c "$(curl -fsSL https://raw.githubusercontent.com/eigger/kibble/master/proxmox/ct/kibble.sh)"
```

Debian 13 LXC(2 GB RAM, 1 vCPU, 16 GB)를 만들고 Docker·`/opt/kibble` 스택을 기동합니다. `http://<LXC_IP>` 접속 후 첫 관리자 계정을 만듭니다.

**기존 Debian/Ubuntu 호스트·LXC 안에서 수동 설치:**

```bash
export KIBBLE_REF=master
curl -fsSL https://raw.githubusercontent.com/eigger/kibble/master/proxmox/install/kibble-install.sh | bash
```

업데이트(컨테이너 안): `update` 또는 `KIBBLE_REF=master update`. 자세한 내용: [`docs/deploy.md`](./docs/deploy.md) §2.

---

## 빠른 시작 (개발)

```bash
cp .env.example .env
# .env 편집 — POSTGRES_PASSWORD, JWT_SECRET (openssl rand -hex 32)

npm install
npm run prisma:generate
DATABASE_URL="postgresql://kibble:비밀번호@localhost:5433/kibble" \
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma --config apps/api/prisma.config.ts
npm run seed -w apps/api

npm run dev:api   # :8080
npm run dev:web   # :3000
```

`http://localhost:3000`에서 첫 관리자 계정을 만든 뒤 로그인합니다.  
UI: 홈 · 기록(`/q`) · 이력 · 더보기(설정·백업 등).

### Docker Compose

```bash
cp .env.example .env
# NODE_ENV=production 이면 JWT_SECRET 은 changeme/dev-secret-change-me 사용 불가

docker compose up --build
```

Caddy가 `http://localhost:80`에서 서비스합니다.

---

## 섀시 출처

배포·인증·PWA 셸·백업/복원·i18n 패턴은 **[stash](https://github.com/eigger/stash)**(MIT)에서 가져왔습니다. kibble은 재고 도메인 대신 반려동물 일지를 새로 씁니다 ([`docs/WORKPLAN.md` §5.0](docs/WORKPLAN.md)).
