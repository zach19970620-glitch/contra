#!/usr/bin/env bash
# 备选：静态页 rsync 到腾讯云（使用 Pages 时不需要本脚本）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/scripts/deploy/env.production.zachuse.top"
TARGET="${DEPLOY_TARGET:-root@43.136.63.40:/var/www/contra/}"

echo "前端已改为 Cloudflare Pages，请见 scripts/deploy/CLOUDFLARE-PAGES.md"
echo "若仍要 rsync 到服务器，继续执行…"

cd "$ROOT"

if [[ ! -f apps/web/.env.production.local ]]; then
  cp "$ENV_FILE" apps/web/.env.production.local
  echo "请编辑 apps/web/.env.production.local（TURN 密码）后重新运行"
  exit 1
fi

npm run build -w apps/web
rsync -avz --delete apps/web/dist/ "$TARGET"
echo "已发布到 $TARGET"
