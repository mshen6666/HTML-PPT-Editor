import { DEFAULT_CANVAS_HEIGHT, DEFAULT_CANVAS_WIDTH } from './app/previewLayout'

export const blankDeckHtml = `<!doctype html>
<html
  lang="zh-CN"
  data-fs-editable-deck="1"
  data-fs-deck-profile="html-ppt"
  data-fs-canvas-width="${DEFAULT_CANVAS_WIDTH}"
  data-fs-canvas-height="${DEFAULT_CANVAS_HEIGHT}"
>
  <head>
    <meta charset="UTF-8" />
    <title>空白演示</title>
    <link rel="stylesheet" id="theme-link" href="./themes/minimal-white.css" />
    <style>
      :root {
        --deck-bg: #f7f1e8;
        --deck-surface: rgba(255, 250, 241, 0.9);
        --deck-ink: #201715;
        --deck-muted: #6f5d55;
        --deck-accent: #d95d39;
        --deck-line: rgba(32, 23, 21, 0.12);
      }

      html, body {
        margin: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top left, rgba(217, 93, 57, 0.18), transparent 30%),
          linear-gradient(180deg, #fcf8f2 0%, #f3ede3 100%);
        color: var(--deck-ink);
        font-family: 'Satoshi', 'Noto Sans SC', sans-serif;
      }

      body {
        padding: 0;
      }

      .deck {
        position: relative;
      }

      .slide {
        width: min(100%, 1280px);
        min-height: 720px;
        margin: 0 auto;
        padding: 56px;
        box-sizing: border-box;
        display: block;
        position: relative;
      }

      .slide::before {
        content: '';
        position: absolute;
        inset: 28px;
        border: 1px solid var(--deck-line);
        border-radius: 28px;
        pointer-events: none;
      }

      .notes {
        display: none;
      }
    </style>
  </head>
  <body data-themes="minimal-white,editorial-serif,tokyo-night,aurora,corporate-clean" data-theme-base="./themes/">
    <div class="deck">
      <section class="slide is-active" data-slide-id="slide-1" id="slide-1" data-title="Blank"></section>
    </div>
  </body>
</html>`
