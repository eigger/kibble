#!/usr/bin/env bash
set -euo pipefail

# Copyright (c) 2021-2026 community-scripts ORG
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Chassis derived from https://github.com/eigger/stash

export DEBIAN_FRONTEND=noninteractive
APT_QUIET_FLAGS=(-y -qq -o=Dpkg::Use-Pty=0)

KIBBLE_DIR=/opt/kibble
KIBBLE_REPO="${KIBBLE_REPO:-eigger/kibble}"

echo "[kibble-install] Updating apt indexes"
apt-get update "${APT_QUIET_FLAGS[@]}"

echo "[kibble-install] Installing base dependencies"
apt-get install "${APT_QUIET_FLAGS[@]}" curl sudo mc jq git openssl ca-certificates gnupg lsb-release

echo "[kibble-install] Installing Docker engine"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update "${APT_QUIET_FLAGS[@]}"
  apt-get install "${APT_QUIET_FLAGS[@]}" docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

echo "[kibble-install] Preparing ${KIBBLE_DIR}"
mkdir -p "$KIBBLE_DIR"
cd "$KIBBLE_DIR"

resolve_ref() {
  if [[ -n "${KIBBLE_REF:-}" ]]; then
    echo "$KIBBLE_REF"
    return
  fi
  local tag
  tag="$(curl -fsSL "https://api.github.com/repos/${KIBBLE_REPO}/releases/latest" | jq -r .tag_name)"
  if [[ -z "$tag" || "$tag" == "null" ]]; then
    echo "[kibble-install] Failed to resolve latest release tag (set KIBBLE_REF to override)" >&2
    exit 1
  fi
  echo "$tag"
}

KIBBLE_REF_RESOLVED="$(resolve_ref)"
RAW_BASE="https://raw.githubusercontent.com/${KIBBLE_REPO}/${KIBBLE_REF_RESOLVED}"
echo "[kibble-install] Fetching deploy files from ${KIBBLE_REF_RESOLVED}"

download() {
  local rel="$1"
  local dest="$2"
  curl -fsSL "${RAW_BASE}/${rel}" -o "$dest"
  if [[ ! -s "$dest" ]]; then
    echo "[kibble-install] Empty download: ${rel}" >&2
    exit 1
  fi
}

download docker-compose.prod.yml "${KIBBLE_DIR}/docker-compose.prod.yml"
download Caddyfile "${KIBBLE_DIR}/Caddyfile"
download proxmox/install/update.sh "${KIBBLE_DIR}/update.sh.tmp"
download proxmox/install/kibble.service /etc/systemd/system/kibble.service

if ! bash -n "${KIBBLE_DIR}/update.sh.tmp"; then
  echo "[kibble-install] update.sh failed syntax check" >&2
  exit 1
fi
install -m 0755 "${KIBBLE_DIR}/update.sh.tmp" /usr/bin/update
rm -f "${KIBBLE_DIR}/update.sh.tmp"

if ! docker compose -f "${KIBBLE_DIR}/docker-compose.prod.yml" config -q; then
  echo "[kibble-install] docker-compose.prod.yml failed validation" >&2
  exit 1
fi

{
  echo "compose $(sha256sum "${KIBBLE_DIR}/docker-compose.prod.yml" | awk '{print $1}')"
  echo "caddy $(sha256sum "${KIBBLE_DIR}/Caddyfile" | awk '{print $1}')"
  echo "ref ${KIBBLE_REF_RESOLVED}"
} >"${KIBBLE_DIR}/.kibble-manifest"

echo "[kibble-install] Generating .env secrets"
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
IP_ADDR_EARLY="$(hostname -I | awk '{print $1}')"
cat <<EOF >"${KIBBLE_DIR}/.env"
GH_REPOSITORY_OWNER=eigger
POSTGRES_USER=kibble
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=kibble
JWT_SECRET=${JWT_SECRET}
APP_PUBLIC_URL=http://${IP_ADDR_EARLY}

# HTTPS로 서비스할 때 미디어 쿠키에 Secure 플래그를 켜려면 주석을 해제하세요
# COOKIE_SECURE=true
EOF

systemctl daemon-reload
systemctl enable -q --now kibble.service

echo "[kibble-install] Setting up console auto-login for root"
mkdir -p /etc/systemd/system/container-getty@1.service.d/
cat <<'EOF' >/etc/systemd/system/container-getty@1.service.d/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear --keep-baud tty%I 115200,38400,9600 $TERM
EOF
systemctl daemon-reload
systemctl restart container-getty@1.service || true

IP_ADDR="$(hostname -I | awk '{print $1}')"
echo "[kibble-install] Completed successfully (ref ${KIBBLE_REF_RESOLVED})"
echo "Access URL: http://${IP_ADDR}:80"
echo "Later updates: run 'update' inside this container"
