#!/usr/bin/env bash
# Cloudflare Workers Builds — Deploy command（必填 ApiToken 时）
# 更推荐：经典 Cloudflare Pages（Build output = apps/web/dist，Deploy 留空），见 CLOUDFLARE-PAGES.md
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

if ! grep -q "Contra Online" dist/index.html; then
  echo "[deploy] dist/index.html does not look like our Vite build" >&2
  exit 1
fi

echo "[deploy] dist ready: $(find dist -type f | wc -l | tr -d ' ') files"

# 首次部署前需有 Pages 项目；不存在则自动创建
list_json="$(npx wrangler pages project list --json 2>/dev/null || echo "[]")"
if ! echo "$list_json" | grep -q "\"Project Name\": \"$PROJECT_NAME\""; then
  echo "[deploy] creating Pages project: $PROJECT_NAME (branch: $PRODUCTION_BRANCH)"
  npx wrangler pages project create "$PROJECT_NAME" --production-branch="$PRODUCTION_BRANCH"
else
  echo "[deploy] Pages project exists: $PROJECT_NAME"
fi

# 必须 --branch=main，否则 CI 可能部署到 preview，pages.dev 仍显示空
echo "[deploy] uploading dist → Pages production branch: $PRODUCTION_BRANCH"
npx wrangler pages deploy dist \
  --project-name="$PROJECT_NAME" \
  --branch="$PRODUCTION_BRANCH" \
  --commit-dirty=true

echo "[deploy] done. open: https://${PROJECT_NAME}.pages.dev"
