#!/usr/bin/env bash
set -euo pipefail
cd /opt/contra/apps/signaling
NODE="$(command -v node)"
if [[ -z "$NODE" ]]; then
  echo "node not found in PATH" >&2
  exit 127
fi
if [[ ! -f dist/index.js ]]; then
  echo "missing dist/index.js — run: cd /opt/contra && npm run build -w apps/signaling" >&2
  exit 1
fi
exec "$NODE" dist/index.js
