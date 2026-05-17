# UI Design Map

This project-level UI refactor follows `design.md`. The visible layout and button copy stay unchanged; styling is centralized through CSS custom properties in `src/style.css`.

## Tokens

- Colors: `--color-canvas`, `--color-surface-soft`, `--color-surface-card`, `--color-surface-dark`, `--color-primary`, text, hairline, and semantic state colors live in `src/style.css`.
- Type: `--font-display` is used for major headings, `--font-sans` for app UI, and `--font-mono` for code-like blocks.
- Space/radius: `--space-*` and `--radius-*` mirror the 4px spacing and 8/12/16px radius scale from `design.md`.

## Editor Shell

- `topbar`, `.toolbar`, and global button states use cream secondary buttons, coral primary actions, and dark active states.
- `.workspace`, `.panel`, `.pages-panel`, `.stage`, `.slide-preview-*`, and `.candidate-compare-panel` use the cream canvas/card surfaces and hairline borders.
- `.left-panel-tabs`, `.agent-drawer-tabs`, `.fit-mode-toggle`, page thumbnails, node buttons, and text style controls use the same tab and segmented-control treatment.

## Agent And Export UI

- `.agent-workbench`, `.agent-compose-card`, `.agent-inline-candidate`, transcript entries, candidate cards, and reference chips use cream card surfaces.
- Submit/apply/download actions use the coral primary style; active tabs and selected generation modes use the dark product-surface style.
- `.smart-export-drawer`, progress steps, result/error/warning cards, and log entries use the same surface, status, and semantic color tokens.

## Guide Pages

- `src/app/htmlPptSkillGuide.css` styles the guide route shell, back link, summary cards, and guide-specific content blocks.
- `src/app/components/guide/guide.css` styles the guide browser frame, tabs, search, filters, view toggle, empty state, and preview drawer.
- `cards.css`, `views.css`, and `preview.css` apply the shared card, narrative view, and detail preview treatments to all guide resource types.
