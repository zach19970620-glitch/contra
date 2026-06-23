#!/usr/bin/env bash
# 在服务器 /opt/contra 下编译信令（dist 不在 git 里，部署必跑）
set -euo pipefail
cd /opt/contra
npm install
npm run build -w apps/signaling
test -f apps/signaling/dist/index.js
echo "OK: apps/signaling/dist/index.js"
