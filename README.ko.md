# kibble

[![CI](https://github.com/eigger/kibble/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/eigger/kibble/actions/workflows/ci.yml)
[![Docker Release](https://github.com/eigger/kibble/actions/workflows/docker-release.yml/badge.svg)](https://github.com/eigger/kibble/actions/workflows/docker-release.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/eigger/kibble)](https://github.com/eigger/kibble/blob/master/LICENSE)
[![Self-hosted](https://img.shields.io/badge/hosting-self--hosted-2563EB)](proxmox/ct/kibble.sh)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Feigger%2Fkibble-2496ED?logo=docker&logoColor=white)](https://github.com/eigger/kibble/pkgs/container/kibble-api)

**[English README](./README.md)**

**입력 마찰을 최소화**하는 셀프호스트 반려동물 일지 — 평소엔 퀵 칩 1탭, 필요할 땐 자유 텍스트·사진, 자동화는 토큰 API로.

> **상태:** Phase 1 **구현 완료** — 실사용 게이트 진행 중 ([`WORKPLAN.md`](./WORKPLAN.md) §5.6). 배포는 [`docs/deploy.md`](./docs/deploy.md). 릴리스 태그는 게이트 통과 후.

문서: [`PROJECT.md`](./PROJECT.md) · [`WORKPLAN.md`](./WORKPLAN.md) · [`docs/deploy.md`](./docs/deploy.md)

---

## 빠른 시작 (개발)

```bash
cp .env.example .env
# .env 편집 — POSTGRES_PASSWORD, JWT_SECRET (openssl rand -hex 32)

npm install
npm run prisma:generate
DATABASE_URL="postgresql://kibble:비밀번호@localhost:5433/kibble" npm run prisma:migrate -w apps/api

npm run dev:api   # :8080
npm run dev:web   # :3000
```

`http://localhost:3000`에서 첫 관리자 계정을 만든 뒤 로그인합니다.

### Docker Compose

```bash
cp .env.example .env
# NODE_ENV=production 이면 JWT_SECRET 은 changeme/dev-secret-change-me 사용 불가

docker compose up --build
```

Caddy가 `http://localhost:80`에서 서비스합니다.

### Proxmox LXC

[`proxmox/ct/kibble.sh`](proxmox/ct/kibble.sh) 또는 [`proxmox/install/kibble-install.sh`](proxmox/install/kibble-install.sh)로 설치합니다.

> 게이트 전(릴리스 태그 없음): `export KIBBLE_REF=master` 후 실행. 자세한 내용은 [`docs/deploy.md`](./docs/deploy.md).

---

## 섀시 출처

배포·인증·PWA 셸·백업/복원·i18n 패턴은 **[stash](https://github.com/eigger/stash)**(MIT)에서 가져왔습니다. kibble은 재고 도메인 대신 반려동물 일지를 새로 씁니다 ([`WORKPLAN.md` §5.0](WORKPLAN.md)).
