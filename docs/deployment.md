# 部署

这个服务可以作为一个单体 Node 应用进行部署。

## 推荐拓扑

- 使用 `npm run build` 构建前端
- 使用 `npm start` 启动后端
- Express 服务器会为浏览器流量提供 `dist/`，并为 agent、上传和会话相关接口提供 `/api/*`
- 邀请码门禁在 Express 层生效，未验证前不会返回 React 应用资源，也会拦截除 `/api/health` 和 `/api/invite/session` 之外的功能 API

除非你后续需要独立扩缩容，否则不需要将前后端分开部署。

## 必需的运行时输入

- `PPT_INVITE_CODE`：访问页面和功能 API 所需的邀请码，当前默认值为 `helloWorld`
- `PPT_INVITE_COOKIE_SECRET`：用于签名邀请码会话 cookie 的长随机字符串；未设置时进程启动会生成临时 secret，服务重启后需要重新输入邀请码
- `PPT_AGENT_RUNTIME`：可选，`claude-code` 或 `codex`，默认 `claude-code`
- `OPENAI_API_KEY`：Codex / OpenAI agent 运行时必需
- `PPT_WORKER_COMMAND`：可选，用于覆盖 Codex worker 命令
- `PPT_SANDBOX_ROOT`：可选，可写沙箱根目录
- `PPT_ARTIFACT_ROOT`：可选，可写产物根目录
- `PPT_UPLOAD_ROOT`：可选，可写上传目录根路径

## 可选的运行时输入

- `REDIS_URL`：仅当你希望多个应用实例之间共享会话状态时才需要
- `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_MODEL`：`PPT_AGENT_RUNTIME=claude-code` 时用于 Anthropic-compatible provider，例如 MiniMax M2.7

如果没有设置 `REDIS_URL`，服务会使用内存会话，适合单实例部署。

## 可写存储

运行时需要对以下目录具备写权限：

- `.runtime/sandboxes`
- `.runtime/artifacts`
- `.runtime/uploads`

如果你希望将这些目录绑定到持久化存储，可以通过 `PPT_*_ROOT` 变量进行覆盖。

## 实际发布流程

1. 使用 `npm ci` 安装依赖
2. 使用 `npm run build` 构建前端
3. 使用 `npm start` 启动服务
4. 确认 `GET /api/health` 返回 `{ "ok": true }`

## 说明

- `npm start` 会有意直接启动服务端，因此 `tsx` 属于生产依赖的一部分。
- 如果缺少 `dist/`，后端 API 仍然会启动，但不会提供浏览器端应用。
- 不要绕过 Node/Express 直接暴露 `dist/` 静态目录，否则浏览器可以拿到前端资源，邀请码门禁也就失去意义。
- 本地开发要使用 `npm run dev:full`，或同时启动 `npm run dev` 与 `npm run dev:server`。Vite 开发页也会显示邀请码表单，但真正的安全边界仍然是 Express 服务端门禁。
