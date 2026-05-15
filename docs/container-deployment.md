# 容器化部署说明

适用场景：

- 宿主机系统较老，例如 `CentOS 7`
- 宿主机 Docker Engine 较老，例如 `18.09`
- 继续使用宿主机上的 `1Panel + OpenResty`
- 将 Node 服务和代码 agent worker 都放进同一个容器运行

`Dockerfile` 使用 `node:22-bullseye` / `node:22-bullseye-slim`，是为了避开老 Docker runtime/seccomp 与新版 Debian bookworm/glibc 在线程创建上的兼容问题。不要在 Docker 18.09 这类老环境里直接换回 `node:22-bookworm`，否则 `npm ci` 阶段可能出现 `uv_thread_create` 断言失败并 core dumped。

## 新增文件

- `Dockerfile`
- `docker-compose.yml`
- `.env.production.example`
- `deploy/codex/config.aliyun.toml`
- `deploy/codex/config.token-plan.toml`

## 服务器操作

1. 上传完整项目到 `/opt/ppt-app`
2. 复制环境变量文件：

```bash
cd /opt/ppt-app
cp .env.production.example .env.production
```

3. 按你的实际情况选择 worker 运行时。

默认仍然使用 Codex：

普通阿里百炼：

```bash
mkdir -p /opt/ppt-app/deploy/codex
cp /opt/ppt-app/deploy/codex/config.aliyun.toml /opt/ppt-app/deploy/codex/config.toml
```

阿里 Token Plan：

```bash
mkdir -p /opt/ppt-app/deploy/codex
cp /opt/ppt-app/deploy/codex/config.token-plan.toml /opt/ppt-app/deploy/codex/config.toml
```

线上使用 Codex worker 时，推荐并默认使用阿里 Token Plan。阿里官方文档说明 Token Plan 团队版、Coding Plan、普通百炼按量 API Key 互不相通；新版 Codex 的 Responses API 在 Token Plan 中当前仅支持 `qwen3.6-plus`。普通 DashScope `dashscope.aliyuncs.com` 可以裸调 Responses API，但不等同于官方支持 Codex CLI 的长流式 agent 调用。

如果使用 MiniMax M2.7，推荐切换到 Claude Code worker：

```env
PPT_AGENT_RUNTIME=claude-code
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic
ANTHROPIC_AUTH_TOKEN=<MINIMAX_API_KEY>
ANTHROPIC_MODEL=MiniMax-M2.7
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
PPT_JOB_TIMEOUT_MS=3000000
API_TIMEOUT_MS=3000000
```

国际区 MiniMax endpoint 使用：

```env
ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic
```

Claude Code worker 通过 `@anthropic-ai/claude-agent-sdk` 运行，每次任务仍创建独立沙箱，并把内置 `server/embedded-skills/html-ppt` 的 `SKILL.md` 与 reference markdown 注入 prompt，不依赖容器内额外安装本地 skill。

4. 编辑 `.env.production`

- Codex 路线：`PPT_AGENT_RUNTIME=codex`，`OPENAI_API_KEY` 改成你的阿里 Token Plan 团队版 key，`OPENAI_RESPONSES_ENDPOINT` 使用 `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/responses`
- Claude Code + MiniMax 路线：`PPT_AGENT_RUNTIME=claude-code`，设置 `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_MODEL=MiniMax-M2.7`
- 长任务超时优先使用 `PPT_JOB_TIMEOUT_MS`；兼容旧配置时也会读取 `API_TIMEOUT_MS`。

5. 构建并启动：

```bash
cd /opt/ppt-app
docker compose up -d --build
```

如果服务器只有旧版 Compose，使用：

```bash
docker-compose up -d --build
```

当前 Docker 构建默认使用国内镜像源：

- Node 基础镜像：`docker.m.daocloud.io/library/node`
- npm registry：`https://registry.npmmirror.com`
- apt mirror：`http://mirrors.tuna.tsinghua.edu.cn/debian`

如果某个镜像源在你的服务器上不可用，改 `docker-compose.yml` 里的 `build.args` 即可。

智能 PPTX 导出会在容器构建阶段预装常用转换/校验工具，避免 agent 在用户请求过程中再尝试安装依赖：

- Node 依赖：`pptxgenjs`、`jsdom`、`jszip`、`sharp`、`react-icons`
- Python 依赖：`Pillow`、`defusedxml`、`lxml`、`markitdown[pptx]`
- 系统工具：LibreOffice (`soffice`)、Poppler (`pdftoppm`)、Python 3

生产环境的沙箱目录默认在 `/data/ppt/runtime/sandboxes`，不在 `/app` 项目目录下。后端会给 Claude Code agent 注入 `NODE_PATH=/app/node_modules`，让沙箱里的转换脚本也能直接加载项目依赖。预装 LibreOffice 和 Poppler 会增加镜像体积和构建时间，但可以减少智能导出时的等待和不确定性。

6. 查看日志：

```bash
docker compose logs -f
```

7. 健康检查：

```bash
curl http://127.0.0.1:8787/api/health
```

## OpenResty 反代

反代目标：

```text
http://127.0.0.1:8787
```

对 `/api/ai/turns` 关闭 `proxy_buffering`。

## Codex 配置说明

当前提供的 `deploy/codex/config*.toml` 已经包含以下顶层配置：

- `approval_policy = "never"`
- `sandbox_mode = "danger-full-access"`
- `model = "qwen3.6-plus"`
- `model_reasoning_effort = "medium"`
- `model_reasoning_summary = "none"`
- `model_supports_reasoning_summaries = false`
- `model_verbosity = "low"`
- `plan_mode_reasoning_effort = "medium"`
- `request_max_retries = 8`
- `stream_max_retries = 10`
- `stream_idle_timeout_ms = 600000`

`wire_api = "responses"` 是 Codex CLI 0.125 的自定义 OpenAI 兼容 provider 所需协议；`request_max_retries`、`stream_max_retries`、`stream_idle_timeout_ms` 用来让 Codex worker 对第三方 Responses 长流式请求更耐受。

`model_reasoning_summary = "none"` 和 `model_verbosity = "low"` 用来减少兼容流中的额外推理摘要输出，降低长流式负载。若后续确认链路稳定，再按需调高 reasoning effort。

之所以不用 `[profiles.auto-max]`，是因为当前启动命令没有传 `--profile auto-max`。
如果只写 profile 块而不激活，对当前部署不会生效。

不建议在当前阿里百炼配置里额外加下面两项：

- `service_tier = "fast"`
- `model_context_window` / `model_auto_compact_token_limit`

原因是这些值更适合按具体模型能力和服务端支持来配；在第三方 OpenAI 兼容网关场景下，不一定有收益，错误配置反而可能导致行为不稳定。

## Claude Code + MiniMax 配置说明

`PPT_AGENT_RUNTIME=claude-code` 时，后端不会启动 `codex app-server`，而是使用 Claude Agent SDK 的 `query()` 直接驱动 Claude Code。该路径适合 Anthropic-compatible API，例如 MiniMax M2.7。

运行时会限制 Claude Code 内置工具为：

- `Read`
- `Write`
- `Edit`
- `Glob`
- `Grep`

权限模式使用非交互式自动执行，避免线上请求等待人工确认。最终输出必须写入沙箱内的 `presentation.html`，后端读取该文件并继续通过原有 `/api/ai/turns` NDJSON 协议返回 `html_candidate_ready`。

保留 Codex 的原因是它仍适合 Responses API worker；如果你的 provider 只提供 Chat 或 Anthropic-compatible API，优先使用 Claude Code worker。
