# HTML PPT Editor

**中文** | [English](README.en.md)

HTML PPT Editor 是一个基于 React 和 Node.js 的文稿生成器。项目以可编辑 HTML deck 作为核心数据源，提供可视化编辑、预览、导出，以及可选的 AI Agent 生成工作流。

![文稿生成器主页](image/zhuye1.png)

![文稿生成器编辑界面](image/zhuye2.png)

## 功能

- 在浏览器中编辑文字、图片、布局、图层、动效元数据和页面结构。
- 通过受控 deck contract 导入并规范化 HTML 文稿。
- 支持导出 HTML、PDF 和基于截图栅格化的 PPTX。
- 内置 `html-ppt` 模板与主题资源，可用于 AI 辅助生成文稿。
- 通过 HTML PPT 指南查看主题、模板、布局、动效、提示词示例和使用原则。
- 开发环境使用 Vite，生产环境可作为单体 Express 服务运行。

## HTML PPT 指南

指南会把内置 `html-ppt` 资源整理成可浏览资料库，方便在生成或编辑文稿前先确定视觉方向。

### 主题

主题预览用于选择整体视觉气质，包括浅色、深色、杂志、技术和更具表现力的风格。

![HTML PPT 主题指南](image/zhuti.png)

### 模板

整套模板提供完整起稿结构，覆盖 pitch deck、产品发布、技术分享、周报、课程和小红书图文等场景。

![HTML PPT 模板指南](image/moban.png)

### 布局

单页布局覆盖封面、目录、对比、时间线、KPI 网格、代码、图表、架构图和结束页等常见页面模式。

![HTML PPT 布局指南](image/buju.png)

### 动效

动效预览展示可用的 CSS 动画和 canvas 效果，便于为展示和导出选择克制、合适的运动效果。

![HTML PPT 动效指南](image/dongxiao.png)

## 技术栈

- React 19, TypeScript, Vite, Vitest
- Express 5 本地和生产 API 服务
- `@anthropic-ai/claude-agent-sdk` 默认 Claude Code 兼容 Agent 运行时
- `pptxgenjs`、`html-to-image`、`jszip`、`sharp` 支持导出和文档处理流程

## 快速开始

```bash
npm install
npm run dev:full
```

打开终端输出的 Vite 地址即可使用。本地开发时，前端会把 `/api` 请求代理到 `127.0.0.1:8787` 的后端服务。

也可以分别启动前后端：

```bash
npm run dev
npm run dev:server
```

## 环境变量

生产部署或启用 AI 工作流前，先复制示例环境文件：

```bash
cp .env.production.example .env.production
```

不要提交真实 `.env` 文件。API key、邀请码、cookie secret、Redis URL 和运行时存储路径应写入本地 `.env.production`，或部署平台的 secret 配置。

关键变量：

- `PORT`：后端服务端口，默认 `8787`。
- `PPT_INVITE_CODE`：进入应用所需的邀请码。
- `PPT_INVITE_COOKIE_SECRET`：用于签名邀请码会话的长随机字符串。
- `PPT_SANDBOX_ROOT`、`PPT_ARTIFACT_ROOT`、`PPT_UPLOAD_ROOT`：运行时可写目录。
- `REDIS_URL`：多实例部署时可选的共享会话存储。
- `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_MODEL`：Claude Code 兼容 Agent provider 配置。

## 常用命令

```bash
npm run dev          # 启动 Vite 前端
npm run dev:server   # 启动 Express API 服务
npm run dev:full     # 同时启动前端和后端
npm run build        # 类型检查并构建前端产物
npm run preview      # 预览生产前端产物
npm run start        # 启动生产服务
npm test             # 运行一次 Vitest
npm run test:watch   # 监听模式运行 Vitest
```

## 项目结构

```text
image/              README 截图
src/app/            React 编辑器 UI 和路由
src/app/editor/     编辑器辅助组件和控制逻辑
src/deck-contract/  可编辑 HTML deck 解析、补丁和序列化
src/export-*/       HTML、PDF、PPTX 导出流程
src/agent/          前后端共享的 Agent 协议类型
server/             Express API 服务和 Agent 编排
public/             Vite 静态资源
docs/               部署和架构文档
```

## 部署

生产构建：

```bash
npm ci
npm run build
npm start
```

当 `dist/` 存在时，Express 会同时提供前端页面和 `/api/*` 接口。如果需要邀请码门禁、上传、会话或 AI 生成功能，不要只把 `dist/` 当静态站点部署。

更多部署说明见 `docs/deployment.md` 和 `docs/container-deployment.md`。

## 仓库安全

仓库已忽略本地运行状态和私有配置，例如 `.env*`、`.runtime/`、`.claude/`、`.superpowers/`、`.playwright-mcp/`、`outputs/`、构建产物、覆盖率、日志和调试文件。

发布 fork 或镜像前建议运行：

```bash
git status --short
git check-ignore -v .env.production .runtime/foo .superpowers/foo outputs/foo .claude/foo
```

## 贡献

请保持改动聚焦。涉及 deck 编辑、序列化、预览布局、agent 协议或导出行为时，请补充回归测试。提交 PR 前运行 `npm test` 和 `npm run build`。

## 许可证

MIT
