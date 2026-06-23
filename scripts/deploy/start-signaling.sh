#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/contra"
SIG="$ROOT/apps/signaling"

log() {
  echo "[start-signaling] $*" >&2
}

find_node() {
  if [[ -n "${NODE_BIN:-}" && -x "$NODE_BIN" ]]; then
    echo "$NODE_BIN"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  # nvm 不会写入 systemd 的 PATH，需手动加载或指定 NODE_BIN
  local nvm_sh=""
  for candidate in \
    "${NVM_DIR:-$HOME/.nvm}/nvm.sh" \
    "/root/.nvm/nvm.sh" \
    "/home/${SUDO_USER:-root}/.nvm/nvm.sh"; do
    if [[ -s "$candidate" ]]; then
      nvm_sh="$candidate"
      break
    fi
  done

  if [[ -n "$nvm_sh" ]]; then
    # shellcheck disable=SC1090
    set +u
    # shellcheck source=/dev/null
    source "$nvm_sh"
    set -u
    if command -v node >/dev/null 2>&1; then
      command -v node
      return 0
    fi
  fi

  local p
  for p in /root/.nvm/versions/node/*/bin/node "$HOME/.nvm/versions/node/"*/bin/node; do
    if [[ -x "$p" ]]; then
      echo "$p"
      return 0
    fi
  done

  return 1
}

if [[ ! -d "$SIG" ]]; then
  log "目录不存在: $SIG"
  exit 1
fi

cd "$SIG"

NODE="$(find_node || true)"
if [[ -z "$NODE" ]]; then
  log "node 不在 PATH 中（systemd 不会加载 nvm 的 .bashrc）"
  log "修复任选其一:"
  log "  1) 在 /etc/contra/signaling.env 写 NODE_BIN=\$(which node) 的完整路径"
  log "  2) dnf 安装系统 Node: dnf install -y nodejs"
  log "  3) git pull 后确认本脚本已更新并 systemctl restart"
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
