#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/contra"
SIG="$ROOT/apps/signaling"

log() {
  echo "[start-signaling] $*" >&2
}

cd "$SIG"

NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  log "node 不在 PATH 中"
  log "修复: curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && dnf install -y nodejs"
  exit 127
fi

if [[ ! -f "$SIG/dist/index.js" ]]; then
  log "缺少 $SIG/dist/index.js"
  log "修复: cd $ROOT && npm install && npm run build -w apps/signaling"
  exit 1
fi

if [[ ! -d "$ROOT/node_modules/ws" && ! -d "$SIG/node_modules/ws" ]]; then
  log "缺少 ws 依赖"
  log "修复: cd $ROOT && npm install"
  exit 1
fi

log "启动 $NODE ($("$NODE" -v)) → dist/index.js"
exec "$NODE" "$SIG/dist/index.js"
