# kibble

[![CI](https://github.com/eigger/kibble/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/eigger/kibble/actions/workflows/ci.yml)
[![Docker Release](https://github.com/eigger/kibble/actions/workflows/docker-release.yml/badge.svg)](https://github.com/eigger/kibble/actions/workflows/docker-release.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/eigger/kibble)](https://github.com/eigger/kibble/blob/master/LICENSE)
[![Self-hosted](https://img.shields.io/badge/hosting-self--hosted-2563EB)](proxmox/ct/kibble.sh)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Feigger%2Fkibble-2496ED?logo=docker&logoColor=white)](https://github.com/eigger/kibble/pkgs/container/kibble-api)

**[English README](./README.md)**

**입력 마찰을 최소화**하는 셀프호스트 반려동물 일지 — 평소엔 퀵 칩 1탭, 필요할 땐 자유 텍스트·사진, 자동화는 토큰 API로.

> **상태:** Phase 1 **구현 완료** — 실사용 게이트 진행 중 ([`docs/WORKPLAN.md`](docs/WORKPLAN.md) §5.6). 빌드는 [Releases](https://github.com/eigger/kibble/releases)에 게시되며, 배포는 [`docs/deploy.md`](./docs/deploy.md)를 따릅니다.

문서: [`docs/`](./docs/) · [`docs/PROJECT.md`](docs/PROJECT.md) · [`docs/WORKPLAN.md`](docs/WORKPLAN.md) · [`docs/deploy.md`](docs/deploy.md)

---

## 기능

- **1탭 기록** — 평소 반복하는 기록은 프리셋 칩 하나로. 양·제품·병원·메모가 필요할 때만 상세 시트가 열립니다
- **거부당하지 않는 자유 텍스트** — 여러 줄을 한 번에 써서 각각의 기록으로 나눕니다. 파싱하지 못한 문장은 메모로 흡수하고 **원문은 언제나 보존**합니다
- **기본 이벤트 타입** — 사료·음수·배변(대변 1~7 스코어)·활동·관찰·투약·병원·미용·체중·메모. 프리셋 추가는 코드가 아니라 데이터입니다
- **투약 과정** — 하루 복용 횟수와 시간 슬롯, 당일 진행률, 웹 푸시 리마인더
- **사진·영상** — 이벤트당 최대 9개, 대용량·영상은 이어 올리기 가능한 청크 업로드
- **오프라인 우선 PWA** — 오프라인에서 쓴 기록은 IndexedDB에 쌓였다가 연결이 돌아오면 자동 전송됩니다. 큐는 **기록한 계정의 것만** 전송합니다
- **가구 공유** — 관리자가 가족 계정을 만들고, 같은 일지에 합류(JOIN)하거나 별도 일지(SEPARATE)를 갖게 합니다. OWNER / MEMBER / VIEWER 역할
- **자동화용 토큰 API** — 스코프 토큰으로 `POST /api/events`. Home Assistant·iOS 단축어·ESPHome·`curl`이 세션 없이 기록합니다 ([`docs/api.md`](docs/api.md))
- **추세** — 체중·사료량·음수량 그래프, 기간 선택
- **한국어 / 영어** 전면 지원, 라이트·다크 테마와 액센트 컬러, 관리자 백업·복원

## 원클릭 설치 (Proxmox)

**Proxmox VE** 호스트에서:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/eigger/kibble/master/proxmox/ct/kibble.sh)"
```

Debian 13 LXC(2 GB RAM, 1 vCPU, 16 GB)를 만들고 Docker·`/opt/kibble` 스택을 기동합니다. `http://<LXC_IP>` 접속 후 첫 관리자 계정을 만듭니다.

**기존 Debian/Ubuntu 호스트·LXC 안에서 수동 설치:**

```bash
curl -fsSL https://raw.githubusercontent.com/eigger/kibble/master/proxmox/install/kibble-install.sh | bash
```

둘 다 **최신 릴리스**를 설치합니다. 다른 ref를 쓰려면 `KIBBLE_REF`를 지정합니다(예: 개발 브랜치는 `export KIBBLE_REF=master`).

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

웹을 오리진 루트가 아닌 서브패스에 붙이려면 웹 컨테이너에 `BASE_PATH`를 넣습니다
(예: `BASE_PATH=/kibble`). 이미지는 플레이스홀더로 빌드되고 기동 시
`apps/web/docker-entrypoint.sh`가 치환하므로, 같은 이미지로 루트·리버스 프록시 서브패스·
Home Assistant Ingress(설치본마다 경로가 달라 빌드 때 알 수 없음)를 커버합니다.

프록시도 그 프리픽스에 맞춰야 합니다. 웹 클라이언트는 `{BASE_PATH}/api/...`를 치지만
API는 여전히 `/api`에서 듣습니다. 기본 Caddyfile은 오리진 루트의 `/api`만 연결하므로,
서브패스에서는 API 요청에서 프리픽스를 벗기고 웹 요청은 남겨야 합니다 (`Caddyfile` 주석
예시). Home Assistant Ingress는 애드온 nginx가 이 작업을 합니다. `BASE_PATH`를 비우면
기존 루트 컴포즈 그대로입니다.

---

## 섀시 출처

배포·인증·PWA 셸·백업/복원·i18n 패턴은 **[stash](https://github.com/eigger/stash)**(MIT)에서 가져왔습니다. kibble은 재고 도메인 대신 반려동물 일지를 새로 씁니다 ([`docs/WORKPLAN.md` §5.0](docs/WORKPLAN.md)).
