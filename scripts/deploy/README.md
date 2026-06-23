# 部署：nes.zachuse.top + 43.136.63.40

## 推荐架构（当前）

| 组件 | 位置 |
|------|------|
| 前端 `https://nes.zachuse.top` | **Cloudflare Pages** → [CLOUDFLARE-PAGES.md](./CLOUDFLARE-PAGES.md) |
| 信令 `wss://signal.nes.zachuse.top/ws` | 腾讯云 Nginx 反代 → Node :8080 |
| STUN/TURN `turn.nes.zachuse.top:3478` | 腾讯云 Coturn |

---

## DNS（Cloudflare 控制台）

| 记录 | 类型 | 值 | 代理 |
|------|------|-----|------|
| `nes` | Pages 自定义域 | （Pages 自动） | 橙云 |
| `signal` | A | `43.136.63.40` | **仅 DNS** |
| `turn` | A | `43.136.63.40` | **仅 DNS** |

---

## 腾讯云防火墙

| 协议 | 端口 | 说明 |
|------|------|------|
| TCP | 443 | signal 子域 WSS |
| TCP | 80 | certbot（可选） |
| UDP | 3478 | STUN |
| TCP | 3478, 5349 | TURN |
| UDP | 60000–60010 | TURN 中继 |

---

## 服务器初始化（SSH → 43.136.63.40）

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx coturn git nodejs npm

sudo mkdir -p /opt/contra
sudo chown -R $USER:$USER /opt/contra
git clone https://github.com/zach19970620-glitch/contra.git /opt/contra
cd /opt/contra
npm install
npm run build -w apps/signaling
```

### HTTPS 证书

```bash
sudo certbot certonly --nginx -d signal.nes.zachuse.top
sudo certbot certonly --nginx -d turn.nes.zachuse.top
```

### Coturn

编辑 `scripts/deploy/coturn.nes.zachuse.top.conf` 中 `user=contra:强密码`，然后：

```bash
sudo cp /opt/contra/scripts/deploy/coturn.nes.zachuse.top.conf /etc/turnserver.conf
sudo systemctl enable coturn && sudo systemctl restart coturn
```

### 信令

```bash
sudo cp /opt/contra/scripts/deploy/contra-signaling.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable contra-signaling && sudo systemctl start contra-signaling
```

### Nginx（仅信令，无静态页）

```bash
sudo cp /opt/contra/scripts/deploy/nginx.signal.nes.zachuse.top.conf /etc/nginx/sites-available/contra-signal
sudo ln -sf /etc/nginx/sites-available/contra-signal /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo nginx -t && sudo systemctl reload nginx
```

---

## 环境变量摘要

| 变量 | 值 |
|------|-----|
| Pages `VITE_SIGNALING_URL` | `wss://signal.nes.zachuse.top/ws` |
| STUN | `stun:turn.nes.zachuse.top:3478` |
| TURN | `turn:turn.nes.zachuse.top:3478`，用户 `contra` |

---

## 备选：整机 Nginx 托管前端

不用 Pages 时，见 `nginx.nes.zachuse.top.conf` + `publish-web.sh`（旧方案）。
