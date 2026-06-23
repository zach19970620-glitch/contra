# 魂斗罗联机 · 部署清单（逐条执行）

按顺序做，做完一条勾一条。  
目标：**前端** `https://nes.zachuse.top`（Cloudflare Pages）+ **信令/TURN**（腾讯云 `43.136.63.40`）。

---

## 开始前准备

| 项 | 你的值 |
|----|--------|
| 域名 | `nes.zachuse.top`（父域一般是 `zachuse.top`） |
| 服务器 IP | `43.136.63.40` |
| GitHub 仓库 | `https://github.com/zach19970620-glitch/contra` |
| SSH 登录 | `ssh root@43.136.63.40`（用户名按你实际改） |

先想一个 **TURN 强密码**（例如 20 位随机字符），后面 Coturn 和 Cloudflare 要用**同一个**。

---

## 第 1 部分：代码推上 GitHub

- [ ] **1.1** 本地项目已包含最新部署配置（`wrangler.toml`、`scripts/deploy/` 等）
- [ ] **1.2** 提交并 push 到 GitHub `main` 分支：

```bash
cd /Users/zach/Desktop/contra
git add -A
git status          # 确认没有 .env.production.local、密码文件
git commit -m "deploy: Cloudflare Pages + signal/turn subdomains"
git push origin main
```

- [ ] **1.3** 打开 GitHub 仓库，确认 `main` 上能看到 `scripts/deploy/` 和 `wrangler.toml`

---

## 第 2 部分：域名迁到 Cloudflare（若已在 CF 可跳过 2.1）

- [ ] **2.1** 登录 [Cloudflare](https://dash.cloudflare.com) → **Add a site** → 输入 `zachuse.top`（或你托管 `nes.zachuse.top` 的那一层域）
- [ ] **2.2** 按提示把域名 **NS 服务器** 改成 Cloudflare 给的（在域名注册商处改）
- [ ] **2.3** 等 Cloudflare 显示域名 **Active**（通常几分钟到 48 小时）

> 若 `zachuse.top` 已在 Cloudflare，直接从第 3 部分开始。

---

## 第 3 部分：Cloudflare DNS 记录

在 Cloudflare → **zachuse.top** → **DNS** → **Records**：

> 若你的 Zone 是 `nes.zachuse.top` 而不是 `zachuse.top`，下面名称里的 `signal.nes` 改成 `signal`，`turn.nes` 改成 `turn`。

- [ ] **3.1** 删除旧的冲突记录：若有 `nes` 指向 `43.136.63.40` 的 A 记录，**删掉**（前端改走 Pages）

- [ ] **3.2** 添加 **信令** 记录：

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `signal.nes` | `43.136.63.40` | **DNS only（灰云）** |

- [ ] **3.3** 添加 **TURN** 记录：

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `turn.nes` | `43.136.63.40` | **DNS only（灰云）** |

- [ ] **3.4** 本机验证解析（等 1～5 分钟再试）：

```bash
dig +short signal.nes.zachuse.top
dig +short turn.nes.zachuse.top
# 都应返回 43.136.63.40
```

---

## 第 4 部分：腾讯云防火墙

登录腾讯云 → 轻量服务器 → **防火墙**：

- [ ] **4.1** TCP **443** 允许（信令 HTTPS/WSS）
- [ ] **4.2** TCP **80** 允许（申请证书用，可选）
- [ ] **4.3** UDP **3478** 允许（STUN，必开）
- [ ] **4.4** TCP **3478** 允许
- [ ] **4.5** TCP **5349** 允许
- [ ] **4.6** UDP **60000–60010** 允许（TURN 中继）

---

## 第 5 部分：服务器安装依赖

SSH 登录服务器：

```bash
ssh root@43.136.63.40
```

- [ ] **5.1** 更新并安装软件（Ubuntu/Debian）：

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx coturn git curl
```

- [ ] **5.2** 安装 **Node.js 20+**（若 `node -v` 低于 20）：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # 应 >= v20
npm -v
```

- [ ] **5.3** 克隆项目：

```bash
sudo mkdir -p /opt/contra
sudo chown -R $USER:$USER /opt/contra
git clone https://github.com/zach19970620-glitch/contra.git /opt/contra
cd /opt/contra
npm install
npm run build -w apps/signaling
```

- [ ] **5.4** 确认存在 `apps/signaling/dist/index.js`：

```bash
ls -la /opt/contra/apps/signaling/dist/index.js
```

---

## 第 6 部分：配置 TURN 密码

- [ ] **6.1** 编辑 Coturn 配置，把密码改成你第 0 步想的强密码：

```bash
nano /opt/contra/scripts/deploy/coturn.nes.zachuse.top.conf
```

找到这一行并修改：

```
user=contra:这里填你的强密码
```

保存退出（Ctrl+O Enter，Ctrl+X）。

- [ ] **6.2** 记下：`用户名 contra`，`密码 ______`（后面填 Cloudflare 环境变量要用）

---

## 第 7 部分：HTTPS 证书（Let's Encrypt）

**必须先完成第 3 部分 DNS**，否则 certbot 会失败。

- [ ] **7.1** 临时允许 certbot 走 nginx 插件（若 nginx 尚未配置，先装默认站也能过）：

```bash
sudo certbot certonly --nginx -d signal.nes.zachuse.top
```

- [ ] **7.2** 再申请 turn 域证书：

```bash
sudo certbot certonly --nginx -d turn.nes.zachuse.top
```

- [ ] **7.3** 确认证书文件存在：

```bash
sudo ls /etc/letsencrypt/live/signal.nes.zachuse.top/
sudo ls /etc/letsencrypt/live/turn.nes.zachuse.top/
```

---

## 第 8 部分：启动 Coturn

- [ ] **8.1** 安装配置并启动：

```bash
sudo cp /opt/contra/scripts/deploy/coturn.nes.zachuse.top.conf /etc/turnserver.conf
sudo systemctl enable coturn
sudo systemctl restart coturn
```

- [ ] **8.2** 检查状态（应为 active）：

```bash
sudo systemctl status coturn
```

若失败：`sudo journalctl -u coturn -n 50` 查看日志（常见：证书路径错、3478 端口被占）。

---

## 第 9 部分：启动信令服务（Node）

- [ ] **9.1** 安装 systemd 服务：

```bash
sudo cp /opt/contra/scripts/deploy/contra-signaling.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable contra-signaling
sudo systemctl start contra-signaling
```

- [ ] **9.2** 检查状态：

```bash
sudo systemctl status contra-signaling
curl -I http://127.0.0.1:8080   # 可能返回 404/426，说明进程在监听即可
```

---

## 第 10 部分：Nginx 反代信令

- [ ] **10.1** 启用信令站点配置：

```bash
sudo cp /opt/contra/scripts/deploy/nginx.signal.nes.zachuse.top.conf /etc/nginx/sites-available/contra-signal
sudo ln -sf /etc/nginx/sites-available/contra-signal /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

- [ ] **10.2** 测试 HTTPS（应返回 404，不是连接失败）：

```bash
curl -I https://signal.nes.zachuse.top/ws
```

---

## 第 11 部分：Cloudflare Pages 创建项目

- [ ] **11.1** 打开 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
- [ ] **11.2** 授权 GitHub，选择仓库 **contra**
- [ ] **11.3** 构建设置 **逐项填写**：

| 字段 | 填写 |
|------|------|
| Production branch | `main` |
| Framework preset | **None** |
| Root directory | 留空（表示仓库根 `/`） |
| Build command | `npm ci && npm run build -w apps/web` |
| Build output directory | `apps/web/dist` |

- [ ] **11.4** **Environment variables** → **Production** → 添加两个变量：

**变量 1**

| Name | Value |
|------|-------|
| `VITE_SIGNALING_URL` | `wss://signal.nes.zachuse.top/ws` |

**变量 2**（整行粘贴，密码换成第 6 步同一个）

| Name | Value |
|------|-------|
| `VITE_ICE_SERVERS` | `[{"urls":"stun:turn.nes.zachuse.top:3478"},{"urls":"turn:turn.nes.zachuse.top:3478","username":"contra","credential":"你的TURN密码"}]` |

- [ ] **11.5** **Settings** → **Environment** → **Production** → **Node.js version** 设为 **20**（或依赖仓库 `.node-version`）

- [ ] **11.6** 点击 **Save and Deploy**，等待首次构建成功（Build log 无红色错误）

---

## 第 12 部分：绑定自定义域

- [ ] **12.1** Pages 项目 → **Custom domains** → **Set up a custom domain**
- [ ] **12.2** 输入 `nes.zachuse.top` → Continue
- [ ] **12.3** Cloudflare 会自动在 DNS 添加 `nes` 记录（CNAME 或 A），保持 **Proxied（橙云）**
- [ ] **12.4** 等 SSL 状态变为 **Active**（通常几分钟）

- [ ] **12.5** 浏览器打开 **https://nes.zachuse.top**，应看到「Contra Online MVP」大厅

---

## 第 13 部分：联调验证

### 13.1 前端

- [ ] 打开 https://nes.zachuse.top ，无白屏、无 COOP 相关控制台报错
- [ ] 大厅「信令地址」应为 `wss://signal.nes.zachuse.top/ws`（若不对，检查 Pages 环境变量后 **Retry deployment**）

### 13.2 TURN

- [ ] 打开 [Trickle ICE 测试页](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)
- [ ] 添加 STUN：`stun:turn.nes.zachuse.top:3478`
- [ ] 添加 TURN：URL `turn:turn.nes.zachuse.top:3478`，用户名 `contra`，密码同 Coturn
- [ ] 点 **Gather candidates**，结果里应出现 **relay** 类型

### 13.3 联机

- [ ] 设备 A：创建房间，记房间号
- [ ] 设备 B（**不同网络**，如手机 4G）：加入同房间
- [ ] 状态栏出现「Lockstep 同步中 · 已模拟 N 帧…」，N 持续增加
- [ ] 两侧 **WRAM hash 数值相同**，画面一致

---

## 常见问题

| 现象 | 处理 |
|------|------|
| Pages 构建失败 | 看 Build log；确认 Node 20、`npm ci` 能跑通 |
| 打不开 nes.zachuse.top | 检查 Pages 自定义域 SSL；DNS 是否橙云 |
| 信令连不上 | `dig signal.nes.zachuse.top` 是否 43.136.63.40；nginx/contra-signaling 是否 active |
| Trickle ICE 无 relay | turn 是否灰云；UDP 3478、60000–60010 防火墙；coturn 密码是否一致 |
| 能连上但不同步 | 见 `docs/lockstep-sync-lessons.md`；确认 P1/P2 都 ✓ |
| certbot 失败 | DNS 未生效；80/443 未放行 |

---

## 以后更新前端

改代码 push 到 `main` → Cloudflare Pages **自动重新部署**，无需 rsync。

改环境变量后：Pages → **Deployments** → **Retry deployment**。

---

## 以后更新信令

```bash
ssh root@43.136.63.40
cd /opt/contra && git pull
npm install
npm run build -w apps/signaling
sudo systemctl restart contra-signaling
```

---

## 架构一览

```
https://nes.zachuse.top              → Cloudflare Pages（游戏页面）
wss://signal.nes.zachuse.top/ws      → 43.136.63.40 Nginx → Node :8080
stun/turn:turn.nes.zachuse.top:3478  → 43.136.63.40 Coturn
```

全部完成后，把本文件里的 `- [ ]` 改成 `- [x]` 留档即可。
