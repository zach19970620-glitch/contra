#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/certs"
mkdir -p "$CERT_DIR"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "未找到 mkcert。请先安装："
  echo "  brew install mkcert nss"
  echo "  mkcert -install"
  exit 1
fi

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo localhost)"

mkcert -cert-file "$CERT_DIR/cert.pem" -key-file "$CERT_DIR/key.pem" \
  localhost 127.0.0.1 ::1 "$LAN_IP"

echo "证书已生成：$CERT_DIR"
echo "局域网 IP: $LAN_IP"
echo "前端: https://$LAN_IP:5173"
echo "信令: wss://$LAN_IP:8080"
