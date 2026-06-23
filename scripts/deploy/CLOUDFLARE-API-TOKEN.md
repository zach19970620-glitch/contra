# Cloudflare API Token（Workers Builds 必填 ApiToken 时）

Deploy 使用 **`wrangler pages deploy`**（Cloudflare 项目是 **Pages**，不是 Worker）。

## 1. 创建 Token

<https://dash.cloudflare.com/profile/api-tokens> → **Create Token**

### 用模板（推荐）

选 **Edit Cloudflare Pages** → Create Token → 复制 Token

### 自定义权限

| 权限 | 级别 |
|------|------|
| Account → **Cloudflare Pages** | **Edit** |
| Account → **Account Settings** | **Read** |

Account Resources：**Include** → 你的账号

## 2. 环境变量（Production）

| 名称 | 值 |
|------|-----|
| ApiToken / `CLOUDFLARE_API_TOKEN` | 上面复制的 Token |
| `CLOUDFLARE_ACCOUNT_ID` | `347bc1ac321e89f0efd5ed1611c18060` |
| `NODE_VERSION`（可选） | `22`（Wrangler 4.x 要求；仓库已有 `.node-version` 时可不设） |
| `VITE_SIGNALING_URL` | `wss://signal.zachuse.top/ws` |
| `VITE_ICE_SERVERS` | JSON 单行（含 coturn 密码） |

可选：`CLOUDFLARE_PAGES_PROJECT=contra-nes`（默认已是 contra-nes）

## 3. Deploy command（整行复制）

```bash
npm ci && npm run build -w apps/web && cd apps/web && npx wrangler pages deploy dist --project-name=contra-nes --commit-dirty=true
```

或：

```bash
bash scripts/deploy/cloudflare-deploy.sh
```

**禁止**在仓库根目录跑 `wrangler deploy`（会 workspace 报错 + Pages 项目警告）。

**禁止**用 **Edit Cloudflare Workers** Token 跑 `pages deploy`（会 Authentication 10000）。

## 4. 先创建 Pages 项目（必做）

`wrangler pages deploy --project-name=contra-nes` 要求该 **Pages 项目已存在**。

**方式 A（推荐，无需改 Dashboard）**：Deploy command 用脚本，首次会自动创建：

```bash
bash scripts/deploy/cloudflare-deploy.sh
```

**方式 B（手动）**：Dashboard → **Workers & Pages** → **Create** → **Pages** → 选 **Direct Upload**（或 Connect Git）→ 项目名填 **`contra-nes`**（必须完全一致）→ Create。

创建后可在 **Custom domains** 绑定 `nes.zachuse.top`。

## 5. 绑定域名

Pages 项目 → **Custom domains** → `nes.zachuse.top`

## 6. 报错对照

| 报错 | 处理 |
|------|------|
| Authentication 10000 | Token 改 **Edit Cloudflare Pages** |
| workspace root | Deploy 加 `cd apps/web &&` |
| Missing entry-point / assets | 用 `pages deploy dist`，勿用 `wrangler deploy` |
| Wrangler requires Node ≥22 | `.node-version` / `.nvmrc` 设为 `22`，或 `NODE_VERSION=22` |
| project not found (8000007) | Dashboard 创建 Pages 项目 **`contra-nes`**，或 Deploy 用 `bash scripts/deploy/cloudflare-deploy.sh`（会自动 create） |
