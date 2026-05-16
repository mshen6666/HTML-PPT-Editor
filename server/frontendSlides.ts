import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { HtmlPptAsset, HtmlPptConfig, HtmlPptState } from '../src/agent/protocol'
import {
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
  XHS_CANVAS_HEIGHT,
  XHS_CANVAS_WIDTH,
} from '../src/app/previewLayout'

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const EMBEDDED_SKILL_DIR = path.join(SERVER_DIR, 'embedded-skills', 'html-ppt')
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'])

const PRESET_COPY: Record<string, {
  label: string
  description: string
  background: string
  accent: string
  text: string
}> = {
  bold_signal: {
    label: 'Bold Signal',
    description: 'Confident, high-contrast launch framing with a vibrant accent card.',
    background: 'linear-gradient(135deg, #171717 0%, #2c2c2c 55%, #111111 100%)',
    accent: '#ff6a3d',
    text: '#ffffff',
  },
  dark_botanical: {
    label: 'Dark Botanical',
    description: 'Elegant, moody dark presentation with restrained highlights.',
    background: 'radial-gradient(circle at top left, rgba(127, 201, 168, 0.18), transparent 35%), linear-gradient(135deg, #101916 0%, #18231f 55%, #0c100f 100%)',
    accent: '#8ad1aa',
    text: '#f6f4ef',
  },
  notebook_tabs: {
    label: 'Notebook Tabs',
    description: 'Editorial paper texture with organized section tabs.',
    background: 'linear-gradient(180deg, #f9f1df 0%, #efe5cf 100%)',
    accent: '#dc6f48',
    text: '#35261d',
  },
  pastel_geometry: {
    label: 'Pastel Geometry',
    description: 'Warm approachable palette with playful shapes and soft contrast.',
    background: 'linear-gradient(135deg, #f7efe2 0%, #f4d7cf 50%, #d7e7ee 100%)',
    accent: '#1f6775',
    text: '#1f2430',
  },
}

let cachedSkillBundle:
  | {
      skillMarkdown: string
      stylePresetsMarkdown: string
    }
  | null = null

export async function loadEmbeddedHtmlPptSkill(): Promise<{
  skillMarkdown: string
  stylePresetsMarkdown: string
}> {
  if (cachedSkillBundle) {
    return cachedSkillBundle
  }

  const [skillMarkdown, themesMarkdown, layoutsMarkdown, fullDecksMarkdown, animationsMarkdown] = await Promise.all([
    readFile(path.join(EMBEDDED_SKILL_DIR, 'SKILL.md'), 'utf8'),
    readFile(path.join(EMBEDDED_SKILL_DIR, 'references', 'themes.md'), 'utf8'),
    readFile(path.join(EMBEDDED_SKILL_DIR, 'references', 'layouts.md'), 'utf8'),
    readFile(path.join(EMBEDDED_SKILL_DIR, 'references', 'full-decks.md'), 'utf8'),
    readFile(path.join(EMBEDDED_SKILL_DIR, 'references', 'animations.md'), 'utf8'),
  ])

  const stylePresetsMarkdown = [
    '## Themes',
    themesMarkdown,
    '## Layouts',
    layoutsMarkdown,
    '## Full Decks',
    fullDecksMarkdown,
    '## Animations',
    animationsMarkdown,
  ].join('\n\n')

  cachedSkillBundle = {
    skillMarkdown,
    stylePresetsMarkdown,
  }

  return cachedSkillBundle
}

export function createHtmlPptDiscoveryInstructions(
  config?: HtmlPptConfig,
  skillContext?: string,
): string {
  return [
    'You are the discovery and planning pass for a browser-only HTML presentation generator.',
    'Return JSON only.',
    'Decide whether the user has supplied enough information to generate the deck.',
    'If more information is required, return a structured form with concise user-facing questions.',
    'Use requiresFreeText=true on any option that needs typed follow-up content from the user.',
    'If enough information is already present, do not ask another question. Return a compact generationBrief that captures title, audience, slide arc, tone, visual direction, and CTA.',
    'Do not output HTML in this phase.',
    'Do not ask for local image folders, uploads, or filesystem paths.',
    'When no images are provided, assume CSS-only visuals.',
    createHtmlPptBriefPrompt(config),
    skillContext
      ? [
          'Follow the embedded html-ppt skill and style preset reference below as authoritative guidance.',
          skillContext,
        ].join('\n\n')
      : null,
  ].filter((value): value is string => Boolean(value)).join('\n\n')
}

export function createHtmlPptHtmlInstructions(
  config?: HtmlPptConfig,
  skillContext?: string,
): string {
  const canvas = getCanvasDimensionsForFormat(config?.format)

  return [
    'You generate a complete standalone HTML presentation as a single file.',
    'Return JSON only.',
    'The HTML must run directly in the browser with no build step and no external local assets.',
    'Prefer CSS-generated visuals, gradients, shapes, typography, and layout over image dependencies.',
    'Keep the result polished and presentation-ready with strong visual hierarchy.',
    'Use semantic HTML, responsive CSS, and lightweight inline JavaScript only when needed for navigation or motion.',
    `Set data-fs-canvas-width="${canvas.width}" and data-fs-canvas-height="${canvas.height}" on the root <html> element.`,
    `Use a fixed ${canvas.width}x${canvas.height} canvas for every slide; do not size slides from 100vw or 100vh.`,
    'For standard 16:9 decks, keep audience-facing content inside an approximate 1120x600 safe content budget.',
    'Do not use scrollable slide content; split dense content across more slides instead.',
    'Do not ask follow-up questions in this phase.',
    createHtmlPptBriefPrompt(config),
    skillContext
      ? [
          'Follow the embedded html-ppt skill and style preset reference below as authoritative guidance.',
          skillContext,
        ].join('\n\n')
      : null,
  ].filter((value): value is string => Boolean(value)).join('\n\n')
}

export function summarizeDeckForHtmlPpt(html: string): string {
  const slideMatches = Array.from(html.matchAll(/<section\b[^>]*data-slide-id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g))
  if (!slideMatches.length) {
    return 'No existing slide structure detected. Start from a fresh deck.'
  }

  const slideSummaries = slideMatches.slice(0, 4).map(([, slideId, sectionHtml], index) => {
    const headingMatch = sectionHtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)
    const text = stripTags(sectionHtml).replace(/\s+/g, ' ').trim()
    const excerpt = text ? truncate(text, 140) : 'No text content'
    const title = decodeHtml(stripTags(headingMatch?.[1] ?? slideId)).trim() || slideId

    return `${index + 1}. ${title} — ${excerpt}`
  })

  return [
    `Existing slide count: ${slideMatches.length}`,
    'Existing slide summary:',
    ...slideSummaries,
  ].join('\n')
}

export function createHtmlPptStylePreviews(
  prompt: string,
  config?: HtmlPptConfig,
): Array<{
  id: string
  presetId: string
  name: string
  description: string
  html: string
}> {
  return Object.entries(PRESET_COPY).map(([presetId, preset]) => {
    const fallback = createHtmlPptFallbackHtml(prompt, config, {
      state: {
        htmlPpt: {
          audience: config?.audience ?? 'general',
          format: config?.format ?? 'standalone',
          themeName: presetIdToThemeName(presetId),
          fullDeckName: config?.fullDeckName ?? 'tech-sharing',
          includeNotes: config?.includeNotes ?? true,
          preserveRuntime: config?.preserveRuntime ?? true,
          slideCountHint: config?.slideCountHint,
          layoutNames: config?.layoutNames,
          animationNames: config?.animationNames,
        },
      },
    })

    return {
      id: `preview-${presetId}`,
      presetId,
      name: preset.label,
      description: preset.description,
      html: fallback.html,
    }
  })
}

export function createHtmlPptFallbackHtml(
  prompt: string,
  config?: HtmlPptConfig,
  options: {
    targetSlideCount?: number
    existingHtml?: string
    state?: HtmlPptState | null
  } = {},
): {
  html: string
  title: string
  slideCount: number
} {
  const canvas = getCanvasDimensionsForFormat(config?.format)
  const preset = resolvePresetCopy(config, options.state?.htmlPpt)
  const targetSlideCount = Math.max(options.targetSlideCount ?? 1, 1)
  const context = createFallbackContext(prompt, config, options)
  const slides = createFallbackSlides(context, targetSlideCount)
  const title = context.title
  const html = `<!doctype html>
<html
  lang="zh-CN"
  data-fs-canvas-width="${canvas.width}"
  data-fs-canvas-height="${canvas.height}"
>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      html, body {
        height: 100%;
        overflow-x: hidden;
        margin: 0;
      }

      html {
        scroll-snap-type: y mandatory;
        scroll-behavior: smooth;
      }

      :root {
        --title-size: clamp(2rem, 6vw, 4.8rem);
        --body-size: clamp(0.95rem, 1.6vw, 1.15rem);
        --padding: clamp(1.2rem, 4vw, 4rem);
        --canvas-width: ${canvas.width}px;
        --canvas-height: ${canvas.height}px;
        --content-width: ${Math.max(canvas.width - 160, 640)}px;
        --content-height: ${Math.max(canvas.height - 120, 480)}px;
        --accent: ${preset.accent};
        --text: ${preset.text};
        --background: ${preset.background};
      }

      body {
        background: var(--background);
        color: var(--text);
        font-family: "Space Grotesk", "Segoe UI", sans-serif;
      }

      .slide {
        width: ${canvas.width}px;
        height: ${canvas.height}px;
        max-width: 100%;
        overflow: hidden;
        scroll-snap-align: start;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        padding: clamp(1rem, 4vw, 3rem);
      }

      .slide::before {
        content: "";
        position: absolute;
        inset: clamp(10px, 2vw, 20px);
        border: 1px solid color-mix(in srgb, ${preset.accent} 28%, transparent);
        border-radius: 28px;
        pointer-events: none;
      }

      .shell {
        width: min(var(--content-width), calc(var(--canvas-width) - 96px));
        max-height: var(--content-height);
        overflow: hidden;
        display: grid;
        gap: clamp(0.8rem, 2vw, 1.6rem);
        grid-template-columns: minmax(0, 1.15fr) minmax(240px, 0.85fr);
        padding: var(--padding);
        border-radius: 32px;
        background:
          radial-gradient(circle at top right, color-mix(in srgb, ${preset.accent} 18%, transparent), transparent 38%),
          color-mix(in srgb, ${preset.accent} 10%, rgba(255,255,255,0.06));
        box-shadow: 0 20px 80px rgba(0, 0, 0, 0.22);
      }

      .shell.single {
        grid-template-columns: 1fr;
      }

      .eyebrow {
        margin: 0;
        font-size: clamp(0.8rem, 1vw, 1rem);
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: color-mix(in srgb, var(--accent) 70%, white);
      }

      h1 {
        margin: 0;
        font-size: var(--title-size);
        line-height: 0.94;
        max-width: 10ch;
        font-family: "Archivo Black", "Segoe UI", sans-serif;
      }

      h2 {
        margin: 0;
        font-size: clamp(1.6rem, 3.6vw, 3rem);
        line-height: 1;
        max-width: 12ch;
      }

      p {
        margin: 0;
        max-width: 58ch;
        font-size: var(--body-size);
        line-height: 1.55;
        color: color-mix(in srgb, var(--text) 82%, transparent);
      }

      .lede {
        display: grid;
        gap: clamp(0.7rem, 1.4vw, 1.2rem);
        align-content: center;
      }

      .side {
        display: grid;
        gap: clamp(0.6rem, 1.2vw, 1rem);
        align-content: center;
      }

      .mini-card, .list-card {
        border-radius: 22px;
        padding: clamp(0.8rem, 1.8vw, 1.2rem);
        background: rgba(0, 0, 0, 0.14);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .mini-card strong, .list-card strong {
        display: block;
        margin-bottom: 0.45rem;
        font-size: clamp(0.88rem, 1.3vw, 1rem);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .bullet-list {
        margin: 0;
        padding-left: 1.1rem;
        display: grid;
        gap: clamp(0.35rem, 0.8vh, 0.7rem);
        font-size: clamp(0.85rem, 1.3vw, 1.02rem);
        line-height: 1.45;
        color: color-mix(in srgb, var(--text) 84%, transparent);
      }

      .progress-bar {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 4px;
        z-index: 20;
        background: rgba(255, 255, 255, 0.08);
      }

      .progress-bar span {
        display: block;
        width: 0;
        height: 100%;
        background: linear-gradient(90deg, ${preset.accent}, color-mix(in srgb, ${preset.accent} 48%, white));
        transition: width 0.3s ease;
      }

      .nav-dots {
        position: fixed;
        right: 14px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 20;
        display: grid;
        gap: 8px;
      }

      .nav-dot {
        width: 11px;
        height: 11px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.16);
      }

      .nav-dot.is-active {
        background: var(--accent);
        border-color: var(--accent);
        transform: scale(1.15);
      }

      .quote {
        font-size: clamp(1.2rem, 2.6vw, 2rem);
        line-height: 1.3;
      }

      @media (max-width: 900px) {
        .shell {
          grid-template-columns: 1fr;
        }
      }

      @media (max-height: 700px) {
        :root {
          --padding: clamp(0.9rem, 3vw, 2rem);
          --title-size: clamp(1.8rem, 5vw, 3.6rem);
          --body-size: clamp(0.82rem, 1.2vw, 0.98rem);
        }
      }

      @media (max-height: 600px) {
        .nav-dots {
          display: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          transition-duration: 0.2s !important;
        }

        html {
          scroll-behavior: auto;
        }
      }
    </style>
  </head>
  <body>
    <div class="progress-bar" aria-hidden="true"><span id="progress-fill"></span></div>
    <nav class="nav-dots" id="nav-dots" aria-label="幻灯片导航"></nav>
    ${slides.map((slide, index) => renderFallbackSlide(slide, index)).join('\n')}
    <script>
      class SlidePresentation {
        constructor() {
          this.slides = Array.from(document.querySelectorAll('.slide'));
          this.fill = document.getElementById('progress-fill');
          this.dotsRoot = document.getElementById('nav-dots');
          this.index = 0;
          this.locked = false;
          this.touchY = null;
          this.dots = [];
          this.buildDots();
          this.bind();
          this.observe();
          this.paint(0);
        }
        buildDots() {
          this.slides.forEach((_, i) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'nav-dot';
            button.setAttribute('aria-label', '跳转到第 ' + (i + 1) + ' 页');
            button.addEventListener('click', () => this.go(i));
            this.dotsRoot.appendChild(button);
            this.dots.push(button);
          });
        }
        bind() {
          document.addEventListener('keydown', (event) => {
            if (['ArrowDown', 'PageDown', ' ', 'ArrowRight'].includes(event.key)) {
              event.preventDefault();
              this.go(this.index + 1);
            }
            if (['ArrowUp', 'PageUp', 'ArrowLeft'].includes(event.key)) {
              event.preventDefault();
              this.go(this.index - 1);
            }
          });
          window.addEventListener('wheel', (event) => {
            if (this.locked || Math.abs(event.deltaY) < 18) return;
            this.locked = true;
            this.go(this.index + (event.deltaY > 0 ? 1 : -1));
            setTimeout(() => { this.locked = false; }, 650);
          }, { passive: true });
          window.addEventListener('touchstart', (event) => {
            this.touchY = event.touches[0]?.clientY ?? null;
          }, { passive: true });
          window.addEventListener('touchend', (event) => {
            if (this.touchY == null) return;
            const delta = this.touchY - (event.changedTouches[0]?.clientY ?? this.touchY);
            if (Math.abs(delta) > 42) this.go(this.index + (delta > 0 ? 1 : -1));
            this.touchY = null;
          }, { passive: true });
        }
        observe() {
          const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              const next = this.slides.indexOf(entry.target);
              this.paint(next);
            });
          }, { threshold: 0.56 });
          this.slides.forEach((slide) => io.observe(slide));
        }
        paint(index) {
          this.index = Math.max(0, Math.min(index, this.slides.length - 1));
          if (this.fill) this.fill.style.width = (((this.index + 1) / this.slides.length) * 100) + '%';
          this.dots.forEach((dot, dotIndex) => dot.classList.toggle('is-active', dotIndex === this.index));
        }
        go(index) {
          const safe = Math.max(0, Math.min(index, this.slides.length - 1));
          this.slides[safe]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      new SlidePresentation();
    </script>
  </body>
</html>`

  return {
    html,
    title,
    slideCount: slides.length,
  }
}

export function extractHtmlPreviewMeta(html: string): {
  title: string
  slideCount: number
} {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i)
  const headingMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const slideCount = Array.from(html.matchAll(/class="[^"]*\bslide\b[^"]*"/g)).length || 1

  return {
    title: decodeHtml(titleMatch?.[1] ?? headingMatch?.[1] ?? 'HTML candidate').trim() || 'HTML candidate',
    slideCount,
  }
}

function presetIdToThemeName(presetId: string): string {
  switch (presetId) {
    case 'dark_botanical':
      return 'editorial-serif'
    case 'notebook_tabs':
      return 'corporate-clean'
    case 'pastel_geometry':
      return 'xiaohongshu-white'
    default:
      return 'tokyo-night'
  }
}

function resolvePresetCopy(
  config?: HtmlPptConfig,
  stateConfig?: HtmlPptConfig,
): (typeof PRESET_COPY)[keyof typeof PRESET_COPY] {
  const themeName = config?.themeName ?? stateConfig?.themeName ?? 'tokyo-night'

  switch (themeName) {
    case 'corporate-clean':
      return PRESET_COPY.notebook_tabs
    case 'editorial-serif':
      return PRESET_COPY.dark_botanical
    case 'xiaohongshu-white':
      return PRESET_COPY.pastel_geometry
    default:
      return PRESET_COPY.bold_signal
  }
}

function createEyebrow(config?: HtmlPptConfig): string {
  switch (config?.audience) {
    case 'engineers':
      return 'Tech sharing'
    case 'executives':
      return 'Executive briefing'
    case 'students':
      return 'Course module'
    case 'consumers':
      return 'Creator deck'
    default:
      return 'HTML PPT deck'
  }
}

function createHtmlPptBriefPrompt(config?: HtmlPptConfig): string {
  return [
    `Audience: ${config?.audience ?? 'general'}`,
    `Format: ${config?.format ?? 'standalone'}`,
    `Preferred theme: ${config?.themeName ?? 'tokyo-night'}`,
    `Preferred full-deck template: ${config?.fullDeckName ?? 'tech-sharing'}`,
    `Speaker notes: ${(config?.includeNotes ?? true) ? 'include notes blocks' : 'notes optional'}`,
    `Keyboard runtime: ${(config?.preserveRuntime ?? true) ? 'keep runtime.js interactions' : 'runtime may be simplified'}`,
    config?.layoutNames?.length ? `Preferred layouts: ${config.layoutNames.join(', ')}` : 'Preferred layouts: derive from the deck brief.',
    config?.animationNames?.length ? `Preferred animations: ${config.animationNames.join(', ')}` : 'Preferred animations: keep motion restrained and template-native.',
  ].join('\n')
}

function createSubtitle(config?: HtmlPptConfig): string {
  const formatLabel = config?.format === 'pdf'
    ? 'PDF-friendly deck.'
    : config?.format === 'xhs'
      ? 'Social-first story arc.'
      : config?.format === 'live'
        ? 'Live presentation with speaker flow.'
        : 'Standalone browser deck.'
  const slideLabel = config?.slideCountHint ? `${config.slideCountHint} slides target.` : 'Slide count derived from the brief.'
  const runtimeLabel = config?.preserveRuntime === false ? 'Runtime can be simplified.' : 'Keep keyboard runtime and overview flow.'

  return `${formatLabel} ${slideLabel} ${runtimeLabel}`
}

export async function scanFrontendSlidesAssets(imageFolderPath: string): Promise<HtmlPptAsset[]> {
  const resolvedPath = path.resolve(imageFolderPath)
  const entries = await readdir(resolvedPath, { withFileTypes: true })
  const imageEntries = entries
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      entry,
      ext: path.extname(entry.name).toLowerCase(),
    }))
    .filter(({ ext }) => IMAGE_EXTENSIONS.has(ext))
    .sort((left, right) => left.entry.name.localeCompare(right.entry.name))

  return Promise.all(
    imageEntries.map(async ({ entry, ext }) => {
      const assetPath = path.join(resolvedPath, entry.name)
      const details = await stat(assetPath)

      return {
        fileName: entry.name,
        path: assetPath,
        ext,
        sizeBytes: details.size,
        usability: details.size > 0 ? 'usable' : 'ignored',
        reason: details.size > 0 ? 'Detected local image asset.' : 'Empty file was ignored.',
      } satisfies HtmlPptAsset
    }),
  )
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ')
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
}

function decodeHtml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
}

type FallbackContext = {
  title: string
  eyebrow: string
  subtitle: string
  audience: string
  cta: string
  highlights: string[]
  scannedAssets: HtmlPptAsset[]
}

type FallbackSlide = {
  eyebrow: string
  title: string
  body: string
  bullets: string[]
  sideTitle: string
  sideBody: string
}

function createFallbackContext(
  prompt: string,
  config: HtmlPptConfig | undefined,
  options: {
    existingHtml?: string
    state?: HtmlPptState | null
  },
): FallbackContext {
  const state = options.state ?? null
  const existingTitle = extractExistingDeckTitle(options.existingHtml)
  const replyText = state?.lastInputReply?.answers
    .map((answer) => answer.text?.trim() || answer.value.trim())
    .filter(Boolean)
    .join(' ')
  const source = [state?.initialMessage, replyText, prompt, existingTitle].filter(Boolean).join(' ')
  const title = deriveFallbackTitle(source, existingTitle)
  const highlights = deriveFallbackHighlights(source)
  const audience = deriveAudienceLabel(state?.lastInputReply?.answers.find((answer) => answer.questionId === 'audience')?.value)
  const cta = deriveCtaLabel(state?.lastInputReply?.answers.find((answer) => answer.questionId === 'cta')?.text)

  return {
    title,
    eyebrow: createEyebrow(config),
    subtitle: createSubtitle(config),
    audience,
    cta,
    highlights,
    scannedAssets: state?.scannedAssets ?? [],
  }
}

function createFallbackSlides(context: FallbackContext, targetSlideCount: number): FallbackSlide[] {
  const baseSlides: FallbackSlide[] = [
    {
      eyebrow: context.eyebrow,
      title: context.title,
      body: context.subtitle,
      bullets: [
        `Audience: ${context.audience}`,
        `Story arc: ${context.highlights.slice(0, 2).join(' / ') || '产品发布与价值阐释'}`,
        context.scannedAssets.length
          ? `Assets ready: ${context.scannedAssets.filter((asset) => asset.usability === 'usable').length} visuals`
          : 'Assets ready: CSS-generated visuals',
      ],
      sideTitle: 'Launch focus',
      sideBody: '本页聚焦发布叙事主轴，先建立价值感知，再引出后续结构。',
    },
    {
      eyebrow: 'Why now',
      title: '为什么现在值得关注',
      body: `${context.title} 需要先讲清问题背景、受众场景和采用时机，让后续能力页有明确承接。`,
      bullets: [
        '点明业务环境与现有流程的摩擦成本。',
        '把受众关心的结果放在技术细节前面。',
        '为后续能力、案例和 CTA 建立统一叙事。',
      ],
      sideTitle: 'Audience lens',
      sideBody: context.audience,
    },
    {
      eyebrow: 'Core value',
      title: '核心价值主张',
      body: `${context.title} 的叙事主轴是用更短路径把产品价值、差异化和落地方式讲清。`,
      bullets: context.highlights.slice(0, 4),
      sideTitle: 'CTA',
      sideBody: context.cta,
    },
  ]

  const featureTopics = context.highlights.length
    ? context.highlights
    : ['多渠道工作流', '自动摘要与知识库', '团队协作与权限', '企业级数据治理']

  while (baseSlides.length < Math.max(targetSlideCount - 1, 1)) {
    const topic = featureTopics[(baseSlides.length - 3) % featureTopics.length]
    baseSlides.push({
      eyebrow: `Feature ${baseSlides.length - 2}`,
      title: topic,
      body: `${topic} 这一页聚焦具体能力与落地场景，承接开场并推进核心论证。`,
      bullets: [
        `Explain how ${topic} supports the presentation goal.`,
        'Use one concrete workflow, scenario, or proof point.',
        'Keep content density within viewport-fitting limits.',
      ],
      sideTitle: 'Presenter note',
      sideBody: '保持与开场页一致的视觉节奏与叙事语气，强化整体连贯性。',
    })
  }

  if (targetSlideCount >= 2) {
    baseSlides.push({
      eyebrow: 'Closing',
      title: '结尾与行动',
      body: '收尾页需要把价值总结、行动引导和视觉收束放到一起，形成完整闭环。',
      bullets: [
        `Recap: ${context.title}`,
        `CTA: ${context.cta}`,
        'Invite follow-up demo, trial, or partnership discussion.',
      ],
      sideTitle: 'Closing signal',
      sideBody: '保持与首屏相同的视觉基调，避免结尾页失真。',
    })
  }

  return baseSlides.slice(0, targetSlideCount)
}

function renderFallbackSlide(slide: FallbackSlide, index: number): string {
  const singleColumn = slide.bullets.length <= 1
  const slideId = `slide-${index + 1}`
  return `<section class="slide" data-slide-id="${slideId}" id="${slideId}" data-title="${escapeHtml(slide.title)}">
      <article class="shell${singleColumn ? ' single' : ''}">
        <div class="lede">
          <p class="eyebrow" data-node-id="${slideId}-eyebrow" data-edit-kind="text">${escapeHtml(slide.eyebrow)}</p>
          ${index === 0
            ? `<h1 data-node-id="${slideId}-title" data-edit-kind="text">${escapeHtml(slide.title)}</h1>`
            : `<h2 data-node-id="${slideId}-title" data-edit-kind="text">${escapeHtml(slide.title)}</h2>`}
          <p data-node-id="${slideId}-body" data-edit-kind="text">${escapeHtml(slide.body)}</p>
          <div class="list-card">
            <strong>Key points</strong>
            <ul class="bullet-list">${slide.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          </div>
        </div>
        <aside class="side">
          <div class="mini-card">
            <strong>${escapeHtml(slide.sideTitle)}</strong>
            <p>${escapeHtml(slide.sideBody)}</p>
          </div>
          <div class="mini-card">
            <strong>Viewport fit</strong>
            <p>Each fallback slide is constrained to a single viewport and keeps content density within the html-ppt baseline.</p>
          </div>
        </aside>
      </article>
    </section>`
}

function extractExistingDeckTitle(existingHtml: string | undefined): string {
  if (!existingHtml) {
    return ''
  }

  const titleMatch = existingHtml.match(/<title>([\s\S]*?)<\/title>/i)
  const headingMatch = existingHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  return decodeHtml(stripTags(titleMatch?.[1] ?? headingMatch?.[1] ?? '')).trim()
}

function deriveFallbackTitle(source: string, existingTitle: string): string {
  const productMatch = source.match(/([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3}\s?(?:AI|Studio|Cloud|Launch)?)/)
  const chineseMatch = source.match(/([^\s，。:：]{2,24}(?:平台|系统|产品|演示))/)
  const cleanedExisting = sanitizeFallbackTitle(existingTitle)

  if (cleanedExisting) {
    return cleanedExisting
  }
  if (productMatch?.[1]) {
    return sanitizeFallbackTitle(productMatch[1])
  }
  if (chineseMatch?.[1]) {
    return sanitizeFallbackTitle(chineseMatch[1])
  }

  return sanitizeFallbackTitle(source) || 'HTML PPT Presentation'
}

function sanitizeFallbackTitle(value: string): string {
  const trimmed = value
    .replace(/Extend the current presentation.*$/i, '')
    .replace(/继续生成剩余.*$/i, '')
    .replace(/生成一份|演示|简报|发布会?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return trimmed.slice(0, 36)
}

function deriveFallbackHighlights(source: string): string[] {
  const matches = source
    .split(/[；;。.!?\n]/)
    .flatMap((segment) => segment.split(/[、,，]/))
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 4)

  const unique = Array.from(new Set(matches))
  if (unique.length) {
    return unique.slice(0, 6)
  }

  return [
    '明确产品定位与面向人群',
    '拆解关键能力与使用场景',
    '突出差异化与可信度信号',
    '给出明确的后续行动引导',
  ]
}

function deriveAudienceLabel(value: string | undefined): string {
  switch (value) {
    case 'customers':
      return '客户 / 企业用户'
    case 'investors':
      return '投资人 / 管理层'
    case 'public':
      return '媒体 / 公众'
    case 'other':
      return '其他目标受众'
    default:
      return '目标受众（待确认）'
  }
}

function deriveCtaLabel(value: string | undefined): string {
  return value?.trim() || '立即预约演示 / 申请试用 / 联系合作'
}

function getCanvasDimensionsForFormat(format: HtmlPptConfig['format'] | undefined): {
  width: number
  height: number
} {
  if (format === 'xhs') {
    return {
      width: XHS_CANVAS_WIDTH,
      height: XHS_CANVAS_HEIGHT,
    }
  }

  return {
    width: DEFAULT_CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
  }
}
