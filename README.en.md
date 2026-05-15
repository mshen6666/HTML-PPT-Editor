# HTML PPT Editor

[中文](README.md) | **English**

HTML PPT Editor is a React and Node.js document generation app for creating, editing, previewing, and exporting HTML-based slide decks. It treats editable deck HTML as the source of truth, provides a visual editor around that contract, and includes an optional AI agent workflow for generating or refining presentations.

![Document generator home screen](image/zhuye1.png)

![Document generator editor screen](image/zhuye2.png)

## Features

- Edit slide text, images, layout, layers, motion metadata, and deck structure in the browser.
- Import and normalize HTML slide decks through a controlled deck contract.
- Export decks to HTML, PDF, and rasterized PPTX.
- Use the embedded `html-ppt` template and theme bundle for AI-assisted document generation.
- Browse the HTML PPT guide for themes, templates, layouts, animations, prompt examples, and usage principles.
- Run as a local Vite app during development or as a single Express service in production.

## HTML PPT Guide

The guide turns the embedded `html-ppt` resources into a browsable reference, so users can choose a visual direction before generating or editing a deck.

### Themes

Theme previews help choose the overall tone, including light, dark, editorial, technical, and expressive styles.

![HTML PPT theme guide](image/zhuti.png)

### Templates

Full-deck templates provide complete starting structures for scenarios such as pitch decks, product launches, technical sharing, weekly reports, courses, and Xiaohongshu-style posts.

![HTML PPT template guide](image/moban.png)

### Layouts

Single-page layouts cover common slide patterns such as cover, table of contents, comparison, timeline, KPI grid, code, charts, architecture diagrams, and thank-you pages.

![HTML PPT layout guide](image/buju.png)

### Animations

Animation previews show the available CSS animations and canvas effects, making it easier to choose restrained motion for presentation and export.

![HTML PPT animation guide](image/dongxiao.png)

## Tech Stack

- React 19, TypeScript, Vite, Vitest
- Express 5 for the local and production API server
- `@anthropic-ai/claude-agent-sdk` for the default Claude Code compatible agent runtime
- `pptxgenjs`, `html-to-image`, `jszip`, and `sharp` for export and document workflows

## Quick Start

```bash
npm install
npm run dev:full
```

Open the Vite URL shown in the terminal. The frontend proxies `/api` to the local server on `127.0.0.1:8787`.

You can also run the frontend and backend separately:

```bash
npm run dev
npm run dev:server
```

## Environment

Copy the example file before running production or AI workflows:

```bash
cp .env.production.example .env.production
```

Never commit real `.env` files. Put API keys, invite codes, cookie secrets, Redis URLs, and runtime storage paths in `.env.production` or in your deployment platform's secret manager.

Important variables:

- `PORT`: backend server port, defaults to `8787`.
- `PPT_INVITE_CODE`: invite code required to enter the app.
- `PPT_INVITE_COOKIE_SECRET`: long random secret used to sign invite sessions.
- `PPT_SANDBOX_ROOT`, `PPT_ARTIFACT_ROOT`, `PPT_UPLOAD_ROOT`: writable runtime directories.
- `REDIS_URL`: optional shared session store for multi-instance deployments.
- `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL`: Claude Code compatible agent provider settings.

## Scripts

```bash
npm run dev          # Start the Vite frontend
npm run dev:server   # Start the Express API server
npm run dev:full     # Start frontend and backend together
npm run build        # Type-check and build the frontend bundle
npm run preview      # Preview the production frontend bundle
npm run start        # Start the production server
npm test             # Run Vitest once
npm run test:watch   # Run Vitest in watch mode
```

## Project Structure

```text
image/              README screenshots
src/app/            React editor UI and routes
src/app/editor/     Focused editor helpers and controls
src/deck-contract/  Editable HTML deck parsing, patching, and serialization
src/export-*/       HTML, PDF, and PPTX export pipelines
src/agent/          Shared frontend/backend agent protocol types
server/             Express API server and agent orchestration
public/             Static assets served by Vite
docs/               Deployment and architecture notes
```

## Deployment

For a production build:

```bash
npm ci
npm run build
npm start
```

The Express server serves `dist/` when it exists and handles all `/api/*` routes. Do not deploy `dist/` as a standalone static site if you need invite gating, uploads, sessions, or AI generation.

More deployment notes are available in `docs/deployment.md` and `docs/container-deployment.md`.

## Repository Hygiene

The repository ignores local runtime state and private configuration such as `.env*`, `.runtime/`, `.claude/`, `.superpowers/`, `.playwright-mcp/`, `outputs/`, build output, coverage, logs, and debug artifacts.

Before publishing a fork or mirror, run:

```bash
git status --short
git check-ignore -v .env.production .runtime/foo .superpowers/foo outputs/foo .claude/foo
```

## Contributing

Keep behavior changes focused and add regression tests for deck editing, serialization, preview layout, agent protocol, or export changes. Use `npm test` and `npm run build` before opening a pull request.

## License

MIT
