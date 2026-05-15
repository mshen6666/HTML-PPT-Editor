# 1Panel + OpenResty 部署说明

## 目标

将当前项目以“完整应用”的方式部署到线上服务器：

- OpenResty 负责域名、HTTPS、反向代理
- Node 进程负责前端静态文件、SPA 路由回退、`/api/*` 接口
- 保留 AI 生成功能、上传功能、会话功能

当前仓库并不是纯静态站点。生产启动命令是 `npm start`，实际执行的是 `tsx server/index.ts`；服务端会在存在 `dist/` 时同时提供前端页面和 API。

## 推荐部署拓扑

推荐使用单机部署：

1. OpenResty 对外监听 `80/443`
2. Node 应用仅监听本机 `127.0.0.1:8787`
3. OpenResty 将所有请求反向代理到 `http://127.0.0.1:8787`

这样最简单，也最符合当前代码结构，不需要额外拆前后端。

## 上线前必须准备的内容

### 1. 服务器基础环境

- Linux 服务器一台
- 1Panel 已安装
- OpenResty 已由 1Panel 管理
- 可用域名一个
- 可申请 HTTPS 证书

### 2. Node.js 运行环境

项目依赖：

- `vite@8`
- `tsx`
- `express`

建议准备：

- Node.js `20.19+` 或 `22.12+`
- npm 与 Node 版本匹配

建议做法：

- 本地完成 `npm ci && npm run build`
- 服务器主要负责运行，不依赖旧版 Node 在服务器上构建

原因：

- 当前仓库的前端构建依赖 Vite 8
- 1Panel 内置 Node 运行环境如果版本偏旧，可能能跑服务但不能顺利构建

### 3. 应用运行目录

建议在服务器上准备两个目录：

- 应用目录：`/opt/ppt-app`
- 数据目录：`/data/ppt/runtime`

数据目录下建议提前创建：

- `/data/ppt/runtime/sandboxes`
- `/data/ppt/runtime/artifacts`
- `/data/ppt/runtime/uploads`

运行用户必须对这些目录有读、写、删除权限。

### 4. OpenAI 相关配置

如果线上需要保留 AI 功能，至少要准备：

- `OPENAI_API_KEY`

可选：

- `OPENAI_RESPONSES_ENDPOINT`
- `OPENAI_MODEL`
- `OPENAI_REASONING_EFFORT`

如果服务器无法访问 OpenAI 对应接口，AI 功能会直接失败。

### 5. Codex Worker 运行环境

这是最容易遗漏的一项。

当前项目的 `html-ppt` 生成链路默认会在服务端拉起一个子进程：

```bash
codex app-server --listen stdio://
```

所以你需要额外准备以下其中一种：

1. 服务器已经能直接执行 `codex`
2. 或者你通过环境变量 `PPT_WORKER_COMMAND` 指定一个明确可执行的命令

如果这一项没有准备好，普通页面能打开，但 `html-ppt` 相关 AI 生成功能会失败。

### 6. 是否需要 Redis

单机部署时：

- 不需要 Redis
- 会话默认使用内存存储

只有在以下场景才建议加 Redis：

- 多实例部署
- 希望多个 Node 实例共享会话
- 希望会话在某些重启场景下更稳定

## 建议的环境变量

建议至少配置：

```env
PORT=8787
OPENAI_API_KEY=your_api_key
PPT_WORKER_COMMAND=/usr/local/bin/codex app-server --listen stdio://
PPT_SANDBOX_ROOT=/data/ppt/runtime/sandboxes
PPT_ARTIFACT_ROOT=/data/ppt/runtime/artifacts
PPT_UPLOAD_ROOT=/data/ppt/runtime/uploads
```

可选：

```env
REDIS_URL=redis://127.0.0.1:6379/0
OPENAI_RESPONSES_ENDPOINT=
OPENAI_MODEL=gpt-5.4
OPENAI_REASONING_EFFORT=high
```

说明：

- `PORT` 默认就是 `8787`
- `PPT_*_ROOT` 建议显式配置到独立数据盘或固定目录
- `REDIS_URL` 不配置也能运行

## 服务器上需要放哪些文件

不要只上传 `dist/`。

因为生产启动命令会直接运行 `server/index.ts`，所以至少需要以下内容：

- `package.json`
- `package-lock.json`
- `server/`
- `src/`
- `dist/`
- `public/`
- `index.html`

最省事的方式：

1. 将完整项目上传到服务器
2. 在服务器执行依赖安装
3. 用 `npm start` 启动

如果要最小化上传内容，也必须保证运行时依赖的源码目录完整保留。

## 1Panel 中建议怎么配

### 方案

建议在 1Panel 中使用：

- 网站类型：反向代理
- 反代目标：`http://127.0.0.1:8787`

不建议把它当成纯静态站点来配，因为当前项目依赖 `/api/*` 接口和服务端逻辑。

### 域名和证书

在 1Panel 中完成：

- 绑定域名
- 申请或上传 HTTPS 证书
- 强制 HTTPS

### Node 进程托管

Node 应用建议使用以下任一方式守护：

- `systemd`
- 1Panel 的进程管理能力

启动命令：

```bash
npm start
```

不建议手工 `nohup` 常驻，后续排障和重启都不方便。

## OpenResty 反向代理配置重点

因为当前接口里有流式响应和上传，所以 OpenResty 不能只做最简单的默认反代。

至少要关注以下项：

- 透传 `Host`
- 透传真实 IP
- 透传 `X-Forwarded-Proto`
- 关闭 `/api/ai/turns` 的代理缓冲
- 提高超时时间
- 提高上传体积限制

示例配置：

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /api/ai/turns {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }
}
```

### 为什么要关 `proxy_buffering`

`POST /api/ai/turns` 返回的是流式 NDJSON。

如果 OpenResty 开着代理缓冲，前端可能出现这种现象：

- 页面一直转圈
- 很久之后一次性收到全部内容
- 看起来像“AI 卡住了”

这不是应用逻辑问题，而是反向代理缓冲了流式响应。

## 是否还要额外配置前端路由回退

按当前推荐架构：

- 不需要在 OpenResty 额外写 `try_files`

原因是：

- Node 服务已经在服务端处理了 SPA 路由回退
- 非 `/api` 路径会回退到 `dist/index.html`

只有在未来改成“OpenResty 直接托管前端静态文件，Node 只处理 `/api`”时，才需要额外配置前端路由回退。

## 推荐发布流程

### 方式一：更稳妥

本地构建，服务器运行：

1. 本地执行：

```bash
npm ci
npm run build
```

2. 上传项目到服务器
3. 服务器执行：

```bash
npm ci --omit=dev
```

4. 配置环境变量
5. 启动：

```bash
npm start
```

6. 在 1Panel 中配置反向代理

### 方式二：服务器构建

仅在服务器 Node 版本足够新时使用：

```bash
npm ci
npm run build
npm start
```

## 上线后的验收项

至少检查下面这些内容：

### 1. 健康检查

访问：

```bash
curl http://127.0.0.1:8787/api/health
```

预期返回：

```json
{"ok":true}
```

### 2. 首页是否可访问

检查：

- 域名首页能打开
- 页面资源能正常加载

### 3. SPA 路由刷新是否正常

直接访问或刷新类似路径：

- `/html-ppt-skill-guide`

预期：

- 不应该返回 404

### 4. API 是否可访问

检查：

- `GET /api/agent/skills`
- `GET /api/health`

### 5. AI 流式响应是否正常

在前端实际触发一次 AI 请求，确认：

- 响应是持续返回的
- 不是长时间无响应后一次性吐出

如果这里异常，优先检查：

- OpenResty 的 `proxy_buffering`
- 反向代理超时设置

### 6. 上传功能是否正常

前端上传一个小文件，确认：

- `/api/agent/uploads` 返回成功
- 上传目录中有落盘文件

### 7. html-ppt 生成功能是否正常

如果这个功能失败，优先排查：

1. `OPENAI_API_KEY` 是否配置
2. `PPT_WORKER_COMMAND` 是否可执行
3. 运行目录是否有写权限
4. 服务器是否能访问外网模型接口

## 常见坑

### 坑 1：只上传 `dist/`

结果：

- 首页可能能勉强打开
- 但服务端 API 和运行逻辑不完整

### 坑 2：OpenResty 没关流式接口缓冲

结果：

- AI 看起来像卡死

### 坑 3：没有准备 `codex` worker

结果：

- 普通页面正常
- `html-ppt` AI 生成报错

### 坑 4：运行目录不可写

结果：

- 上传失败
- 生成失败
- 沙箱清理失败

### 坑 5：服务器直接用旧版 Node 构建

结果：

- `vite build` 失败
- 或构建/运行行为异常

### 坑 6：把 8787 直接暴露公网

不推荐：

- 不利于统一 HTTPS
- 不利于后续安全控制
- 不利于日志与代理层统一管理

## 当前项目对应的关键点

当前仓库里和部署直接相关的点如下：

- `package.json` 中 `start` 实际执行 `tsx server/index.ts`
- `server/index.ts` 会在有 `dist/` 时同时提供静态文件和 API
- `server/createAiServer.ts` 提供 `/api/health`、`/api/ai/turns`、`/api/agent/uploads` 等接口
- `server/workerRuntimeConfig.ts` 里定义了 `PPT_*` 运行时目录和 `PPT_WORKER_COMMAND`
- `index.html` 依赖 `api.fontshare.com` 字体资源

## 最终建议

如果你现在的目标是尽快稳定上线，建议按下面执行：

1. 本地先构建好项目
2. 上传完整项目到服务器
3. 服务器配置好 `OPENAI_API_KEY`
4. 服务器确认 `codex` 命令可执行
5. 提前创建 `sandboxes`、`artifacts`、`uploads` 三个可写目录
6. 用 `npm start` 跑 Node 服务
7. 在 1Panel 用 OpenResty 做域名和 HTTPS 反代
8. 对 `/api/ai/turns` 关闭 `proxy_buffering`
9. 用实际页面走一遍 AI、上传、刷新路由验收

如果后面你要，我可以继续直接给你补一份：

- 适合 1Panel 粘贴的 OpenResty 完整配置
- `systemd` 启动文件
- 一份上线执行清单
