# 魂斗罗联机 · 部署清单（逐条执行）

按顺序做，做完一条勾一条。  
目标：**前端** `https://nes.zachuse.top`（Cloudflare Pages）+ **信令/TURN**（腾讯云 `43.136.63.40`）。

**服务器系统：OpenCloudOS 9**（RHEL 系，`dnf` 包管理；与 Ubuntu 命令不同处已单独标注）。

---

## 开始前准备

| 项 | 你的值 |
|----|--------|
| 域名 | `nes.zachuse.top`（父域一般是 `zachuse.top`） |
| 服务器 IP | `43.136.63.40` |
| 服务器系统 | **OpenCloudOS 9** |
| GitHub 仓库 | `https://github.com/zach19970620-glitch/contra` |
| SSH 登录 | `ssh root@43.136.63.40`（用户名按你实际改） |

**子域名分工**

| 子域 | 用途 |
|------|------|
| `nes.zachuse.top` | 游戏前端（Cloudflare Pages） |
| `signal.zachuse.top` | WebRTC 信令 WSS |
| `coturn.zachuse.top` | STUN / TURN（Coturn） |

先想一个 **TURN 强密码**（例如 20 位随机字符），后面 Coturn 和 Cloudflare 要用**同一个**。

---

## 第 1 部分：代码推上 GitHub

- [ ] **1.1** 本地项目已包含 `scripts/deploy/cloudflare-deploy.sh` 等部署配置
- [ ] **1.2** 提交并 push 到 GitHub `main` 分支：

```bash
cd /Users/zach/Desktop/contra
git add -A
git status          # 确认没有 .env.production.local、密码文件
git commit -m "deploy: Cloudflare Pages + signal/turn subdomains"
git push origin main
```

- [ ] **1.3** 打开 GitHub 仓库，确认 `main` 上能看到 `scripts/deploy/cloudflare-deploy.sh`

---

## 第 2 部分：域名迁到 Cloudflare（若已在 CF 可跳过 2.1）

- [ ] **2.1** 登录 [Cloudflare](https://dash.cloudflare.com) → **Add a site** → 输入 `zachuse.top`（或你托管 `nes.zachuse.top` 的那一层域）
- [ ] **2.2** 按提示把域名 **NS 服务器** 改成 Cloudflare 给的（在域名注册商处改）
- [ ] **2.3** 等 Cloudflare 显示域名 **Active**（通常几分钟到 48 小时）

> 若 `zachuse.top` 已在 Cloudflare，直接从第 3 部分开始。

---

## 第 3 部分：Cloudflare DNS 记录

在 Cloudflare → **zachuse.top** → **DNS** → **Records**：

- [ ] **3.1** 删除旧的冲突记录：若有 `nes` 指向 `43.136.63.40` 的 A 记录，**删掉**（前端改走 Pages）

- [ ] **3.2** 添加 **信令** 记录：

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `signal` | `43.136.63.40` | **DNS only（灰云）** |

- [ ] **3.3** 添加 **Coturn（STUN/TURN）** 记录：

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `coturn` | `43.136.63.40` | **DNS only（灰云）** |

- [ ] **3.4** 本机验证解析（等 1～5 分钟再试）：

```bash
dig +short signal.zachuse.top
dig +short coturn.zachuse.top
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

## 第 5 部分：服务器安装依赖（OpenCloudOS 9）

SSH 登录服务器：

```bash
ssh root@43.136.63.40
```

- [ ] **5.1** 确认系统版本：

```bash
cat /etc/os-release | head -5
# 应含 OpenCloudOS 9
```

- [ ] **5.2** 安装 EPEL、Nginx、Coturn、Certbot、Git（二选一）：

**方式 A — 一键脚本（推荐）**

```bash
cd /opt/contra 2>/dev/null || true
# 若尚未 clone，先完成 5.4 再回来执行；或先 clone 到临时目录取脚本：
git clone --depth 1 https://github.com/zach19970620-glitch/contra.git /tmp/contra
sudo bash /tmp/contra/scripts/deploy/opencloudos-server.sh
```

**方式 B — 手动逐条**

```bash
sudo dnf install -y epel-release
sudo dnf install -y nginx git curl certbot python3-certbot-nginx coturn
sudo systemctl enable --now nginx
```

- [ ] **5.3** 安装 **Node.js 20+**（若 `node -v` 低于 20）：

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node -v   # 应 >= v20
npm -v
```

- [ ] **5.4** 克隆项目并编译信令：

```bash
sudo mkdir -p /opt/contra
sudo chown -R $USER:$USER /opt/contra
git clone https://github.com/zach19970620-glitch/contra.git /opt/contra
cd /opt/contra
npm install
npm run build -w apps/signaling
```

- [ ] **5.5** 确认存在 `apps/signaling/dist/index.js`：

```bash
ls -la /opt/contra/apps/signaling/dist/index.js
```

- [ ] **5.6**（可选）若启用了 **firewalld**，确认端口已放行（腾讯云控制台防火墙也要开）：

```bash
sudo systemctl status firewalld
# 若 active，执行 opencloudos-server.sh 已添加规则；或手动：
sudo firewall-cmd --permanent --add-service={http,https}
sudo firewall-cmd --permanent --add-port=3478/tcp
sudo firewall-cmd --permanent --add-port=3478/udp
sudo firewall-cmd --permanent --add-port=5349/tcp
sudo firewall-cmd --permanent --add-port=60000-60010/udp
sudo firewall-cmd --reload
```

- [ ] **5.7**（可选）SELinux 为 Enforcing 时，允许 Nginx 连接本机 Node：

```bash
sudo setsebool -P httpd_can_network_connect 1
```

---

## 第 6 部分：配置 TURN 密码

- [ ] **6.1** 编辑 Coturn 配置，把密码改成你第 0 步想的强密码：

```bash
nano /opt/contra/scripts/deploy/coturn.zachuse.top.conf
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
sudo certbot certonly --nginx -d signal.zachuse.top
```

- [ ] **7.2** 再申请 turn 域证书：

```bash
sudo certbot certonly --nginx -d coturn.zachuse.top
```

- [ ] **7.3** 确认证书文件存在：

```bash
sudo ls /etc/letsencrypt/live/signal.zachuse.top/
sudo ls /etc/letsencrypt/live/coturn.zachuse.top/
```

---

## 第 8 部分：启动 Coturn（OpenCloudOS 9）

OpenCloudOS 上 Coturn 配置文件路径为 **`/etc/coturn/turnserver.conf`**（不是 Debian 的 `/etc/turnserver.conf`）。

- [ ] **8.1** 安装配置并启动：

```bash
sudo cp /opt/contra/scripts/deploy/coturn.zachuse.top.conf /etc/coturn/turnserver.conf
sudo systemctl enable coturn
sudo systemctl restart coturn
```

- [ ] **8.2** 检查状态（应为 active）：

```bash
sudo systemctl status coturn
```

若失败：`sudo journalctl -u coturn -n 50` 查看日志（常见：证书路径错、3478 端口被占、EPEL 未装 coturn）。

---

## 第 9 部分：启动信令服务（Node）

- [ ] **9.1** 编译信令（**必须**，`dist/` 不在 Git 仓库里）：

```bash
cd /opt/contra
npm install
npm run build -w apps/signaling
# 或：sudo bash scripts/deploy/build-signaling.sh
ls -la /opt/contra/apps/signaling/dist/index.js
```

若 `tsc: command not found`：说明 dev 依赖未装，不要加 `--omit=dev`，必须完整 `npm install`。

- [ ] **9.2** 安装 systemd 服务：

**若 Node 用 nvm 安装**（systemd 读不到 nvm 的 PATH，需额外一步）：

```bash
mkdir -p /etc/contra
echo "NODE_BIN=$(which node)" | sudo tee /etc/contra/signaling.env
cat /etc/contra/signaling.env   # 应类似 /root/.nvm/versions/node/v20.x.x/bin/node
```

然后：

```bash
sudo chmod +x /opt/contra/scripts/deploy/start-signaling.sh
sudo cp /opt/contra/scripts/deploy/contra-signaling.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable contra-signaling
sudo systemctl start contra-signaling
```

- [ ] **9.3** 检查状态：

```bash
sudo systemctl status contra-signaling
# 若失败，看具体原因：
sudo journalctl -u contra-signaling -n 30 --no-pager
curl -I http://127.0.0.1:8080
```

手动试跑（应看到 `[signaling] ws://0.0.0.0:8080`）：

```bash
sudo bash /opt/contra/scripts/deploy/start-signaling.sh
# Ctrl+C 停止后，再 systemctl start
```

若仍失败：把 `journalctl` 输出贴出来。

---

## 第 10 部分：Nginx 反代信令（OpenCloudOS 9）

OpenCloudOS 的 Nginx 使用 **`/etc/nginx/conf.d/*.conf`**，没有 Debian 的 `sites-available` 目录。

- [ ] **10.1** 启用信令站点配置：

```bash
sudo cp /opt/contra/scripts/deploy/nginx.signal.zachuse.top.conf /etc/nginx/conf.d/contra-signal.conf
# 若存在默认 welcome 页且冲突，可改名备份：
sudo mv /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.bak 2>/dev/null || true
sudo nginx -t
sudo systemctl reload nginx
```

- [ ] **10.2** 测试 HTTPS（应返回 404，不是连接失败）：

```bash
curl -I https://signal.zachuse.top/ws
```

---

## 第 11 部分：Cloudflare Pages 创建项目

- [ ] **11.1** 打开 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
- [ ] **11.2** 授权 GitHub，选择仓库 **contra**
- [ ] **11.3** 构建设置（**Workers Builds 界面**：无 Output directory、Deploy 必填）

| 字段 | 填写 |
|------|------|
| Production branch | `main` |
| Root directory | 留空（仓库根 `/`） |
| Build command（若有） | `npm ci && npm run build -w apps/web` |
| **Deploy command（必填）** | `bash scripts/deploy/cloudflare-deploy.sh` |

或一行：

```bash
npm ci && npm run build -w apps/web && cd apps/web && npx wrangler pages deploy dist --project-name=contra-nes --commit-dirty=true
```

Token 模板：**Edit Cloudflare Pages**（见 [CLOUDFLARE-API-TOKEN.md](./CLOUDFLARE-API-TOKEN.md)）。

> 若是经典 Pages（有 Build output directory）：Output 填 `apps/web/dist`，Deploy 留空即可。

- [ ] **11.4** **Environment variables** → **Production** → 添加两个变量：

**变量 1**

| Name | Value |
|------|-------|
| `VITE_SIGNALING_URL` | `wss://signal.zachuse.top/ws` |

**变量 2**（整行粘贴，密码换成第 6 步同一个）

| Name | Value |
|------|-------|
| `VITE_ICE_SERVERS` | `[{"urls":"stun:coturn.zachuse.top:3478"},{"urls":"turn:coturn.zachuse.top:3478","username":"contra","credential":"你的TURN密码"}]` |

- [ ] **11.5** **Settings** → **Environment** → **Production** → **Node.js version** 设为 **22**（Wrangler 4.x 要求 Node ≥22；仓库根目录 `.node-version` 已写 `22`）

- [ ] **11.6** 点击 **Save and Deploy**，等待构建成功

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
- [ ] 大厅「信令地址」应为 `wss://signal.zachuse.top/ws`（若不对，检查 Pages 环境变量后 **Retry deployment**）

### 13.2 TURN

- [ ] 打开 [Trickle ICE 测试页](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)
- [ ] 添加 STUN：`stun:coturn.zachuse.top:3478`
- [ ] 添加 TURN：URL `turn:coturn.zachuse.top:3478`，用户名 `contra`，密码同 Coturn
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
| Pages 构建失败 | 看 Build log；确认 Node **22**（Wrangler 4.x）、`npm ci` 能跑通 |
| wrangler Authentication 10000 | Token 改用 **Edit Cloudflare Pages** 模板 |
| wrangler workspace 错误 | Deploy 加 `cd apps/web &&` |
| Missing entry-point / assets | 用 `pages deploy dist`，勿用 `wrangler deploy` |
| Wrangler 要求 Node ≥22 | 根目录 `.node-version` / `.nvmrc` 设为 `22`，或 Build 环境变量 `NODE_VERSION=22` |
| 打不开 nes.zachuse.top | 检查 Pages 自定义域 SSL；DNS 是否橙云 |
| 信令连不上 | `dig signal.zachuse.top` 是否 43.136.63.40；nginx/contra-signaling 是否 active |
| Trickle ICE 无 relay | turn 是否灰云；UDP 3478、60000–60010 防火墙；coturn 密码是否一致 |
| 能连上但不同步 | 见 `docs/lockstep-sync-lessons.md`；确认 P1/P2 都 ✓ |
| certbot 失败 | DNS 未生效；80/443 未放行；OpenCloudOS 需先 `dnf install epel-release certbot python3-certbot-nginx` |
| coturn 启动失败 | 配置应在 `/etc/coturn/turnserver.conf`；检查 `journalctl -u coturn` |
| contra-signaling 127 / node 不在 PATH | nvm 用户：见第 9.2 步 `NODE_BIN` 写入 `/etc/contra/signaling.env` |
| contra-signaling 203/EXEC | `which node` 为空 → 重装 Node 20；或 `dist/index.js` 不存在 → `npm run build -w apps/signaling` |
| nginx 502 / 信令不通 | 执行 `setsebool -P httpd_can_network_connect 1`；确认 `contra-signaling` 为 active |
| `npm install` 报错 | 确认 Node >= 20（NodeSource RPM） |

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
wss://signal.zachuse.top/ws      → 43.136.63.40 Nginx → Node :8080
stun/turn:coturn.zachuse.top:3478  → 43.136.63.40 Coturn
```

全部完成后，把本文件里的 `- [ ]` 改成 `- [x]` 留档即可。
