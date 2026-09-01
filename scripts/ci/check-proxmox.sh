#!/usr/bin/env bash
#
# Proxmox 설치·업데이트 스크립트와 배포 파일이 깨지지 않았는지 검증한다.
#
# 로컬 실행 예:
#   scripts/ci/check-proxmox.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\033[31mFAIL: %s\033[0m\n' "$1" >&2; exit 1; }

step "Bash syntax: proxmox/install/kibble-install.sh"
bash -n "$REPO_ROOT/proxmox/install/kibble-install.sh"

step "Bash syntax: proxmox/install/update.sh"
bash -n "$REPO_ROOT/proxmox/install/update.sh"

step "배포 파일 존재 확인"
for rel in \
  docker-compose.prod.yml \
  Caddyfile \
  proxmox/install/kibble-install.sh \
  proxmox/install/update.sh \
  proxmox/install/kibble.service \
  proxmox/ct/kibble.sh; do
  [[ -f "$REPO_ROOT/$rel" ]] || fail "missing $rel"
done

step "docker compose config (prod)"
COMPOSE_CMD=()
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "docker compose unavailable — compose 검증을 건너뜁니다."
  COMPOSE_CMD=()
fi

if [[ ${#COMPOSE_CMD[@]} -gt 0 ]]; then
  POSTGRES_PASSWORD=ci-test-password JWT_SECRET=ci-test-jwt-secret \
    "${COMPOSE_CMD[@]}" -f "$REPO_ROOT/docker-compose.prod.yml" config -q \
    || fail "docker-compose.prod.yml validation failed"
fi

step "install 스크립트가 참조하는 경로가 저장소에 있는지"
for rel in docker-compose.prod.yml Caddyfile proxmox/install/update.sh proxmox/install/kibble.service; do
  [[ -f "$REPO_ROOT/$rel" ]] || fail "install references missing file: $rel"
done

step "update.sh: 미사용(dangling) Docker 이미지 정리"
if grep -q 'docker image prune -f' "$REPO_ROOT/proxmox/install/update.sh"; then
  echo "docker image prune -f 확인"
else
  fail "update.sh에 docker image prune -f가 없습니다"
fi

echo
echo "Proxmox install/update 검증 완료."
