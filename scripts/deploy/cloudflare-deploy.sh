#!/usr/bin/env bash
# Cloudflare Workers Builds — Deploy command（必填 ApiToken 时）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT:-contra-nes}"

cd "$ROOT"
npm ci
npm run build -w apps/web

cd "$ROOT/apps/web"
if [[ ! -d dist ]]; then
  echo "[deploy] missing apps/web/dist — build failed?" >&2
  exit 1
fi

# Pages 项目必须用 pages deploy；在 apps/web 内执行避免 monorepo workspace 报错
npx wrangler pages deploy dist \
  --project-name="$PROJECT_NAME" \
  --commit-dirty=true
