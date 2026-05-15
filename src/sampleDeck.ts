export const sampleDeckHtml = `<!doctype html>
<html lang="en" data-fs-editable-deck="1">
  <head>
    <meta charset="UTF-8" />
    <title>可编辑演示示例</title>
    <style>
      :root {
        --deck-bg: #f4eee2;
        --deck-ink: #201715;
        --deck-muted: #715f59;
        --deck-accent: #d95d39;
        --deck-line: rgba(32, 23, 21, 0.12);
      }

      html, body {
        margin: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top left, rgba(217, 93, 57, 0.16), transparent 34%),
          linear-gradient(180deg, #faf5ea 0%, #f4eee2 100%);
        color: var(--deck-ink);
        font-family: "Satoshi", sans-serif;
      }

      .slide {
        width: min(100%, 1120px);
        min-height: 640px;
        margin: 0 auto;
        padding: 48px;
        box-sizing: border-box;
        display: grid;
        gap: 28px;
        align-content: start;
        position: relative;
        overflow: hidden;
      }

      .slide::before {
        content: "";
        position: absolute;
        inset: 20px;
        border: 1px solid var(--deck-line);
        pointer-events: none;
      }

      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 0.8rem;
        color: var(--deck-accent);
      }

      h1, h2, p {
        margin: 0;
      }

      h1, h2 {
        font-family: "Clash Display", sans-serif;
        line-height: 0.95;
      }

      .hero-title {
        font-size: clamp(3rem, 7vw, 5.8rem);
        max-width: 11ch;
      }

      .hero-copy {
        max-width: 56ch;
        line-height: 1.6;
        color: var(--deck-muted);
        font-size: 1.05rem;
      }

      .metric-card {
        border: 1px solid var(--deck-line);
        background: rgba(255, 255, 255, 0.52);
        padding: 20px;
        display: grid;
        gap: 10px;
        max-width: 320px;
      }

      .metric-number {
        font-size: clamp(2.8rem, 4vw, 4.5rem);
      }

      .media-frame {
        border: 1px solid var(--deck-line);
        background: rgba(255, 255, 255, 0.72);
        padding: 12px;
      }

      img {
        max-width: 100%;
        display: block;
      }
    </style>
  </head>
  <body>
    <div class="slides-offset">
      <section class="slide" data-slide-id="slide-1" id="slide-1">
        <p class="eyebrow" data-node-id="intro-eyebrow" data-edit-kind="text">可编辑演示</p>
        <h1
          class="hero-title"
          data-node-id="hero-title"
          data-edit-kind="text"
          data-motion-name="fade-up"
          data-motion-duration="550"
          data-motion-delay="40"
        >
          HTML 幻灯片也可以像故事板一样逐页编辑。
        </h1>
        <p class="hero-copy" data-node-id="hero-copy" data-edit-kind="text">
          在不打平原始 HTML 结构的前提下，直接调整文案、组件插槽、图片和轻量动效参数。
        </p>
        <article class="metric-card" data-node-id="metric-card" data-edit-kind="component">
          <p class="eyebrow" data-slot-key="label">当前方式</p>
          <h2 class="metric-number" data-slot-key="value">24%</h2>
          <p class="hero-copy" data-slot-key="body">当内容集中在一个浏览器工具里时，评审迭代会明显更快。</p>
        </article>
      </section>
      <section class="slide" data-slide-id="slide-2" id="slide-2">
        <p class="eyebrow" data-node-id="slide-two-eyebrow" data-edit-kind="text">视觉插槽</p>
        <figure class="media-frame" data-node-id="cover-image" data-edit-kind="image">
          <img
            src="data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 960 520'%3E%3Crect width='960' height='520' fill='%23f4eee2'/%3E%3Cpath d='M0 386C98 333 160 305 249 297c93-10 164 12 260 45 99 33 149 43 226 27 72-15 139-55 225-120v271H0Z' fill='%23d95d39' opacity='.84'/%3E%3Ccircle cx='228' cy='168' r='72' fill='%23201715' opacity='.15'/%3E%3Ccircle cx='733' cy='144' r='48' fill='%23d95d39' opacity='.24'/%3E%3C/svg%3E"
            alt="抽象封面示意图"
          />
        </figure>
      </section>
    </div>
  </body>
</html>`
