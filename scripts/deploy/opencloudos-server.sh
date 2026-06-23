#!/usr/bin/env bash
# OpenCloudOS 9 服务器一键装依赖（不代替 Coturn 密码、certbot、Pages 配置）
# 用法：bash opencloudos-server.sh
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请用 root 运行：sudo bash $0"
  exit 1
fi

echo "==> 安装 EPEL + 基础包"
dnf install -y epel-release
dnf install -y nginx git curl certbot python3-certbot-nginx coturn

echo "==> 安装 Node.js 20"
need_node=0
if ! command -v node >/dev/null; then
  need_node=1
else
  major="$(node -v | tr -d 'v' | cut -d. -f1)"
  [[ "$major" -lt 20 ]] && need_node=1
fi
if [[ "$need_node" -eq 1 ]]; then
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
  dnf install -y nodejs
fi
node -v
npm -v

echo "==> 启动 nginx"
systemctl enable --now nginx

echo "==> SELinux：允许 Nginx 反代到本机 Node（若 SELinux 为 Enforcing）"
if command -v getenforce >/dev/null && [[ "$(getenforce)" != "Disabled" ]]; then
  setsebool -P httpd_can_network_connect 1 || true
fi

echo "==> 可选：firewalld 放行（若 systemctl is-active firewalld 为 active）"
if systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=http
  firewall-cmd --permanent --add-service=https
  firewall-cmd --permanent --add-port=3478/tcp
  firewall-cmd --permanent --add-port=3478/udp
  firewall-cmd --permanent --add-port=5349/tcp
  firewall-cmd --permanent --add-port=60000-60010/udp
  firewall-cmd --reload
  echo "firewalld 规则已添加"
else
  echo "firewalld 未运行，请确认腾讯云控制台防火墙已放行端口"
fi

echo "完成。接下来按 DEPLOY-STEPS.md 第 5.3 步起继续（clone / certbot / coturn / systemd）。"
