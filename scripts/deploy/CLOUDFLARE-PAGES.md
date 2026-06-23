# Cloudflare Pages 部署（前端 nes.zachuse.top）

前端：**Cloudflare Pages**  
后端：**43.136.63.40** 只跑信令 + Coturn（不托管静态页）

## DNS 分工（重要）

`nes.zachuse.top` 若绑到 Pages，**不能再** A 记录到腾讯云，否则和 Pages 冲突。

| 主机名 | 指向 | 代理 | 用途 |
|--------|------|------|------|
| `nes` | Cloudflare Pages（自定义域） | 橙云 ✓ | 游戏前端 HTTPS |
| `signal` | A → `43.136.63.40` | **灰云 DNS only** | WSS 信令 |
| `coturn` | A → `43.136.63.40` | **灰云 DNS only** | STUN/TURN（UDP 不能走橙云） |

域名 DNS 须托管在 **Cloudflare**，Pages 自定义域才能一键绑定 `nes.zachuse.top`。

若 DNS 仍在腾讯云：把 `nes` CNAME 到 `<project>.pages.dev`，或整域 NS 迁到 Cloudflare。

---

## 一、Cloudflare Pages

### 1. 创建项目

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 选择仓库 `contra`

### 2. 构建设置

你看到的若是 **Workers Builds**（有 Deploy command、没有 Build output directory），按下面填：

| 项 | 值 |
|----|-----|
| Production branch | `main` |
| Root directory | `/`（仓库根） |
| **Build command**（若有） | `npm ci && npm run build -w apps/web` |
| **Deploy command**（必填） | 见下方 |

**Deploy command（整行）：**

```bash
npm ci && npm run build -w apps/web && cd apps/web && npx wrangler pages deploy dist --project-name=contra-nes --commit-dirty=true
```

或 `bash scripts/deploy/cloudflare-deploy.sh`

| 命令 | 说明 |
|------|------|
| `wrangler pages deploy dist …` | ✅ Pages 项目 |
| `wrangler deploy` | ❌ Worker 命令，Pages 项目会报错 |

Token 须为 **Edit Cloudflare Pages**（见 [CLOUDFLARE-API-TOKEN.md](./CLOUDFLARE-API-TOKEN.md)）。

若是**经典 Pages**（有 Build output directory、Deploy 可留空）：

| 项 | 值 |
|----|-----|
| Build command | `npm ci && npm run build -w apps/web` |
| Build output directory | `apps/web/dist` |
| Deploy command | 留空 |

### 2.1 报错 Authentication error 10000

Token 权限不足或类型不对。完整步骤见 **[CLOUDFLARE-API-TOKEN.md](./CLOUDFLARE-API-TOKEN.md)**。

快速检查：

1. 重新创建 Token，模板选 **Edit Cloudflare Pages**
2. 环境变量：`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID=347bc1ac321e89f0efd5ed1611c18060`
3. Deploy 使用 `cd apps/web && npx wrangler pages deploy dist --project-name=contra-nes --commit-dirty=true`
4. Retry deployment

### 3. 环境变量（Settings → Environment variables → Production）

| 名称 | 值 |
|------|-----|
| `VITE_SIGNALING_URL` | `wss://signal.zachuse.top/ws` |
| `VITE_ICE_SERVERS` | `[{"urls":"stun:coturn.zachuse.top:3478"},{"urls":"turn:coturn.zachuse.top:3478","username":"contra","credential":"你的TURN密码"}]` |

`VITE_ICE_SERVERS` 须为**单行 JSON**，密码与服务器 Coturn `user=contra:xxx` 一致。

也可本地对照：`scripts/deploy/env.production.zachuse.top`

### 4. 自定义域

Pages 项目 → **Custom domains** → 添加 `nes.zachuse.top`。

### 5. COOP / COEP

`apps/web/public/_headers` 会打进 `dist`，Pages 自动生效（SharedArrayBuffer 必需）。  
SPA 路由：`public/_redirects` 已配置。

### 6. 本地预览生产构建

```bash
cp scripts/deploy/env.production.zachuse.top apps/web/.env.production.local
# 编辑 TURN 密码
npm run build -w apps/web
npm run preview -w apps/web
```

---

## 二、腾讯云 43.136.63.40（OpenCloudOS 9 · 信令 + Coturn）

系统：**OpenCloudOS 9**（`dnf`）。完整步骤见 [DEPLOY-STEPS.md](./DEPLOY-STEPS.md)。

```bash
# 依赖（或 sudo bash scripts/deploy/opencloudos-server.sh）
sudo dnf install -y epel-release
sudo dnf install -y nginx certbot python3-certbot-nginx coturn git curl
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# 证书
sudo certbot certonly --nginx -d signal.zachuse.top
sudo certbot certonly --nginx -d coturn.zachuse.top

# Coturn（OpenCloudOS 路径）
sudo cp scripts/deploy/coturn.zachuse.top.conf /etc/coturn/turnserver.conf
sudo systemctl restart coturn

# Nginx（conf.d）
sudo cp scripts/deploy/nginx.signal.zachuse.top.conf /etc/nginx/conf.d/contra-signal.conf
sudo nginx -t && sudo systemctl reload nginx

# SELinux
sudo setsebool -P httpd_can_network_connect 1
```

**不要**使用 `nginx.nes.zachuse.top.conf`（旧方案：整机托管静态页）。  
**不要**把 Coturn 配置拷到 `/etc/turnserver.conf`（Debian 路径，OpenCloudOS 无效）。

防火墙：腾讯云控制台 + 可选 firewalld（见 DEPLOY-STEPS 第 4、5.6 步）。

---

## 三、验证

1. **https://nes.zachuse.top** — Pages 前端，能进大厅  
2. 大厅信令默认应为 `wss://signal.zachuse.top/ws`（构建时已注入）  
3. [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)：`stun:coturn.zachuse.top:3478` / TURN 同域，出现 **relay**  
4. 两人跨网同房，「已模拟 N 帧」递增，WRAM hash 一致  

---

## 架构图

```
https://nes.zachuse.top          → Cloudflare Pages（WASM/JS）
wss://signal.zachuse.top/ws → 43.136.63.40 Nginx → Node :8080
stun/turn:coturn.zachuse.top:3478 → 43.136.63.40 Coturn
```
