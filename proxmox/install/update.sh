#!/usr/bin/env bash
# kibble LXC 업데이트 — compose/Caddyfile/자기 자신을 최신 릴리스에서 받아 적용한 뒤 이미지를 갱신한다.
set -euo pipefail

KIBBLE_DIR="${KIBBLE_DIR:-/opt/kibble}"
KIBBLE_REPO="${KIBBLE_REPO:-eigger/kibble}"
COMPOSE_FILE="${KIBBLE_DIR}/docker-compose.prod.yml"
CADDY_FILE="${KIBBLE_DIR}/Caddyfile"
MANIFEST="${KIBBLE_DIR}/.kibble-manifest"
UPDATE_BIN="${UPDATE_BIN:-/usr/bin/update}"
FORCE=0
HEALTH_TIMEOUT_SEC="${HEALTH_TIMEOUT_SEC:-60}"

set -a
# shellcheck disable=SC1091
[ -f /etc/profile.d/90-http-proxy.sh ] && . /etc/profile.d/90-http-proxy.sh
set +a

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      echo "Usage: update [--force]"
      echo "  --force  로컬 수정이 감지돼도 배포 파일을 덮어쓴다"
      echo "  KIBBLE_REF=master update  # 최신 릴리스 대신 특정 ref에서 받기"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$KIBBLE_DIR" ]]; then
  echo "No kibble installation found at ${KIBBLE_DIR}" >&2
  exit 1
fi

cd "$KIBBLE_DIR"

timestamp() { date +%Y%m%d%H%M%S; }

sha_of() {
  sha256sum "$1" | awk '{print $1}'
}

resolve_ref() {
  if [[ -n "${KIBBLE_REF:-}" ]]; then
    echo "$KIBBLE_REF"
    return
  fi
  local tag
  tag="$(curl -fsSL "https://api.github.com/repos/${KIBBLE_REPO}/releases/latest" | jq -r .tag_name)"
  if [[ -n "$tag" && "$tag" != "null" ]]; then
    echo "$tag"
    return
  fi
  echo "master"
}

raw_url() {
  local path="$1"
  echo "https://raw.githubusercontent.com/${KIBBLE_REPO}/${KIBBLE_REF_RESOLVED}/${path}"
}

download() {
  local path="$1"
  local dest="$2"
  if ! curl -fsSL "$(raw_url "$path")" -o "$dest"; then
    return 1
  fi
  if [[ ! -s "$dest" ]]; then
    echo "Downloaded empty file for ${path}" >&2
    return 1
  fi
  return 0
}

require_download() {
  if ! download "$@"; then
    echo "[update] Required download failed: $1" >&2
    exit 1
  fi
}

ensure_env_keys() {
  local envf="${KIBBLE_DIR}/.env"
  [[ -f "$envf" ]] || return 0
  if ! grep -qE '^#?[[:space:]]*COOKIE_SECURE=' "$envf"; then
    {
      echo ""
      echo "# HTTPS로 서비스할 때 미디어 쿠키에 Secure 플래그를 켜려면 주석을 해제하세요"
      echo "# COOKIE_SECURE=true"
    } >>"$envf"
    echo "[update] Appended COOKIE_SECURE hint to .env (values untouched)"
  fi
}

wait_healthy() {
  local i
  for i in $(seq 1 "$HEALTH_TIMEOUT_SEC"); do
    if curl -fsS -o /dev/null "http://127.0.0.1/health" 2>/dev/null; then
      return 0
    fi
    if docker compose -f "$COMPOSE_FILE" ps api 2>/dev/null | grep -qiE 'Restarting|Exit'; then
      sleep 1
      continue
    fi
    sleep 1
  done
  return 1
}

api_restarting() {
  docker compose -f "$COMPOSE_FILE" ps api 2>/dev/null | grep -qiE 'Restarting|Exit'
}

KIBBLE_REF_RESOLVED="$(resolve_ref)"
echo "[update] Using ref: ${KIBBLE_REF_RESOLVED}"

TMPDIR_UPD="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_UPD"' EXIT

if download proxmox/install/update.sh "${TMPDIR_UPD}/update.sh"; then
  if bash -n "${TMPDIR_UPD}/update.sh"; then
    if ! cmp -s "${TMPDIR_UPD}/update.sh" "$UPDATE_BIN" 2>/dev/null; then
      cp "$UPDATE_BIN" "${UPDATE_BIN}.bak.$(timestamp)" 2>/dev/null || true
      install -m 0755 "${TMPDIR_UPD}/update.sh" "$UPDATE_BIN"
      echo "[update] /usr/bin/update refreshed (takes effect next run)"
    fi
  else
    echo "[update] WARNING: new update.sh failed bash -n; keeping current updater" >&2
  fi
else
  echo "[update] WARNING: could not download update.sh; continuing with current updater" >&2
fi

require_download docker-compose.prod.yml "${TMPDIR_UPD}/docker-compose.prod.yml"
require_download Caddyfile "${TMPDIR_UPD}/Caddyfile"

# compose 파일이 /tmp 에 있으면 프로젝트 디렉터리가 거기로 잡혀 .env 를 못 읽고
# POSTGRES_PASSWORD·JWT_SECRET 경고가 난다. 설치 경로를 프로젝트로 고정한다.
if ! docker compose --project-directory "$KIBBLE_DIR" -f "${TMPDIR_UPD}/docker-compose.prod.yml" config -q; then
  echo "[update] New compose failed 'docker compose config'; aborting (stack untouched)" >&2
  exit 1
fi

check_local_mod() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 0
  [[ -f "$MANIFEST" ]] || return 0
  local expected actual
  expected="$(awk -v k="$key" '$1==k {print $2}' "$MANIFEST" || true)"
  [[ -n "$expected" ]] || return 0
  actual="$(sha_of "$file")"
  if [[ "$actual" != "$expected" ]]; then
    echo "[update] Local modifications detected in ${file}" >&2
    echo "         Re-run with --force to overwrite, or restore your edits after update." >&2
    return 1
  fi
  return 0
}

if [[ "$FORCE" -ne 1 ]]; then
  if ! check_local_mod "$COMPOSE_FILE" "compose"; then
    exit 1
  fi
  if ! check_local_mod "$CADDY_FILE" "caddy"; then
    exit 1
  fi
fi

TS="$(timestamp)"
BACKUP_COMPOSE=""
BACKUP_CADDY=""

if [[ -f "$COMPOSE_FILE" ]]; then
  BACKUP_COMPOSE="${COMPOSE_FILE}.bak.${TS}"
  cp -a "$COMPOSE_FILE" "$BACKUP_COMPOSE"
  if ! cmp -s "$COMPOSE_FILE" "${TMPDIR_UPD}/docker-compose.prod.yml"; then
    echo "[update] Diff docker-compose.prod.yml:"
    diff -u "$COMPOSE_FILE" "${TMPDIR_UPD}/docker-compose.prod.yml" || true
  fi
fi
if [[ -f "$CADDY_FILE" ]]; then
  BACKUP_CADDY="${CADDY_FILE}.bak.${TS}"
  cp -a "$CADDY_FILE" "$BACKUP_CADDY"
  if ! cmp -s "$CADDY_FILE" "${TMPDIR_UPD}/Caddyfile"; then
    echo "[update] Diff Caddyfile:"
    diff -u "$CADDY_FILE" "${TMPDIR_UPD}/Caddyfile" || true
  fi
fi

install -m 0644 "${TMPDIR_UPD}/docker-compose.prod.yml" "$COMPOSE_FILE"
install -m 0644 "${TMPDIR_UPD}/Caddyfile" "$CADDY_FILE"

{
  echo "compose $(sha_of "$COMPOSE_FILE")"
  echo "caddy $(sha_of "$CADDY_FILE")"
  echo "ref ${KIBBLE_REF_RESOLVED}"
} >"$MANIFEST"

ensure_env_keys

echo "[update] Pulling images..."
docker compose -f "$COMPOSE_FILE" pull
echo "[update] Recreating stack..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo "[update] Waiting for /health (up to ${HEALTH_TIMEOUT_SEC}s)..."
if wait_healthy && ! api_restarting; then
  docker image prune -f
  echo "kibble update completed (ref ${KIBBLE_REF_RESOLVED})."
  exit 0
fi

echo "[update] Health check failed — rolling back deploy files" >&2
if [[ -n "$BACKUP_COMPOSE" && -f "$BACKUP_COMPOSE" ]]; then
  cp -a "$BACKUP_COMPOSE" "$COMPOSE_FILE"
fi
if [[ -n "$BACKUP_CADDY" && -f "$BACKUP_CADDY" ]]; then
  cp -a "$BACKUP_CADDY" "$CADDY_FILE"
fi
if [[ -f "$COMPOSE_FILE" && -f "$CADDY_FILE" ]]; then
  {
    echo "compose $(sha_of "$COMPOSE_FILE")"
    echo "caddy $(sha_of "$CADDY_FILE")"
    echo "ref rollback"
  } >"$MANIFEST"
fi

docker compose -f "$COMPOSE_FILE" up -d --remove-orphans || true
echo "[update] Rollback applied. Inspect: docker compose -f ${COMPOSE_FILE} logs --tail=80 api" >&2
exit 1
