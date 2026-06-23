# 部署：nes.zachuse.top + 43.136.63.40

**服务器系统：OpenCloudOS 9**（`dnf` + EPEL；路径与 Ubuntu 不同见 [DEPLOY-STEPS.md](./DEPLOY-STEPS.md)）

## 推荐架构（当前）

| 组件 | 位置 |
|------|------|
| 前端 `https://nes.zachuse.top` | **Cloudflare Pages** → [CLOUDFLARE-PAGES.md](./CLOUDFLARE-PAGES.md) |
| 信令 `wss://signal.zachuse.top/ws` | OpenCloudOS · Nginx → Node :8080 |
| STUN/TURN `turn.zachuse.top:3478` | OpenCloudOS · Coturn |

**逐步清单：** [DEPLOY-STEPS.md](./DEPLOY-STEPS.md)

---

## DNS（Cloudflare 控制台）

| 记录 | 类型 | 值 | 代理 |
|------|------|-----|------|
| `nes` | Pages 自定义域 | （Pages 自动） | 橙云 |
| `signal` | A | `43.136.63.40` | **仅 DNS** |
| `turn` | A | `43.136.63.40` | **仅 DNS** |

---

## 腾讯云防火墙 + firewalld

腾讯云轻量 **防火墙** 必开：443、80、UDP/TCP 3478、5349、UDP 60000–60010。

若服务器内 **firewalld** 也在跑，执行：

```bash
sudo bash /opt/contra/scripts/deploy/opencloudos-server.sh
# 或见 DEPLOY-STEPS.md 第 5.6 步
```

---

## OpenCloudOS 9 快速装依赖

```bash
sudo dnf install -y epel-release
sudo dnf install -y nginx git curl certbot python3-certbot-nginx coturn
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
sudo systemctl enable --now nginx
sudo setsebool -P httpd_can_network_connect 1
```

或一键：`sudo bash scripts/deploy/opencloudos-server.sh`

---

## 服务器初始化

```bash
sudo mkdir -p /opt/contra
sudo chown -R $USER:$USER /opt/contra
git clone https://github.com/zach19970620-glitch/contra.git /opt/contra
cd /opt/contra
npm install
npm run build -w apps/signaling
```

### HTTPS 证书

```bash
sudo certbot certonly --nginx -d signal.zachuse.top
sudo certbot certonly --nginx -d turn.zachuse.top
```

### Coturn（注意路径）

```bash
# 编辑密码后：
sudo cp /opt/contra/scripts/deploy/coturn.zachuse.top.conf /etc/coturn/turnserver.conf
sudo systemctl enable coturn && sudo systemctl restart coturn
```

### 信令 systemd

```bash
sudo cp /opt/contra/scripts/deploy/contra-signaling.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable contra-signaling && sudo systemctl start contra-signaling
```

### Nginx（conf.d，非 sites-available）

```bash
sudo cp /opt/contra/scripts/deploy/nginx.signal.zachuse.top.conf /etc/nginx/conf.d/contra-signal.conf
sudo mv /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.bak 2>/dev/null || true
sudo nginx -t && sudo systemctl reload nginx
```

---

## OpenCloudOS vs Ubuntu 差异

| 项 | OpenCloudOS 9 | Ubuntu |
|----|-----------------|--------|
| 包管理 | `dnf` + `epel-release` | `apt` |
| Coturn 配置 | `/etc/coturn/turnserver.conf` | `/etc/turnserver.conf` |
| Nginx 站点 | `/etc/nginx/conf.d/*.conf` | `sites-available` + `sites-enabled` |
| 信令服务用户 | `root`（无 www-data） | 可用 www-data |
| SELinux | 需 `httpd_can_network_connect` | 通常无 |

---

## 环境变量摘要

| 变量 | 值 |
|------|-----|
| Pages `VITE_SIGNALING_URL` | `wss://signal.zachuse.top/ws` |
| STUN | `stun:turn.zachuse.top:3478` |
| TURN | `turn:turn.zachuse.top:3478`，用户 `contra` |

---

## 备选：整机 Nginx 托管前端

不用 Pages 时，见 `nginx.nes.zachuse.top.conf` + `publish-web.sh`（旧方案）。
