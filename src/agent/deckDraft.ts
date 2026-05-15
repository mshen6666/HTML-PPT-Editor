import { z } from 'zod'

import { createDeckDocument, parseControlledDeck } from '../deck-contract/deckContract'
import { DEFAULT_CANVAS_HEIGHT, DEFAULT_CANVAS_WIDTH } from '../app/previewLayout'

const deckThemeSchema = z.object({
  accent: z.string().min(1),
  background: z.string().min(1),
  text: z.string().min(1),
  muted: z.string().min(1),
})

const bodySchema = z.array(z.string().min(1)).min(1)

const titleBodySlideSchema = z.object({
  template: z.literal('title-body'),
  title: z.string().min(1),
  eyebrow: z.string().min(1),
  body: bodySchema,
})

const imageFocusSlideSchema = z.object({
  template: z.literal('image-focus'),
  title: z.string().min(1),
  body: bodySchema,
  image: z.object({
    alt: z.string().min(1),
    prompt: z.string().min(1),
  }),
})

const metricsSlideSchema = z.object({
  template: z.literal('metrics'),
  title: z.string().min(1),
  eyebrow: z.string().min(1),
  body: bodySchema,
  metrics: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(1),
      }),
    )
    .min(1)
    .max(4),
})

export const deckDraftSchema = z.object({
  title: z.string().min(1),
  theme: deckThemeSchema,
  slides: z.array(z.union([titleBodySlideSchema, imageFocusSlideSchema, metricsSlideSchema])).min(1),
})

export type DeckDraft = z.infer<typeof deckDraftSchema>
export type DeckSlideDraft = DeckDraft['slides'][number]

export function compileDeckDraftToHtml(input: DeckDraft): string {
  const draft = deckDraftSchema.parse(input)
  const slidesMarkup = draft.slides
    .map((slide, index) => renderSlide(slide, index + 1))
    .join('\n')

  return `<!doctype html>
<html
  lang="en"
  data-fs-editable-deck="1"
  data-fs-canvas-width="${DEFAULT_CANVAS_WIDTH}"
  data-fs-canvas-height="${DEFAULT_CANVAS_HEIGHT}"
>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(draft.title)}</title>
    <style>
      :root {
        --deck-accent: ${escapeAttribute(draft.theme.accent)};
        --deck-bg: ${escapeAttribute(draft.theme.background)};
        --deck-text: ${escapeAttribute(draft.theme.text)};
        --deck-muted: ${escapeAttribute(draft.theme.muted)};
        --deck-line: rgba(32, 23, 21, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--deck-accent) 18%, transparent), transparent 34%),
          linear-gradient(180deg, color-mix(in srgb, var(--deck-bg) 72%, white) 0%, var(--deck-bg) 100%);
        color: var(--deck-text);
        font-family: "Satoshi", "Segoe UI", sans-serif;
      }

      .slides-offset {
        display: grid;
        gap: 24px;
        padding: 24px;
      }

      .slide {
        width: min(100%, 1120px);
        min-height: 640px;
        margin: 0 auto;
        padding: 48px;
        position: relative;
        overflow: hidden;
        display: grid;
        gap: 24px;
        align-content: start;
        border: 1px solid rgba(32, 23, 21, 0.08);
        background: rgba(255, 255, 255, 0.64);
      }

      .slide::before {
        content: "";
        position: absolute;
        inset: 18px;
        border: 1px solid var(--deck-line);
        pointer-events: none;
      }

      .eyebrow {
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 0.82rem;
        color: var(--deck-accent);
      }

      .hero-title,
      .section-title,
      .metric-value {
        margin: 0;
        font-family: "Clash Display", "Segoe UI", sans-serif;
        line-height: 0.95;
      }

      .hero-title,
      .section-title {
        font-size: clamp(2.8rem, 6vw, 5.4rem);
        max-width: 11ch;
      }

      .body-copy {
        margin: 0;
        max-width: 62ch;
        font-size: 1.04rem;
        line-height: 1.65;
        color: var(--deck-muted);
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 18px;
      }

      .metric-card {
        display: grid;
        gap: 10px;
        padding: 20px;
        border: 1px solid var(--deck-line);
        background: rgba(255, 255, 255, 0.76);
      }

      .metric-value {
        font-size: clamp(2.2rem, 4vw, 3.8rem);
      }

      .media-frame {
        width: min(100%, 760px);
        margin: 0;
        padding: 14px;
        border: 1px solid var(--deck-line);
        background: rgba(255, 255, 255, 0.82);
      }

      .media-frame img {
        display: block;
        width: 100%;
        height: auto;
        object-fit: cover;
      }
    </style>
  </head>
  <body>
    <div class="slides-offset">
      ${slidesMarkup}
    </div>
  </body>
</html>`
}

export function summarizeDeckHtmlForPrompt(html: string): string {
  const document = createDeckDocument(html)
  const deck = parseControlledDeck(document)

  return deck.slides
    .map((slide) => {
      const nodeSummaries = slide.nodes.map((nodeId) => {
        const node = deck.nodes[nodeId]
        if (node.kind === 'text') {
          return `${nodeId}:text:${stripTags(node.html)}`
        }
        if (node.kind === 'image') {
          return `${nodeId}:image:${node.image.alt}`
        }
        return `${nodeId}:component:${Object.values(node.slots).join(' | ')}`
      })

      return `${slide.id} -> ${nodeSummaries.join('; ')}`
    })
    .join('\n')
}

function renderSlide(slide: DeckSlideDraft, slideNumber: number): string {
  const slideId = `slide-${slideNumber}`

  if (slide.template === 'title-body') {
    return `<section class="slide" data-slide-id="${slideId}" id="${slideId}">
      <p class="eyebrow" data-node-id="${slideId}-eyebrow" data-edit-kind="text">${escapeHtml(slide.eyebrow)}</p>
      <h1 class="hero-title" data-node-id="${slideId}-title" data-edit-kind="text">${escapeHtml(slide.title)}</h1>
      <p class="body-copy" data-node-id="${slideId}-body" data-edit-kind="text">${joinBody(slide.body)}</p>
    </section>`
  }

  if (slide.template === 'image-focus') {
    return `<section class="slide" data-slide-id="${slideId}" id="${slideId}">
      <h1 class="hero-title" data-node-id="${slideId}-title" data-edit-kind="text">${escapeHtml(slide.title)}</h1>
      <p class="body-copy" data-node-id="${slideId}-body" data-edit-kind="text">${joinBody(slide.body)}</p>
      <figure class="media-frame" data-node-id="${slideId}-image" data-edit-kind="image">
        <img src="${createPlaceholderImageDataUrl(slide.image.prompt)}" alt="${escapeAttribute(slide.image.alt)}" />
      </figure>
    </section>`
  }

  return `<section class="slide" data-slide-id="${slideId}" id="${slideId}">
    <p class="eyebrow" data-node-id="${slideId}-eyebrow" data-edit-kind="text">${escapeHtml(slide.eyebrow)}</p>
    <h2 class="section-title" data-node-id="${slideId}-title" data-edit-kind="text">${escapeHtml(slide.title)}</h2>
    <div class="metrics-grid">
      ${slide.metrics
        .map(
          (metric, index) => `<article class="metric-card" data-node-id="${slideId}-metric-${index + 1}" data-edit-kind="component">
        <p class="eyebrow" data-slot-key="label">${escapeHtml(metric.label)}</p>
        <h3 class="metric-value" data-slot-key="value">${escapeHtml(metric.value)}</h3>
      </article>`,
        )
        .join('\n')}
    </div>
    <p class="body-copy" data-node-id="${slideId}-body" data-edit-kind="text">${joinBody(slide.body)}</p>
  </section>`
}

function joinBody(body: string[]): string {
  return body.map((line) => escapeHtml(line)).join('<br />')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;')
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function createPlaceholderImageDataUrl(prompt: string): string {
  const safePrompt = escapeHtml(prompt.slice(0, 80))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
    <rect width="960" height="540" fill="#f4eee2"/>
    <rect x="52" y="52" width="856" height="436" rx="28" fill="#fffaf1" stroke="#d8cfc0"/>
    <path d="M128 382l154-142 142 108 170-176 238 210H128Z" fill="#d95d39" opacity="0.84"/>
    <circle cx="292" cy="172" r="56" fill="#201715" opacity="0.12"/>
    <text x="88" y="470" fill="#715f59" font-size="28" font-family="Segoe UI, sans-serif">${safePrompt}</text>
  </svg>`

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
