# Code Structure

This app treats a complete editable HTML deck string as the source of truth. The UI derives a lightweight model from that HTML for rendering and controls, then writes changes back by mutating a DOM document through the deck contract layer.

## Main Flow

1. `src/main.tsx` mounts `AppRoutes`.
2. `src/app/EditorRoutePage.tsx` chooses the initial session/deck context.
3. `src/app/App.tsx` coordinates editor state, current HTML history, selection, preview, import/export actions, and AI panel integration.
4. `src/deck-contract/deckContract.ts` owns editable deck markers, parsing, patching, slide helpers, and serialization.
5. Preview and export paths render the current HTML in iframes before serializing, capturing, or handing it to the backend agent.

## Frontend Boundaries

- `src/app/editor/` contains focused editor helpers and presentational components extracted from the main app coordinator.
- `src/app/components/guide/` contains the html-ppt guide browser and preview UI.
- `src/agent/` contains shared request/response schemas used by both the browser and server.
- `src/export-html/`, `src/export-pdf/`, and `src/export-pptx/` contain browser-side export pipelines.

## Backend Boundaries

- `server/createAiServer.ts` wires Express routes for health, invite auth, skills, html-ppt previews, agent turns, uploads, sessions, and artifact downloads.
- `server/deckAgent.ts` selects the active workflow and fallback behavior.
- `server/claudeCodeHtmlPptAgent.ts` and `server/claudeCodePptxExportAgent.ts` run isolated agent jobs in sandboxes.
- `server/embedded-skills/html-ppt/` is the embedded skill and template bundle used by html-ppt generation and guide previews.

Keep HTML contract changes in `src/deck-contract/` first. Keep App extractions behavior-preserving unless a feature specifically changes editor behavior.
