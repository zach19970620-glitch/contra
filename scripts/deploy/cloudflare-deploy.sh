#!/usr/bin/env bash
# Cloudflare Workers Builds — Deploy command（必填 ApiToken 时）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT:-contra-nes}"
PRODUCTION_BRANCH="${CF_PAGES_PRODUCTION_BRANCH:-main}"

cd "$ROOT"
npm ci
npm run build -w apps/web

cd "$ROOT/apps/web"
if [[ ! -d dist ]]; then
  echo "[deploy] missing apps/web/dist — build failed?" >&2
  exit 1
fi

# 首次部署前需有 Pages 项目；不存在则自动创建
if ! npx wrangler pages project list 2>/dev/null | grep -qw "$PROJECT_NAME"; then
  echo "[deploy] creating Pages project: $PROJECT_NAME (branch: $PRODUCTION_BRANCH)"
  npx wrangler pages project create "$PROJECT_NAME" --production-branch="$PRODUCTION_BRANCH"
else
  echo "[deploy] Pages project exists: $PROJECT_NAME"
fi

# Pages 项目必须用 pages deploy；在 apps/web 内执行避免 monorepo workspace 报错
npx wrangler pages deploy dist \
  --project-name="$PROJECT_NAME" \
  --commit-dirty=true
