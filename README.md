# kibble

[![CI](https://github.com/eigger/kibble/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/eigger/kibble/actions/workflows/ci.yml)
[![Docker Release](https://github.com/eigger/kibble/actions/workflows/docker-release.yml/badge.svg)](https://github.com/eigger/kibble/actions/workflows/docker-release.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/eigger/kibble)](https://github.com/eigger/kibble/blob/master/LICENSE)
[![Self-hosted](https://img.shields.io/badge/hosting-self--hosted-2563EB)](proxmox/ct/kibble.sh)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Feigger%2Fkibble-2496ED?logo=docker&logoColor=white)](https://github.com/eigger/kibble/pkgs/container/kibble-api)

**[한국어 README](./README.ko.md)**

Self-hosted pet diary focused on **low-friction input** — quick chips for routine care, free-text and photos when you need detail, and a token-authenticated API for automations.

> **Status:** Phase 1 **implementation complete** — personal-use gate in progress ([`docs/WORKPLAN.md`](docs/WORKPLAN.md) §5.6). Builds are published to [Releases](https://github.com/eigger/kibble/releases); deploy with [`docs/deploy.md`](./docs/deploy.md).

Docs: [`docs/`](./docs/) · [`docs/PROJECT.md`](docs/PROJECT.md) · [`docs/WORKPLAN.md`](docs/WORKPLAN.md) · [`docs/deploy.md`](docs/deploy.md)

---

## Features

- **One-tap logging** — preset chips for routine care (meals, water, walks, litter); a detail sheet appears only when you need amount, product, clinic, or a note
- **Free text, never rejected** — write several lines at once and they are parsed into separate events; anything that does not parse is kept as a note, and the original text is always stored
- **Built-in event types** — feeding, water, excretion (7-point fecal score), activity, observation, medication, vet visits, grooming, weight, and free notes; new presets are data, not code
- **Medication courses** — doses per day with named time slots, daily progress, and web-push reminders
- **Photos and video** — up to 9 attachments per event, with chunked resumable upload for large files and video
- **Offline-first PWA** — records queue in IndexedDB while offline and sync themselves on reconnect, scoped to the account that made them
- **Household sharing** — the admin creates family accounts that either join the shared journal or get a separate one; OWNER / MEMBER / VIEWER roles
- **Token API for automation** — scoped tokens post to `POST /api/events`, so Home Assistant, iOS Shortcuts, ESPHome, or plain `curl` can log without a session ([`docs/api.md`](docs/api.md))
- **Trends** — weight, food, and water charts over configurable periods
- **Korean / English** throughout, light / dark themes with accent colors, and admin backup & restore

## One-click install (Proxmox)

On a **Proxmox VE** host:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/eigger/kibble/master/proxmox/ct/kibble.sh)"
```

Creates a Debian 13 LXC (2 GB RAM, 1 vCPU, 16 GB disk), installs Docker, writes secrets to `/opt/kibble/.env`, and starts the stack. Open `http://<LXC_IP>` and create the first admin account.

**Inside an existing Debian/Ubuntu host or LXC:**

```bash
curl -fsSL https://raw.githubusercontent.com/eigger/kibble/master/proxmox/install/kibble-install.sh | bash
```

Both install the **latest release**. To pin a different ref, set `KIBBLE_REF` (e.g. `export KIBBLE_REF=master` for the development branch).

Updates later (inside the container): `update` or `KIBBLE_REF=master update`. Details: [`docs/deploy.md`](./docs/deploy.md) §2.

---

## Quick start (development)

```bash
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD and JWT_SECRET (openssl rand -hex 32)

npm install
npm run prisma:generate
DATABASE_URL="postgresql://kibble:YOUR_PASSWORD@localhost:5433/kibble" \
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma --config apps/api/prisma.config.ts
npm run seed -w apps/api

npm run dev:api   # :8080
npm run dev:web   # :3000
```

Open `http://localhost:3000`, create the first admin account, and sign in.  
Navigation: Home · Record (`/q`) · History · More (settings, backup, …).

### Docker Compose

```bash
cp .env.example .env
# JWT_SECRET must not be empty/changeme/dev-secret-change-me when NODE_ENV=production

docker compose up --build
```

Caddy serves the stack on `http://localhost:80`.

---

## Chassis credit

Deployment, auth, PWA shell, backup/restore, and i18n patterns are adapted from **[stash](https://github.com/eigger/stash)** (MIT). kibble replaces the inventory domain with pet journaling ([`docs/WORKPLAN.md` §5.0](docs/WORKPLAN.md)).
