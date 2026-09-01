# kibble

[![CI](https://github.com/eigger/kibble/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/eigger/kibble/actions/workflows/ci.yml)
[![Docker Release](https://github.com/eigger/kibble/actions/workflows/docker-release.yml/badge.svg)](https://github.com/eigger/kibble/actions/workflows/docker-release.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/eigger/kibble)](https://github.com/eigger/kibble/blob/master/LICENSE)
[![Self-hosted](https://img.shields.io/badge/hosting-self--hosted-2563EB)](proxmox/ct/kibble.sh)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Feigger%2Fkibble-2496ED?logo=docker&logoColor=white)](https://github.com/eigger/kibble/pkgs/container/kibble-api)

**[한국어 README](./README.ko.md)**

Self-hosted pet diary focused on **low-friction input** — quick chips for routine care, free-text and photos when you need detail, and a token-authenticated API for automations.

> **Status:** Phase 1 **implementation complete** — personal-use gate in progress ([`WORKPLAN.md`](./WORKPLAN.md) §5.6). Deploy with [`docs/deploy.md`](./docs/deploy.md). Release tags after the gate passes.

Docs: [`PROJECT.md`](./PROJECT.md) · [`WORKPLAN.md`](./WORKPLAN.md) · [`docs/deploy.md`](./docs/deploy.md)

---

## Quick start (development)

```bash
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD and JWT_SECRET (openssl rand -hex 32)

npm install
npm run prisma:generate
DATABASE_URL="postgresql://kibble:YOUR_PASSWORD@localhost:5433/kibble" npm run prisma:migrate -w apps/api

npm run dev:api   # :8080
npm run dev:web   # :3000
```

Open `http://localhost:3000`, create the first admin account, and sign in.

### Docker Compose

```bash
cp .env.example .env
# JWT_SECRET must not be empty/changeme/dev-secret-change-me when NODE_ENV=production

docker compose up --build
```

Caddy serves the stack on `http://localhost:80`.

### Proxmox LXC

Use [`proxmox/ct/kibble.sh`](proxmox/ct/kibble.sh) or install manually with [`proxmox/install/kibble-install.sh`](proxmox/install/kibble-install.sh).

---

## Chassis credit

Deployment, auth, PWA shell, backup/restore, and i18n patterns are adapted from **[stash](https://github.com/eigger/stash)** (MIT). kibble replaces the inventory domain with pet journaling ([`WORKPLAN.md` §5.0](WORKPLAN.md)).
