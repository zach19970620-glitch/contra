# Cloudflare Pages 部署（前端 nes.zachuse.top）

前端：**Cloudflare Pages**  
后端：**43.136.63.40** 只跑信令 + Coturn（不托管静态页）

## DNS 分工（重要）

`nes.zachuse.top` 若绑到 Pages，**不能再** A 记录到腾讯云，否则和 Pages 冲突。

| 主机名 | 指向 | 代理 | 用途 |
|--------|------|------|------|
| `nes` | Cloudflare Pages（自定义域） | 橙云 ✓ | 游戏前端 HTTPS |
| `signal` | A → `43.136.63.40` | **灰云 DNS only** | WSS 信令 |
| `turn` | A → `43.136.63.40` | **灰云 DNS only** | STUN/TURN（UDP 不能走橙云） |

域名 DNS 须托管在 **Cloudflare**，Pages 自定义域才能一键绑定 `nes.zachuse.top`。

若 DNS 仍在腾讯云：把 `nes` CNAME 到 `<project>.pages.dev`，或整域 NS 迁到 Cloudflare。

---

## 一、Cloudflare Pages

### 1. 创建项目

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 选择仓库 `contra`

### 2. 构建设置

| 项 | 值 |
|----|-----|
| Production branch | `main` |
| Framework preset | None |
| Root directory | `/`（仓库根） |
| Build command | `npm ci && npm run build -w apps/web` |
| Build output directory | `apps/web/dist` |
| Node.js version | `20`（或依赖根目录 `.node-version`） |

### 3. 环境变量（Settings → Environment variables → Production）

| 名称 | 值 |
|------|-----|
| `VITE_SIGNALING_URL` | `wss://signal.nes.zachuse.top/ws` |
| `VITE_ICE_SERVERS` | `[{"urls":"stun:turn.nes.zachuse.top:3478"},{"urls":"turn:turn.nes.zachuse.top:3478","username":"contra","credential":"你的TURN密码"}]` |

`VITE_ICE_SERVERS` 须为**单行 JSON**，密码与服务器 Coturn `user=contra:xxx` 一致。

也可本地对照：`scripts/deploy/env.production.nes.zachuse.top`

### 4. 自定义域

Pages 项目 → **Custom domains** → 添加 `nes.zachuse.top`。

### 5. COOP / COEP

`apps/web/public/_headers` 会打进 `dist`，Pages 自动生效（SharedArrayBuffer 必需）。  
SPA 路由：`public/_redirects` 已配置。

### 6. 本地预览生产构建

```bash
cp scripts/deploy/env.production.nes.zachuse.top apps/web/.env.production.local
# 编辑 TURN 密码
npm run build -w apps/web
npm run preview -w apps/web
```

---

## 二、腾讯云 43.136.63.40（信令 + Coturn）

详见 [README.md](./README.md) 服务器章节；要点：

```bash
# 证书（两个子域）
sudo certbot certonly --nginx -d signal.nes.zachuse.top
sudo certbot certonly --nginx -d turn.nes.zachuse.top

# Coturn + 信令 systemd（同 README）
sudo cp scripts/deploy/coturn.nes.zachuse.top.conf /etc/turnserver.conf
sudo cp scripts/deploy/nginx.signal.nes.zachuse.top.conf /etc/nginx/sites-available/contra-signal
sudo ln -sf /etc/nginx/sites-available/contra-signal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**不要**再使用 `nginx.nes.zachuse.top.conf`（那是整机托管静态页的旧方案）。

防火墙仍放行：443（signal）、UDP/TCP 3478、TCP 5349、UDP 60000–60010。

---

## 三、验证

1. **https://nes.zachuse.top** — Pages 前端，能进大厅  
2. 大厅信令默认应为 `wss://signal.nes.zachuse.top/ws`（构建时已注入）  
3. [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)：`stun:turn.nes.zachuse.top:3478` / TURN 同域，出现 **relay**  
4. 两人跨网同房，「已模拟 N 帧」递增，WRAM hash 一致  

---

## 架构图

```
https://nes.zachuse.top          → Cloudflare Pages（WASM/JS）
wss://signal.nes.zachuse.top/ws → 43.136.63.40 Nginx → Node :8080
stun/turn:turn.nes.zachuse.top:3478 → 43.136.63.40 Coturn
```
