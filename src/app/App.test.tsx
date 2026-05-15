import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import { calculatePreviewScale } from './previewLayout'
import { compileDeckDraftToHtml } from '../agent/deckDraft'

const sampleDeck = `<!doctype html>
<html lang="en" data-fs-editable-deck="1">
  <head>
    <meta charset="UTF-8" />
    <title>示例演示</title>
    <style>
      .slide { padding: 20px; }
    </style>
  </head>
  <body>
    <div class="slides-offset">
      <section class="slide" data-slide-id="slide-1" id="slide-1">
        <div data-node-id="text-hero" data-edit-kind="text">你好，世界</div>
        <article data-node-id="card-1" data-edit-kind="component">
          <h2 data-slot-key="title">季度回顾</h2>
          <p data-slot-key="body">营收同比增长 24%。</p>
        </article>
      </section>
      <section class="slide" data-slide-id="slide-2" id="slide-2">
        <div data-node-id="text-2" data-edit-kind="text">第二页</div>
        <figure data-node-id="image-2" data-edit-kind="image">
          <img
            src="data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%23f4eee2'/%3E%3C/svg%3E"
            alt="抽象封面示意图"
          />
        </figure>
      </section>
    </div>
  </body>
</html>`

const paragraphTextDeck = `<!doctype html>
<html lang="zh-CN" data-fs-editable-deck="1" data-fs-deck-profile="html-ppt">
  <head>
    <meta charset="UTF-8" />
    <title>段落测试</title>
  </head>
  <body>
    <div class="deck">
      <section class="slide is-active" data-slide-id="slide-1" id="slide-1">
        <p data-node-id="body-copy" data-edit-kind="text">段落原文</p>
      </section>
    </div>
  </body>
</html>`

const revealDeck = `<!doctype html>
<html lang="en" data-fs-editable-deck="1">
  <head>
    <meta charset="UTF-8" />
    <style>
      .reveal {
        opacity: 0;
        transform: translateY(24px);
      }

      .slide.visible .reveal {
        opacity: 1;
        transform: translateY(0);
      }
    </style>
  </head>
  <body>
    <div class="slides-offset">
      <section class="slide" data-slide-id="slide-1" id="slide-1">
        <div class="reveal" data-node-id="text-hero" data-edit-kind="text">可见内容</div>
      </section>
    </div>
  </body>
</html>`

const importedGlobalStyleDeck = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <style>
      :root {
        --body-size: 12px;
      }

      * {
        margin: 0;
        padding: 0;
      }

      html,
      body {
        height: 100%;
        overflow: hidden;
      }

      body {
        font-size: var(--body-size);
        color: rgb(255, 255, 255);
      }

      body::before {
        content: '';
        position: fixed;
        inset: 0;
      }

      .slide {
        width: 100vw;
        height: 100vh;
      }
    </style>
  </head>
  <body>
    <section class="slide">
      <h1>导入稿件</h1>
      <p>测试全局样式隔离</p>
    </section>
  </body>
</html>`

const importedBodyClassDeck = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <style>
      body::before {
        content: '';
      }

      .body {
        display: grid;
        align-content: center;
      }
    </style>
  </head>
  <body>
    <section class="slide">
      <div class="body">
        <h1>居中正文</h1>
      </div>
    </section>
  </body>
</html>`

const htmlPptDeck = `<!doctype html>
<html lang="en" data-fs-editable-deck="1" data-fs-deck-profile="html-ppt">
  <head>
    <meta charset="UTF-8" />
    <style>
      .slide {
        opacity: 0;
        pointer-events: none;
      }

      .slide.is-active {
        opacity: 1;
        pointer-events: auto;
      }

      [data-anim] {
        opacity: 0;
        animation: fade-up 680ms both;
        animation-play-state: paused;
      }

      .slide.is-active [data-anim] {
        animation-play-state: running;
      }

      .bar-fill {
        transform: scaleX(0);
        transform-origin: left center;
      }

      .path-draw path {
        stroke-dasharray: 120;
        stroke-dashoffset: 120;
      }

      .notes {
        display: none;
      }
    </style>
  </head>
  <body>
    <div class="deck">
      <section class="slide is-active" data-slide-id="slide-1" id="slide-1" data-title="Cover">
        <main>
          <p class="eyebrow" data-node-id="cover-kicker" data-edit-kind="text" data-anim="fade-up">Opening</p>
          <h1 data-node-id="cover-title" data-edit-kind="text" data-anim="rise-in">Launch story</h1>
        </main>
        <div class="notes">Cover notes</div>
      </section>
      <section class="slide" data-slide-id="slide-2" id="slide-2" data-title="Metrics">
        <main>
          <h2 data-node-id="metrics-title" data-edit-kind="text">Pilot results</h2>
          <div class="metric-value"><span class="counter" data-to="61">0</span>%</div>
          <div class="bar-track"><div class="bar-fill" style="width: 80%;"></div></div>
          <svg class="path-draw" viewBox="0 0 120 10"><path d="M0 5 H120"></path></svg>
        </main>
        <div class="notes">Metrics notes</div>
      </section>
    </div>
    <div class="progress-bar"><span style="width: 50%;"></span></div>
    <nav class="nav-dots" aria-label="Slides">
      <button class="nav-dot active" data-slide-id="slide-1"></button>
      <button class="nav-dot" data-slide-id="slide-2"></button>
    </nav>
    <div class="notes-overlay open" id="notesOverlay"></div>
    <div class="overview-overlay open" id="overviewOverlay"></div>
    <script>window.deckRuntimeLoaded = true;</script>
  </body>
</html>`

const longGeneratedSlideTitle =
  'Generated strategy narrativeX slide with an unusually long heading for sidebar overflow testing'

function createGeneratedOverflowDeck(): string {
  const slides = Array.from({ length: 28 }, (_, index) => {
    const slideNumber = index + 1
    const title =
      index === 0
        ? longGeneratedSlideTitle
        : `Generated appendix slide ${slideNumber} with a verbose sidebar heading`

    return `
      <section class="slide${index === 0 ? ' is-active' : ''}" data-slide-id="slide-${slideNumber}" id="slide-${slideNumber}" data-title="${title}">
        <main>
          <h2 data-node-id="slide-${slideNumber}-title" data-edit-kind="text">Signal layer</h2>
          <p data-node-id="slide-${slideNumber}-body" data-edit-kind="text">Generated deck body copy ${slideNumber}</p>
        </main>
      </section>`
  }).join('')

  return `<!doctype html>
<html lang="en" data-fs-editable-deck="1" data-fs-deck-profile="html-ppt">
  <head>
    <meta charset="UTF-8" />
    <style>
      .slide { width: 1280px; height: 720px; }
      .slide:not(.is-active) { display: none; }
    </style>
  </head>
  <body>
    <div class="deck">
      ${slides}
    </div>
  </body>
</html>`
}

function createHtmlCandidateDeck(slideCount: number): string {
  const slides = Array.from({ length: slideCount }, (_, index) => {
    const slideNumber = index + 1
    return `
      <section class="slide${index === 0 ? ' is-active' : ''}" data-slide-id="candidate-slide-${slideNumber}" id="candidate-slide-${slideNumber}" data-title="Candidate page ${slideNumber}">
        <main>
          <h1>Candidate page ${slideNumber}</h1>
          <p>Generated candidate body ${slideNumber}</p>
        </main>
      </section>`
  }).join('')

  return `<!doctype html>
<html lang="en" data-fs-editable-deck="1" data-fs-deck-profile="html-ppt">
  <head>
    <meta charset="UTF-8" />
    <style>
      .slide { width: 1280px; height: 720px; }
      .slide:not(.is-active) { display: none; }
    </style>
  </head>
  <body>
    <div class="deck">
      ${slides}
    </div>
  </body>
</html>`
}

function createHtmlCandidateDeckWithoutSlideIds(slideCount: number): string {
  const slides = Array.from({ length: slideCount }, (_, index) => {
    const slideNumber = index + 1
    return `
      <section class="slide${index === 0 ? ' is-active' : ''}" data-title="Candidate page ${slideNumber}">
        <main>
          <h1>Candidate page ${slideNumber}</h1>
          <p>Generated candidate body ${slideNumber}</p>
        </main>
      </section>`
  }).join('')

  return `<!doctype html>
<html lang="en" data-fs-editable-deck="1" data-fs-deck-profile="html-ppt">
  <head>
    <meta charset="UTF-8" />
    <style>
      .slide { width: 1280px; height: 720px; }
      .slide:not(.is-active) { display: none; }
    </style>
  </head>
  <body>
    <div class="deck">
      ${slides}
    </div>
  </body>
</html>`
}

afterEach(() => {
  vi.restoreAllMocks()
  if (typeof window.localStorage?.clear === 'function') {
    window.localStorage.clear()
  }
  if (typeof window.sessionStorage?.clear === 'function') {
    window.sessionStorage.clear()
  }
})

function getPreviewIframe(): HTMLIFrameElement {
  return screen.getByTestId('slide-preview-iframe') as HTMLIFrameElement
}

function getPreviewSrcDoc(): string {
  return getPreviewIframe().getAttribute('srcdoc') ?? ''
}

function parsePreviewSrcDoc(): Document {
  return new DOMParser().parseFromString(getPreviewSrcDoc(), 'text/html')
}

describe('App', () => {
  it('calculates a scale factor that fits the browser viewport into the preview area', () => {
    expect(
      calculatePreviewScale({
        frameWidth: 640,
        frameHeight: 360,
        viewportWidth: 1280,
        viewportHeight: 720,
      }),
    ).toBe(0.5)
  })

  it('renders a complete browser-sized runtime viewport in adaptive mode', () => {
    const originalInnerWidth = window.innerWidth
    const originalInnerHeight = window.innerHeight

    try {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: 390,
      })
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        writable: true,
        value: 844,
      })

      render(<App initialDeckHtml={sampleDeck} />)

      const iframe = getPreviewIframe()
      expect(iframe.getAttribute('style')).toContain('width: 1280px')
      expect(iframe.getAttribute('style')).toContain('height: 720px')
      expect(iframe.getAttribute('style')).toContain('transform: scale(1)')
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: originalInnerWidth,
      })
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        writable: true,
        value: originalInnerHeight,
      })
    }
  })

  it('switches to native mode with an unscaled scrollable browser viewport', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={sampleDeck} />)

    const fitModeToggle = screen.getByRole('group', { name: '画布缩放模式' })
    await user.click(within(fitModeToggle).getByRole('button', { name: '原尺寸' }))

    const preview = screen.getByTestId('slide-preview')
    const frame = preview.querySelector('.slide-preview-frame')
    const viewport = preview.querySelector('.slide-preview-viewport')
    const iframe = getPreviewIframe()

    expect(frame?.getAttribute('data-fit-mode')).toBe('native')
    expect(viewport?.getAttribute('style')).toContain('overflow: auto')
    expect(iframe.getAttribute('style')).toContain('width: 1280px')
    expect(iframe.getAttribute('style')).toContain('height: 720px')
    expect(iframe.getAttribute('style')).not.toContain('transform: scale')
  })

  it('keeps adaptive preview sized to the declared canvas after oversized runtime measurements', async () => {
    render(<App initialDeckHtml={sampleDeck} />)

    const iframe = getPreviewIframe()

    fireEvent(
      window,
      new MessageEvent('message', {
        data: {
          source: 'html-slide-editor-preview',
          type: 'content-size',
          slideId: 'slide-1',
          width: 5269,
          height: 837,
        },
        source: iframe.contentWindow,
      }),
    )

    await waitFor(() => {
      expect(iframe.getAttribute('style')).toContain('width: 1280px')
      expect(iframe.getAttribute('style')).toContain('height: 720px')
      expect(screen.getByText(/画布 1280×720 · 适配/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/5269×837/)).toBeNull()
  })

  it('defaults to an html-ppt starter deck when no initial html or saved deck is available', () => {
    render(<App />)

    expect(getPreviewSrcDoc()).toContain('data-title="Blank"')
    expect(getPreviewSrcDoc()).not.toContain('开始输入你的内容')
    expect(screen.getByTitle('Blank')).toBeInTheDocument()
  })

  it('ignores legacy saved decks from browser storage on startup', () => {
    window.localStorage.setItem('html-slide-editor:last-deck', sampleDeck)

    render(<App />)

    expect(getPreviewSrcDoc()).toContain('data-title="Blank"')
    expect(getPreviewSrcDoc()).not.toContain('你好，世界')
  })

  it('renders the slide list and current preview from the initial deck', () => {
    render(<App initialDeckHtml={sampleDeck} />)

    expect(screen.getByTitle(/第 1 页/i)).toBeInTheDocument()
    expect(screen.getByTitle(/第 2 页/i)).toBeInTheDocument()
    expect(screen.getByText('智能体演示编辑')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '文稿生成器' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
    expect(screen.queryByRole('button', { name: /撤销/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /重做/i })).toBeNull()
    expect(screen.getByRole('tab', { name: '智能体' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '智能体' })).toBeNull()
    expect(getPreviewSrcDoc()).toContain('你好，世界')
    expect(screen.getByTestId('slide-preview').querySelector('.slide-preview-viewport')).not.toBeNull()
  })

  it('does not render page or node comment controls', () => {
    render(<App initialDeckHtml={sampleDeck} />)

    expect(screen.queryByRole('region', { name: '评论和审阅' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: '评论内容' })).toBeNull()
    expect(screen.queryByRole('button', { name: '添加页评论' })).toBeNull()
    expect(screen.queryByRole('button', { name: '添加节点评论' })).toBeNull()
  })

  it('does not render the asset library controls', () => {
    render(<App initialDeckHtml={sampleDeck} />)

    expect(screen.queryByRole('region', { name: '资产库' })).toBeNull()
    expect(screen.queryByLabelText(/资产名称/)).toBeNull()
    expect(screen.queryByRole('button', { name: '替换当前图' })).toBeNull()
  })

  it('does not render local AI edit controls', () => {
    render(<App initialDeckHtml={sampleDeck} />)

    expect(screen.queryByRole('region', { name: 'AI 局部编辑' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: '局部编辑指令' })).toBeNull()
    expect(screen.queryByRole('button', { name: '预览局部编辑' })).toBeNull()
  })

  it('keeps pages and inspector in the same left panel instead of opening a canvas drawer', async () => {
    const user = userEvent.setup()
    const { container } = render(<App initialDeckHtml={sampleDeck} />)

    expect(container.querySelector('.workspace.is-left-panel-wide')).not.toBeNull()
    expect(container.querySelector('.left-panel-scroll.is-left-panel-scroll')).not.toBeNull()
    expect(screen.getByRole('tab', { name: '页面' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '编辑' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '智能体' })).toBeInTheDocument()
    expect(screen.getByTitle(/第 1 页/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '对象列表' })).toBeNull()
    expect(screen.queryByRole('button', { name: '编辑面板' })).toBeNull()

    await user.click(screen.getByRole('tab', { name: '编辑' }))

    expect(screen.getByRole('tab', { name: '编辑' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: '对象列表' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /text-hero/i })).toBeInTheDocument()
    expect(container.querySelector('.workspace.is-left-panel-wide')).not.toBeNull()
    expect(container.querySelector('.left-panel-scroll.is-left-panel-scroll')).not.toBeNull()
    expect(container.querySelector('.inspector-drawer-backdrop')).toBeNull()
    expect(container.querySelector('.inspector-panel.is-open')).toBeNull()
  })

  it('embeds the intelligent agent as the third left-panel tab', async () => {
    const user = userEvent.setup()
    const { container } = render(<App initialDeckHtml={sampleDeck} />)

    expect(screen.getByRole('tab', { name: '智能体' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByRole('heading', { name: '智能体' })).toBeNull()
    expect(container.querySelector('.agent-rail')).toBeNull()
    expect(container.querySelector('.agent-drawer-backdrop')).toBeNull()

    await user.click(screen.getByRole('tab', { name: '智能体' }))

    expect(screen.getByRole('tab', { name: '智能体' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: '智能体' })).toBeInTheDocument()
    expect(screen.getByLabelText(/给智能体的需求/i)).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '摘要' })).toBeNull()
    expect(screen.getByRole('tab', { name: '对话记录' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '候选' })).toBeInTheDocument()
    expect(container.querySelector('.workspace.is-left-panel-wide')).not.toBeNull()
    expect(container.querySelector('.left-panel-scroll.is-left-panel-scroll')).not.toBeNull()
    expect(screen.queryByText(/^A$/)).toBeNull()
  })

  it('renders a full runtime iframe and marks the active slide visible without static capture flags', () => {
    render(<App initialDeckHtml={revealDeck} />)

    const previewDocument = parsePreviewSrcDoc()
    const slide = previewDocument.querySelector('.slide')

    expect(slide).not.toBeNull()
    expect(slide?.classList.contains('visible')).toBe(true)
    expect(slide?.getAttribute('data-preview-static')).toBeNull()
    expect(getPreviewIframe()).toHaveAttribute('title', '当前演示预览')
  })

  it('keeps imported global CSS inside the iframe srcDoc instead of rewriting it for the app shell', () => {
    render(<App initialDeckHtml={importedGlobalStyleDeck} />)

    const srcDoc = getPreviewSrcDoc()

    expect(srcDoc).toContain('body {')
    expect(srcDoc).toContain('html,')
    expect(srcDoc).toContain('导入稿件')
    expect(srcDoc).not.toContain('.slide-preview-stage')
  })

  it('preserves class selectors like .body without preview CSS scoping', () => {
    render(<App initialDeckHtml={importedBodyClassDeck} />)

    const srcDoc = getPreviewSrcDoc()

    expect(srcDoc).toContain('body::before')
    expect(srcDoc).toContain('.body')
    expect(srcDoc).not.toContain('..slide-preview-stage')
  })

  it('uses html-ppt slide titles in the page list and activates the selected slide in preview', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={htmlPptDeck} />)

    expect(screen.getByTitle('Cover')).toBeInTheDocument()
    expect(screen.getByTitle('Metrics')).toBeInTheDocument()

    await user.click(screen.getByTitle('Metrics'))

    const previewDocument = parsePreviewSrcDoc()
    const firstSlide = previewDocument.querySelector('[data-slide-id="slide-1"]')
    const secondSlide = previewDocument.querySelector('[data-slide-id="slide-2"]')
    const previewStyle = previewDocument.querySelector('style[data-html-slide-editor-preview]')

    expect(getPreviewSrcDoc()).toContain('Pilot results')
    expect(firstSlide?.classList.contains('is-active')).toBe(false)
    expect(secondSlide?.classList.contains('is-active')).toBe(true)
    expect(previewDocument.querySelector('.slide.is-active')).not.toBeNull()
    expect(previewDocument.querySelector('.slide.is-active')?.getAttribute('data-title')).toBe('Metrics')
    expect(previewStyle?.textContent).toContain('section.slide:not(.is-active)')
    expect(previewStyle?.textContent).toContain('display: none !important')
    expect(previewDocument.querySelector('.progress-bar span')?.getAttribute('style')).toContain('width: 100%')
    expect(previewDocument.querySelector('.nav-dot.active')?.getAttribute('data-slide-id')).toBe('slide-2')
  })

  it('injects a preview bridge that reasserts the selected slide after runtime startup scripts', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={htmlPptDeck} />)

    await user.click(screen.getByTitle('Metrics'))

    const previewDocument = parsePreviewSrcDoc()
    const bridgeScript = previewDocument.querySelector('script[data-html-slide-editor-preview-bridge]')

    expect(bridgeScript?.textContent).toContain('setActiveSlide(initialSlideId)')
    expect(bridgeScript?.textContent).toContain('window.setTimeout(() => setActiveSlide(initialSlideId), 40)')
    expect(bridgeScript?.textContent).toContain('window.setTimeout(() => setActiveSlide(initialSlideId), 160)')
  })

  it('keeps generated deck sidebar labels compact while preserving full slide titles', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={createGeneratedOverflowDeck()} />)

    const activePageButton = screen.getByTitle(longGeneratedSlideTitle)

    expect(activePageButton).toHaveAttribute('title', longGeneratedSlideTitle)
    expect(screen.getAllByRole('button', { name: /^\d+$/ })).toHaveLength(28)
    await openInspectorPanel(user)
    expect(screen.getByRole('heading', { name: '对象列表' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '标题：Signal layer' })).toBeInTheDocument()
  })

  it('presents html-ppt editing as a simplified WPS-style inspector without source tools', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={htmlPptDeck} />)

    await user.click(screen.getByTitle('Cover'))
    await openInspectorPanel(user)

    expect(screen.queryByText('兼容模式')).toBeNull()
    expect(screen.queryByText('html-ppt 结构化编辑')).toBeNull()
    expect(screen.queryByText('默认遵循模板结构编辑文案、讲者备注、主题与动效；画布保留原始 HTML runtime 预览。')).toBeNull()
    expect(screen.queryByText('节点选择')).toBeNull()
    expect(screen.queryByText('源码')).toBeNull()
    expect(screen.queryByRole('button', { name: '替换当前页' })).toBeNull()
    expect(screen.queryByRole('button', { name: '运行修复' })).toBeNull()
    expect(screen.getByText('对象列表')).toBeInTheDocument()
    expect(screen.queryByText('主题与版式')).toBeNull()
    expect(screen.queryByLabelText(/主题 token/i)).toBeNull()
  })

  it('shows semantic labels for html-ppt nodes instead of raw node ids', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={htmlPptDeck} />)

    await openInspectorPanel(user)

    expect(screen.getByRole('button', { name: '标签：Opening' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '标题：Launch story' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'cover-kicker' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'cover-title' })).toBeNull()
  })

  it('preserves html-ppt runtime elements, controls, and scripts in the iframe preview', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={htmlPptDeck} />)

    await user.click(screen.getByTitle('Metrics'))

    const previewDocument = parsePreviewSrcDoc()
    expect(previewDocument.querySelector('.counter')?.textContent).toBe('0')
    expect(previewDocument.querySelector('.bar-fill')?.getAttribute('style')).toContain('width: 80%;')
    expect(previewDocument.querySelector('.notes-overlay')).not.toBeNull()
    expect(previewDocument.querySelector('.overview-overlay')).not.toBeNull()
    expect(getPreviewSrcDoc()).toContain('window.deckRuntimeLoaded = true')
  })

  it('does not delete html-ppt template text nodes with the Delete key', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={htmlPptDeck} />)

    await openInspectorPanel(user)
    await user.click(screen.getByRole('button', { name: '标题：Launch story' }))

    fireEvent.keyDown(window, { key: 'Delete' })

    expect(getPreviewSrcDoc()).toContain('Launch story')
    expect(screen.getByRole('button', { name: '标题：Launch story' })).toBeInTheDocument()
  })

  it('edits a selected text node without exposing undo and redo toolbar buttons', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={sampleDeck} />)

    await openInspectorPanel(user)
    await user.click(screen.getByRole('button', { name: /text-hero/i }))

    const textEditor = screen.getByLabelText(/文本内容/i)
    await user.clear(textEditor)
    await user.type(textEditor, '更新后的演示文案')
    fireEvent.blur(textEditor)

    expect(getPreviewSrcDoc()).toContain('更新后的演示文案')
    expect(screen.queryByRole('button', { name: /撤销/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /重做/i })).toBeNull()
  })

  it('edits component slot content and switches slides', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={sampleDeck} />)

    await openInspectorPanel(user)
    await user.click(screen.getByRole('button', { name: /card-1/i }))
    await user.clear(screen.getByLabelText(/插槽 title/i))
    await user.type(screen.getByLabelText(/插槽 title/i), '更新后的回顾')

    expect(getPreviewSrcDoc()).toContain('更新后的回顾')

    await user.click(screen.getByRole('tab', { name: '页面' }))
    await user.click(screen.getByTitle(/第 2 页/i))
    expect(getPreviewSrcDoc()).toContain('第二页')
  })

  it('adds an image block to the current deck', async () => {
    const user = userEvent.setup()
    mockImageDimensions({ width: 1200, height: 1200 })
    render(<App initialDeckHtml={sampleDeck} />)

    const imageFile = new File(['image-bytes'], 'demo.png', { type: 'image/png' })

    await user.click(screen.getByRole('button', { name: /插入图片块/i }))
    await user.upload(screen.getByTestId('image-upload-input'), imageFile)

    await waitFor(() => {
      expect(getPreviewSrcDoc()).toContain('alt="demo"')
    })

    expect(getPreviewSrcDoc()).toContain('data-fs-editable-deck="1"')
  })

  it('selects an inserted image and exposes direct canvas controls', async () => {
    const user = userEvent.setup()
    mockImageDimensions({ width: 1200, height: 1200 })
    render(<App initialDeckHtml={sampleDeck} />)

    await user.click(screen.getByRole('button', { name: /插入图片块/i }))
    await user.upload(
      screen.getByTestId('image-upload-input'),
      new File(['square-image'], 'square.png', { type: 'image/png' }),
    )

    expect(await screen.findByTestId('selected-image-controls')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '编辑' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'image-3' })).toBeInTheDocument()
  })

  it('inserts uploaded images with a bounded layout that matches the image aspect ratio', async () => {
    const user = userEvent.setup()
    mockImageDimensions({ width: 1200, height: 1200 })
    render(<App initialDeckHtml={sampleDeck} />)

    const imageFile = new File(['square-image'], 'square.png', { type: 'image/png' })
    await user.click(screen.getByRole('button', { name: /插入图片块/i }))
    await user.upload(screen.getByTestId('image-upload-input'), imageFile)
    await waitFor(() => {
      expect(getPreviewSrcDoc()).toContain('data-editor-object="true"')
      expect(getPreviewSrcDoc()).toContain('data-editor-width="396"')
      expect(getPreviewSrcDoc()).toContain('data-editor-height="396"')
    })
  })

  it('does not expose direct contenteditable editing inside the runtime iframe preview', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={sampleDeck} />)

    await user.dblClick(getPreviewIframe())

    expect(getPreviewSrcDoc()).toContain('你好，世界')
    expect(getPreviewSrcDoc()).not.toContain('contenteditable')
    expect(screen.queryByLabelText(/HTML 内容/i)).toBeNull()
  })

  it('selects editable nodes from the runtime preview bridge', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={htmlPptDeck} />)

    await openInspectorPanel(user)

    const iframe = getPreviewIframe()
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        source: 'html-slide-editor-preview',
        type: 'select-node',
        nodeId: 'cover-title',
      },
      source: iframe.contentWindow,
    }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '标题：Launch story' })).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/文本内容/i)).toBeInTheDocument()
  })

  it('shows a text style toolbar and persists block styles for the selected text node', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={sampleDeck} />)

    await openInspectorPanel(user)
    await user.click(screen.getByRole('button', { name: /text-hero/i }))

    await user.selectOptions(screen.getByRole('combobox', { name: '字号' }), '48px')

    await user.selectOptions(screen.getByRole('combobox', { name: '字体' }), 'Satoshi')

    await user.selectOptions(screen.getByLabelText(/文字颜色/i), '#d95d39')

    await user.click(screen.getByRole('button', { name: /加粗/i }))
    await user.click(screen.getByRole('button', { name: /斜体/i }))
    await user.click(screen.getByRole('button', { name: /下划线/i }))
    await user.click(screen.getByRole('button', { name: /居中对齐/i }))

    await user.selectOptions(screen.getByLabelText(/行高/i), '1.4')

    await user.selectOptions(screen.getByLabelText(/字距/i), '0.08em')

    expect(getPreviewSrcDoc()).toContain('font-size: 48px;')
    expect(getPreviewSrcDoc()).toContain('font-family: Satoshi;')
    expect(getPreviewSrcDoc()).toContain('color: #d95d39;')
    expect(getPreviewSrcDoc()).toContain('font-weight: 700;')
    expect(getPreviewSrcDoc()).toContain('font-style: italic;')
    expect(getPreviewSrcDoc()).toContain('text-decoration: underline;')
    expect(getPreviewSrcDoc()).toContain('text-align: center;')
    expect(getPreviewSrcDoc()).toContain('line-height: 1.4;')
    expect(getPreviewSrcDoc()).toContain('letter-spacing: 0.08em;')
  })

  it('keeps paragraph text node information readable after rich text edits', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={paragraphTextDeck} />)

    await openInspectorPanel(user)
    await user.click(screen.getByRole('button', { name: '文本：段落原文' }))

    const textEditor = screen.getByLabelText(/文本内容/i)
    await user.clear(textEditor)
    await user.type(textEditor, '更新后的正文')
    fireEvent.blur(textEditor)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '文本：更新后的正文' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: '文本：更新后的正文' })).toBeInTheDocument()
    expect(parsePreviewSrcDoc().querySelector('[data-node-id="body-copy"]')?.textContent).toBe('更新后的正文')
  })

  it('shows text formatting inside the current object inspector instead of a separate panel', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={sampleDeck} />)

    await openInspectorPanel(user)
    await user.click(screen.getByRole('button', { name: /text-hero/i }))

    expect(screen.queryByText(/^文本格式$/)).toBeNull()
    expect(screen.getByText('文字样式')).toBeInTheDocument()
    expect(screen.getByLabelText(/字体/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('常用文本格式')).toBeNull()
    expect(screen.queryByRole('button', { name: 'B' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'I' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'U' })).toBeNull()
  })

  it('edits component slot content through the inspector without canvas editing hooks', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={sampleDeck} />)

    await openInspectorPanel(user)
    await user.click(screen.getByRole('button', { name: /card-1/i }))
    await user.clear(screen.getByLabelText(/插槽 title/i))
    await user.type(screen.getByLabelText(/插槽 title/i), '检查面板组件标题')

    expect(getPreviewSrcDoc()).toContain('检查面板组件标题')
    expect(getPreviewSrcDoc()).toContain('data-node-id="card-1"')
    expect(getPreviewSrcDoc()).not.toContain('contenteditable')
  })

  it('replaces a selected image from a local file instead of manual url input', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={sampleDeck} />)

    await user.click(screen.getByTitle(/第 2 页/i))
    await openInspectorPanel(user)
    await user.click(screen.getByRole('button', { name: /image-2/i }))

    const replacement = new File(['next-image'], 'cover.png', { type: 'image/png' })
    await user.click(screen.getByRole('button', { name: /替换图片/i }))
    await user.upload(screen.getByTestId('image-upload-input'), replacement)

    await waitFor(() => {
      expect(getPreviewSrcDoc()).toContain('alt="cover"')
      expect(getPreviewSrcDoc()).toContain('data:image/png;base64')
    })
  })

  it('edits inserted image geometry and layer controls from the inspector', async () => {
    const user = userEvent.setup()
    mockImageDimensions({ width: 1200, height: 1200 })
    render(<App initialDeckHtml={sampleDeck} />)

    await user.click(screen.getByRole('button', { name: /插入图片块/i }))
    await user.upload(
      screen.getByTestId('image-upload-input'),
      new File(['square-image'], 'square.png', { type: 'image/png' }),
    )

    const objectXInput = await screen.findByLabelText('对象 X')
    fireEvent.change(objectXInput, { target: { value: '180' } })
    fireEvent.blur(objectXInput)

    const objectWidthInput = screen.getByLabelText('对象宽度')
    fireEvent.change(objectWidthInput, { target: { value: '420' } })
    fireEvent.blur(objectWidthInput)
    await user.click(screen.getByRole('button', { name: /置于顶层/i }))
    await waitFor(() => {
      const previewDocument = parsePreviewSrcDoc()
      expect(getPreviewSrcDoc()).toContain('data-editor-x="180"')
      expect(getPreviewSrcDoc()).toContain('data-editor-width="420"')
      expect(getPreviewSrcDoc()).toContain('data-editor-z="')
      expect(getPreviewSrcDoc()).toContain('z-index:')
      expect(previewDocument.querySelector<HTMLElement>('[data-node-id="text-hero"]')?.dataset.editorZ).toBe('1')
      expect(previewDocument.querySelector<HTMLElement>('[data-node-id="card-1"]')?.dataset.editorZ).toBe('2')
      expect(previewDocument.querySelector<HTMLElement>('[data-node-id="image-3"]')?.dataset.editorZ).toBe('3')
    })
  })

  it('drags the selected inserted image directly on the canvas and updates the current position', async () => {
    const user = userEvent.setup()
    mockImageDimensions({ width: 1200, height: 1200 })
    render(<App initialDeckHtml={sampleDeck} />)

    await user.click(screen.getByRole('button', { name: /插入图片块/i }))
    await user.upload(
      screen.getByTestId('image-upload-input'),
      new File(['square-image'], 'square.png', { type: 'image/png' }),
    )

    const dragSurface = await screen.findByTestId('selected-image-drag-surface')
    fireEvent.pointerDown(dragSurface, { pointerId: 1, clientX: 640, clientY: 360 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 700, clientY: 400 })
    fireEvent.pointerUp(window, { pointerId: 1 })
    expect(getPreviewSrcDoc()).toContain('data-editor-x="502"')
    expect(getPreviewSrcDoc()).toContain('data-editor-y="202"')
  })

  it('resizes the selected inserted image from a corner handle while preserving aspect ratio', async () => {
    const user = userEvent.setup()
    mockImageDimensions({ width: 1200, height: 1200 })
    render(<App initialDeckHtml={sampleDeck} />)

    await user.click(screen.getByRole('button', { name: /插入图片块/i }))
    await user.upload(
      screen.getByTestId('image-upload-input'),
      new File(['square-image'], 'square.png', { type: 'image/png' }),
    )

    const resizeHandle = await screen.findByTestId('selected-image-resize-se')
    fireEvent.pointerDown(resizeHandle, { pointerId: 1, clientX: 838, clientY: 558 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 898, clientY: 628 })
    fireEvent.pointerUp(window, { pointerId: 1 })
    expect(getPreviewSrcDoc()).toContain('data-editor-width="466"')
    expect(getPreviewSrcDoc()).toContain('data-editor-height="466"')

    expect(screen.queryByRole('button', { name: /撤销/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /重做/i })).toBeNull()
  })

  it('deletes the selected image element from the node list with the Delete key', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={sampleDeck} />)

    await user.click(screen.getByTitle(/第 2 页/i))
    await openInspectorPanel(user)
    await user.click(screen.getByRole('button', { name: /image-2/i }))

    fireEvent.keyDown(window, { key: 'Delete' })

    expect(getPreviewSrcDoc()).not.toContain('抽象封面示意图')
    expect(screen.queryByRole('button', { name: /image-2/i })).toBeNull()
  })

  it('streams an AI candidate and applies it only after explicit confirmation', async () => {
    const user = userEvent.setup()
    mockAgentFetch({
      events: [
        { type: 'assistant_delta', text: '正在分析当前 deck…' },
        { type: 'assistant_done', text: '我整理出一个更聚焦的首屏。' },
        {
          type: 'candidate_ready',
          candidateId: 'candidate-1',
          summary: '把首页改成发布节奏',
          slideMeta: [{ slideId: 'slide-1', title: '发布节奏', nodeCount: 3 }],
          deckDraft: {
            title: 'Candidate deck',
            theme: {
              accent: '#d95d39',
              background: '#f6efe6',
              text: '#201715',
              muted: '#715f59',
            },
            slides: [
              {
                template: 'title-body',
                title: '发布节奏',
                eyebrow: 'AI 草稿',
                body: ['三步完成对外发布。'],
              },
            ],
          },
          compiledHtml: compileDeckDraftToHtml({
            title: 'Candidate deck',
            theme: {
              accent: '#d95d39',
              background: '#f6efe6',
              text: '#201715',
              muted: '#715f59',
            },
            slides: [
              {
                template: 'title-body',
                title: '发布节奏',
                eyebrow: 'AI 草稿',
                body: ['三步完成对外发布。'],
              },
            ],
          }),
          sources: [],
          runMeta: {
            skillId: 'html_ppt',
            model: 'mock:MiniMax-M2.7',
            usedWebSearch: false,
            searchMode: 'off',
          },
        },
        { type: 'done' },
      ],
    })

    render(<App initialDeckHtml={sampleDeck} />)

    expect(screen.getByRole('tab', { name: '智能体' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '智能体' })).toBeNull()

    await openAgentDrawer(user)

    await user.type(screen.getByLabelText(/给智能体的需求/i), '把首页改成发布计划')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    const transcriptScroll = await openAgentTranscript(user)
    expect(transcriptScroll).toHaveTextContent('我整理出一个更聚焦的首屏。')
    await user.click(screen.getByRole('tab', { name: /候选/i }))
    expect(screen.getAllByText('把首页改成发布节奏').length).toBeGreaterThan(0)
    expect(getPreviewSrcDoc()).toContain('你好，世界')

    await user.click(screen.getByRole('button', { name: /应用草稿/i }))

    expect(getPreviewSrcDoc()).toContain('发布节奏')

    expect(screen.queryByRole('button', { name: /撤销/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /重做/i })).toBeNull()
  })

  it('shows immediate visible progress for html_ppt even before assistant text arrives', async () => {
    const user = userEvent.setup()
    const encoder = new TextEncoder()
    let releaseResponse: () => void = () => {
      throw new Error('Expected releaseResponse to be assigned')
    }

    vi.spyOn(window, 'fetch').mockImplementation(async (input, _init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url.endsWith('/api/agent/skills')) {
        return new Response(JSON.stringify({
          skills: [
            {
              id: 'html_ppt',
              label: 'HTML PPT',
              description: '原生 html-ppt HTML agent 工作流。',
              searchMode: 'off',
              workflow: 'html_agent',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (!url.endsWith('/api/ai/turns')) {
        throw new Error(`Unexpected fetch request: ${url}`)
      }

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ type: 'status', phase: 'drafting', label: '正在分析需求' })}\n`),
          )
          releaseResponse = () => {
            controller.enqueue(
              encoder.encode(`${JSON.stringify({ type: 'assistant_done', text: '我先收集演示背景。' })}\n`),
            )
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'done' })}\n`))
            controller.close()
          }
        },
      })

      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'application/x-ndjson',
        },
      })
    })

    const { container } = render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '生成一份近代艺术史简报')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    const stageHeader = container.querySelector('.stage-header')
    expect(stageHeader).not.toBeNull()

    await waitFor(() => {
      expect(stageHeader).toHaveTextContent(/已向智能体发送当前 deck 与需求|正在分析需求/)
    })
    expect(screen.getByTestId('agent-progress-overlay')).toHaveTextContent('正在分析需求')

    releaseResponse()

    expect(await screen.findByText('我先收集演示背景。')).toBeInTheDocument()
  })

  it('streams assistant progress into the canvas progress overlay', async () => {
    const user = userEvent.setup()
    const encoder = new TextEncoder()
    let releaseResponse: () => void = () => {
      throw new Error('Expected releaseResponse to be assigned')
    }

    vi.spyOn(window, 'fetch').mockImplementation(async (input, _init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (!url.endsWith('/api/ai/turns')) {
        throw new Error(`Unexpected fetch request: ${url}`)
      }

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ type: 'status', phase: 'drafting', label: '正在分析需求' })}\n`),
          )
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ type: 'assistant_delta', text: '先梳理结构' })}\n`),
          )
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ type: 'assistant_delta', text: '，再生成候选。' })}\n`),
          )
          releaseResponse = () => {
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'done' })}\n`))
            controller.close()
          }
        },
      })

      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'application/x-ndjson',
        },
      })
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '生成一份近代艺术史简报')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    const overlay = await screen.findByTestId('agent-progress-overlay')
    expect(overlay).toHaveTextContent('正在分析需求')
    expect(overlay).toHaveTextContent('先梳理结构，再生成候选。')

    releaseResponse()
  })

  it('switches to the embedded intelligent agent tab while generation is running', async () => {
    const user = userEvent.setup()
    const encoder = new TextEncoder()
    let releaseResponse: () => void = () => {
      throw new Error('Expected releaseResponse to be assigned')
    }

    vi.spyOn(window, 'fetch').mockImplementation(async (input, _init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (!url.endsWith('/api/ai/turns')) {
        throw new Error(`Unexpected fetch request: ${url}`)
      }

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ type: 'status', phase: 'drafting', label: '正在分析需求' })}\n`),
          )
          releaseResponse = () => {
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'done' })}\n`))
            controller.close()
          }
        },
      })

      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'application/x-ndjson',
        },
      })
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await user.click(screen.getByRole('tab', { name: '智能体' }))
    await user.type(screen.getByLabelText(/给智能体的需求/i), '生成一份近代艺术史简报')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    expect(screen.getByRole('tab', { name: '智能体' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByTestId('agent-transcript-scroll')).toHaveTextContent('正在分析需求')

    releaseResponse()
  })

  it('reuses the same assistant transcript entry when html_ppt resolves after status-only waiting', async () => {
    const user = userEvent.setup()
    const encoder = new TextEncoder()
    let releaseResponse: () => void = () => {
      throw new Error('Expected releaseResponse to be assigned')
    }

    vi.spyOn(window, 'fetch').mockImplementation(async (input, _init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url.endsWith('/api/agent/skills')) {
        return new Response(JSON.stringify({
          skills: [
            {
              id: 'html_ppt',
              label: 'HTML PPT',
              description: '原生 html-ppt HTML agent 工作流。',
              searchMode: 'off',
              workflow: 'html_agent',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (!url.endsWith('/api/ai/turns')) {
        throw new Error(`Unexpected fetch request: ${url}`)
      }

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ type: 'status', phase: 'drafting', label: '正在分析需求' })}\n`),
          )
          releaseResponse = () => {
            controller.enqueue(
              encoder.encode(`${JSON.stringify({ type: 'assistant_done', text: '我先收集演示背景。' })}\n`),
            )
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'done' })}\n`))
            controller.close()
          }
        },
      })

      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'application/x-ndjson',
        },
      })
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '生成一份近代艺术史简报')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    const transcriptScroll = await openAgentTranscript(user)
    expect(transcriptScroll).toHaveTextContent('正在分析需求')

    releaseResponse()

    expect(await screen.findByText('我先收集演示背景。')).toBeInTheDocument()
    expect(within(transcriptScroll).queryByText('正在分析需求')).toBeNull()
  })

  it('preserves multiple assistant messages in the transcript and restores them after remount', async () => {
    const user = userEvent.setup()
    mockAgentFetch({
      events: [
        { type: 'assistant_done', text: '第一段结论。' },
        { type: 'assistant_done', text: '第二段补充。' },
        { type: 'done' },
      ],
    })

    const firstRender = render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '生成一份近代艺术史简报')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    const transcriptScroll = await openAgentTranscript(user)
    expect(transcriptScroll).toHaveTextContent('第一段结论。')
    expect(transcriptScroll).toHaveTextContent('第二段补充。')

    firstRender.unmount()

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    const restoredTranscript = await openAgentTranscript(user)
    expect(restoredTranscript).toHaveTextContent('第一段结论。')
    expect(restoredTranscript).toHaveTextContent('第二段补充。')
  })

  it('replaces stale progress status when a streamed error event arrives', async () => {
    const user = userEvent.setup()

    vi.spyOn(window, 'fetch').mockImplementation(async (input, _init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url.endsWith('/api/agent/skills')) {
        return new Response(JSON.stringify({
          skills: [
            {
              id: 'html_ppt',
              label: 'HTML PPT',
              description: '原生 html-ppt HTML agent 工作流。',
              searchMode: 'off',
              workflow: 'html_agent',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (!url.endsWith('/api/ai/turns')) {
        throw new Error(`Unexpected fetch request: ${url}`)
      }

      return new Response(
        [
          JSON.stringify({ type: 'status', phase: 'drafting', label: '正在分析需求' }),
          JSON.stringify({ type: 'error', message: 'AI 服务暂时不可用' }),
          JSON.stringify({ type: 'done' }),
        ].join('\n') + '\n',
        {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        },
      )
    })

    const { container } = render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '生成一份近代艺术史简报')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    const transcriptScroll = await openAgentTranscript(user)
    await waitFor(() => {
      expect(transcriptScroll).toHaveTextContent('AI 服务暂时不可用')
    })
    const stageHeader = container.querySelector('.stage-header')
    expect(stageHeader).not.toBeNull()
    expect(stageHeader).toHaveTextContent('AI 服务暂时不可用')
  })

  it('renders the agent transcript inside a dedicated scroll container', async () => {
    const user = userEvent.setup()
    mockAgentFetch({
      events: [
        { type: 'assistant_done', text: '这里会展示 agent 的过程输出。' },
        { type: 'done' },
      ],
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '先分析一下第一页结构')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    const transcriptScroll = await openAgentTranscript(user)
    expect(transcriptScroll).toContainElement(screen.getByText('这里会展示 agent 的过程输出。'))
  })

  it('allows sending a follow-up instruction during streaming by aborting the previous run', async () => {
    const user = userEvent.setup()
    const requestBodies: string[] = []
    let firstRequestAborted = false
    const encoder = new TextEncoder()

    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url.endsWith('/api/agent/skills')) {
        return new Response(JSON.stringify({
          skills: [
            {
              id: 'general_edit',
              label: '通用改写',
              description: '面向当前 deck 的通用重写与整理。',
              searchMode: 'auto',
              workflow: 'deck',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (!url.endsWith('/api/ai/turns')) {
        throw new Error(`Unexpected fetch request: ${url}`)
      }

      requestBodies.push(String(init?.body ?? ''))
      const signal = init?.signal as AbortSignal | undefined

      if (requestBodies.length === 1) {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(`${JSON.stringify({ type: 'assistant_delta', text: '正在分析第一页…' })}\n`),
            )
            signal?.addEventListener('abort', () => {
              firstRequestAborted = true
              controller.error(new DOMException('The operation was aborted.', 'AbortError'))
            })
          },
        })

        return new Response(stream, {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        })
      }

      return new Response(
        `${JSON.stringify({ type: 'assistant_done', text: '我已经切换到新的需求。' })}\n${JSON.stringify({ type: 'done' })}\n`,
        {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        },
      )
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '先生成第一页')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    const transcriptScroll = await openAgentTranscript(user)
    await waitFor(() => {
      expect(transcriptScroll.textContent).toMatch(/已向智能体发送当前 deck 与需求|正在分析第一页…/)
    })

    await user.type(screen.getByLabelText(/给智能体的需求/i), '改成第二版方向')
    const submitButton = await screen.findByRole('button', { name: /发送新指令/i })
    expect(submitButton).toBeEnabled()

    await user.click(submitButton)

    await waitFor(() => {
      expect(requestBodies).toHaveLength(2)
    })

    expect(firstRequestAborted).toBe(true)
    expect(await screen.findByText('我已经切换到新的需求。')).toBeInTheDocument()
    expect(requestBodies[1]).toContain('改成第二版方向')
  })

  it('explicitly stops the current agent generation and allows a new instruction', async () => {
    const user = userEvent.setup()
    const requestBodies: string[] = []
    let activeRequestAborted = false
    const encoder = new TextEncoder()

    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url.endsWith('/api/agent/skills')) {
        return new Response(JSON.stringify({
          skills: [
            {
              id: 'html_ppt',
              label: 'HTML PPT',
              description: '原生 html-ppt HTML agent 工作流。',
              searchMode: 'off',
              workflow: 'html_agent',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (!url.endsWith('/api/ai/turns')) {
        throw new Error(`Unexpected fetch request: ${url}`)
      }

      requestBodies.push(String(init?.body ?? ''))
      const signal = init?.signal as AbortSignal | undefined

      if (requestBodies.length === 1) {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode(`${JSON.stringify({ type: 'status', phase: 'drafting', label: '正在生成第一页…' })}\n`),
              )
              signal?.addEventListener('abort', () => {
                activeRequestAborted = true
                controller.error(new DOMException('The operation was aborted.', 'AbortError'))
              })
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/x-ndjson',
            },
          },
        )
      }

      return new Response(
        `${JSON.stringify({ type: 'assistant_done', text: '我已经开始新的生成。' })}\n${JSON.stringify({ type: 'done' })}\n`,
        {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        },
      )
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '先生成一版')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    expect(await screen.findByRole('button', { name: /终止生成/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /终止生成/i }))

    expect(activeRequestAborted).toBe(true)
    await waitFor(() => {
      expect(screen.getAllByText('已终止本次生成').length).toBeGreaterThan(0)
    })
    expect(screen.queryByRole('button', { name: /终止生成/i })).toBeNull()

    await user.type(screen.getByLabelText(/给智能体的需求/i), '重新生成第二版')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    await waitFor(() => {
      expect(requestBodies).toHaveLength(2)
    })
    expect(requestBodies[1]).toContain('重新生成第二版')
    expect(await screen.findByText('我已经开始新的生成。')).toBeInTheDocument()
  })

  it('clears the local transcript and resets the server conversation context after confirmation', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const resetUrls: string[] = []

    vi.spyOn(window, 'fetch').mockImplementation(async (input, _init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url.endsWith('/api/agent/skills')) {
        return new Response(JSON.stringify({
          skills: [
            {
              id: 'html_ppt',
              label: 'HTML PPT',
              description: '原生 html-ppt HTML agent 工作流。',
              searchMode: 'off',
              workflow: 'html_agent',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (/\/api\/agent\/sessions\/[^/]+\/reset$/.test(url)) {
        resetUrls.push(url)
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (!url.endsWith('/api/ai/turns')) {
        throw new Error(`Unexpected fetch request: ${url}`)
      }

      return new Response(
        `${JSON.stringify({ type: 'assistant_done', text: '第一段结论。' })}\n${JSON.stringify({ type: 'done' })}\n`,
        {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        },
      )
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '生成一份简报')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    const transcriptScroll = await openAgentTranscript(user)
    await waitFor(() => {
      expect(transcriptScroll).toHaveTextContent('第一段结论。')
    })

    await user.click(screen.getByRole('button', { name: /清除记录/i }))

    expect(window.confirm).toHaveBeenCalledWith('这会清除当前对话记录并重置智能体上下文，但会保留已上传参考资料。是否继续？')
    expect(resetUrls).toHaveLength(1)
    expect(transcriptScroll).toHaveTextContent('这里会展示智能体的过程输出。')
    expect(transcriptScroll).not.toHaveTextContent('第一段结论。')

    const sessionId = window.sessionStorage.getItem('html-slide-editor:agent-session-id')
    expect(sessionId).toBeTruthy()
    expect(window.sessionStorage.getItem(`html-slide-editor:agent-transcript:${sessionId}`)).toBeNull()
  })

  it('finishes the current turn when the agent asks for clarification and re-enables submission', async () => {
    const user = userEvent.setup()
    const requestBodies: string[] = []
    let requestCount = 0

    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url.endsWith('/api/agent/skills')) {
        return new Response(JSON.stringify({
          skills: [
            {
              id: 'general_edit',
              label: '通用改写',
              description: '面向当前 deck 的通用重写与整理。',
              searchMode: 'auto',
              workflow: 'deck',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (!url.endsWith('/api/ai/turns')) {
        throw new Error(`Unexpected fetch request: ${url}`)
      }

      requestBodies.push(String(init?.body ?? ''))
      requestCount += 1

      if (requestCount === 1) {
        return new Response(
          [
            JSON.stringify({ type: 'assistant_done', text: '我需要先确认一下改写方向。' }),
            JSON.stringify({
              type: 'input_required',
              kind: 'text',
              inputId: 'input-text-1',
              responseId: 'response-text-1',
              title: '确认方向',
              prompt: '你更想突出发布时间表，还是发布收益？',
              submitLabel: '发送回答',
            }),
            JSON.stringify({ type: 'done' }),
          ].join('\n') + '\n',
          {
            status: 200,
            headers: {
              'content-type': 'application/x-ndjson',
            },
          },
        )
      }

      return new Response(
        [
          JSON.stringify({ type: 'assistant_done', text: '收到，我会按发布时间表方向继续。' }),
          JSON.stringify({ type: 'done' }),
        ].join('\n') + '\n',
        {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        },
      )
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '先帮我整理第一页')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    expect(await screen.findByText('你更想突出发布时间表，还是发布收益？')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /生成中/i })).toBeNull()

    const replyField = screen.getByLabelText(/继续回答智能体/i)
    await user.type(replyField, '突出发布时间表')
    await user.click(screen.getByRole('button', { name: /发送回答/i }))

    await waitFor(() => {
      expect(requestBodies).toHaveLength(2)
    })

    expect(requestBodies[1]).toContain('"inputReply"')
    expect(requestBodies[1]).toContain('"inputId":"input-text-1"')
    expect(requestBodies[1]).toContain('突出发布时间表')
    expect(await screen.findByText('收到，我会按发布时间表方向继续。')).toBeInTheDocument()
  })

  it('sends the current editor html to the agent and keeps the deck unchanged when discarding a candidate', async () => {
    const user = userEvent.setup()
    let seenRequestBody = ''
    mockAgentFetch({
      events: [
        { type: 'assistant_done', text: '我先给出一版候选草稿。' },
        {
          type: 'html_candidate_ready',
          candidateId: 'candidate-2',
          summary: '把措辞调整得更克制',
          html: '<!doctype html><html lang="en" data-fs-editable-deck="1"><body><section class="slide" data-slide-id="slide-1" id="slide-1"><div data-node-id="text-hero" data-edit-kind="text">候选标题</div></section></body></html>',
          previewMeta: {
            title: '候选标题',
            slideCount: 1,
          },
          sources: [],
          runMeta: {
            skillId: 'html_ppt',
            model: 'mock:MiniMax-M2.7',
            usedWebSearch: false,
            searchMode: 'off',
          },
        },
        { type: 'done' },
      ],
      onRequestBody: (body) => {
        seenRequestBody = body
      },
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openInspectorPanel(user)
    await user.click(screen.getByRole('button', { name: /text-hero/i }))
    const textEditor = screen.getByLabelText(/文本内容/i)
    await user.clear(textEditor)
    await user.type(textEditor, '人工先改过的版本')
    fireEvent.blur(textEditor)

    await openAgentDrawer(user)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '把语气改得更简洁')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    expect(seenRequestBody).toContain('人工先改过的版本')
    expect(seenRequestBody).toContain('"skillId":"html_ppt"')
    expect(seenRequestBody).toContain('"generationMode":"from-current"')
    const transcriptScroll = await openAgentTranscript(user)
    expect(transcriptScroll).toHaveTextContent('我先给出一版候选草稿。')
    expect(getPreviewSrcDoc()).toContain('人工先改过的版本')
    await user.click(screen.getByRole('tab', { name: /候选/i }))
    const thumbnail = await screen.findByTestId('candidate-thumbnail-preview')
    expect(thumbnail).toHaveAttribute('srcdoc', expect.stringContaining('候选标题'))
  })

  it('sends from-scratch mode with blank deck html instead of the current edited deck', async () => {
    const user = userEvent.setup()
    let seenRequestBody = ''
    mockAgentFetch({
      events: [{ type: 'done' }],
      onRequestBody: (body) => {
        seenRequestBody = body
      },
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.click(screen.getByLabelText(/从零生成/i))
    await user.type(screen.getByLabelText(/给智能体的需求/i), '生成一份产品发布首页')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    expect(seenRequestBody).toContain('"generationMode":"from-scratch"')
    expect(seenRequestBody).toContain('data-title=\\"Blank\\"')
    expect(seenRequestBody).not.toContain('开始输入你的内容')
    expect(seenRequestBody).not.toContain('你好，世界')
  })

  it('sends the picked preview element as AI local-edit context', async () => {
    const user = userEvent.setup()
    let seenRequestBody = ''
    mockAgentFetch({
      events: [{ type: 'done' }],
      onRequestBody: (body) => {
        seenRequestBody = body
      },
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.click(screen.getByRole('button', { name: /拣选元素/i }))

    const preview = screen.getByTitle('当前演示预览') as HTMLIFrameElement
    fireEvent(
      window,
      new MessageEvent('message', {
        source: preview.contentWindow,
        data: {
          source: 'html-slide-editor-preview',
          type: 'element-picked',
          slideId: 'slide-1',
          selector: '[data-node-id="text-hero"]',
          elementTag: 'div',
          elementText: '你好，世界',
        },
      }),
    )

    expect(await screen.findByLabelText('已拣选元素')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/给智能体的需求/i), '把这个元素改成更正式')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    expect(seenRequestBody).toContain('"generationMode":"from-current"')
    expect(seenRequestBody).toContain('"selectedElement"')
    expect(seenRequestBody).toContain('section.slide[data-slide-id=\\"slide-1\\"] [data-node-id=\\"text-hero\\"]')
    expect(seenRequestBody).toContain('"elementText":"你好，世界"')
  })

  it('hides the skill selector and always sends html-ppt requests', async () => {
    const user = userEvent.setup()
    let seenRequestBody = ''
    mockAgentFetch({
      events: [
        { type: 'assistant_done', text: '我已经开始生成演示。' },
        {
          type: 'html_candidate_ready',
          candidateId: 'candidate-3',
          summary: '已生成一份 html-ppt 风格的 HTML 候选。',
          html: '<!doctype html><html><head><title>AI Deck</title></head><body><section class=\"slide\"><h1>AI Deck</h1></section></body></html>',
          previewMeta: {
            title: 'AI Deck',
            slideCount: 1,
          },
          sources: [
            {
              title: 'AI Note',
              url: 'https://example.com/report',
              domain: 'example.com',
              snippet: '本地 AI 结果摘要',
            },
          ],
          runMeta: {
            skillId: 'html_ppt',
            model: 'mock:MiniMax-M2.7',
            usedWebSearch: false,
            searchMode: 'off',
          },
        },
        { type: 'done' },
      ],
      onRequestBody: (body) => {
        seenRequestBody = body
      },
    })

    render(<App initialDeckHtml={sampleDeck} />)

    expect(screen.queryByLabelText(/Agent 技能/i)).toBeNull()
    await openAgentDrawer(user)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '生成一份 AI 产品发布演示')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    expect(seenRequestBody).toContain('"skillId":"html_ppt"')
    expect(await screen.findByText('已生成一份 html-ppt 风格的 HTML 候选。')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /候选/i }))
    expect(screen.getByText('AI Note')).toBeInTheDocument()
    expect(screen.getByText('example.com')).toBeInTheDocument()
    const transcriptScroll = await openAgentTranscript(user)
    expect(transcriptScroll).toHaveTextContent('我已经开始生成演示。')
  })

  it('clears the current deck to a minimal blank shell after confirmation', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.click(screen.getByRole('button', { name: /清空当前 HTML/i }))

    expect(window.confirm).toHaveBeenCalledWith('这会清空当前页面内容，但保留最小 deck 结构。是否继续？')
    expect(getPreviewSrcDoc()).toContain('data-title="Blank"')
    expect(getPreviewSrcDoc()).not.toContain('开始输入你的内容')
  })

  it('defaults to the embedded html-ppt workflow and renders an HTML candidate download action', async () => {
    const user = userEvent.setup()
    let seenRequestBody = ''
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:html-ppt')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    mockAgentFetch({
      skillPayload: [
        {
          id: 'html_ppt',
          label: 'HTML PPT',
          description: '原生 html-ppt HTML agent 工作流。',
          searchMode: 'off',
          workflow: 'html_agent',
        },
        {
          id: 'general_edit',
          label: '通用改写',
          description: '面向当前 deck 的通用重写与整理。',
          searchMode: 'auto',
          workflow: 'deck',
        },
      ],
      events: [
        { type: 'assistant_done', text: '我已经生成了一份 HTML 候选。' },
        {
          type: 'html_candidate_ready',
          candidateId: 'candidate-html-1',
          summary: '已生成一份 html-ppt 风格的 HTML 候选。',
          html: '<!doctype html><html><head><title>AI 发布会</title></head><body><section class="slide"><h1>AI 发布会</h1></section></body></html>',
          previewMeta: {
            title: 'AI 发布会',
            slideCount: 1,
          },
          sources: [],
          runMeta: {
            skillId: 'html_ppt',
            model: 'MiniMax-M2.7',
            usedWebSearch: false,
            searchMode: 'off',
          },
        },
        { type: 'done' },
      ],
      onRequestBody: (body) => {
        seenRequestBody = body
      },
    })

    render(<App initialDeckHtml={sampleDeck} />)

    expect(screen.queryByLabelText(/演示目的/i)).toBeNull()
    expect(screen.queryByLabelText(/演示长度/i)).toBeNull()
    expect(screen.queryByLabelText(/内容准备度/i)).toBeNull()
    await openAgentDrawer(user)
    expect(screen.getByLabelText(/上传参考资料/i)).toBeInTheDocument()

    await user.click(screen.getByLabelText(/从零生成/i))
    await user.type(screen.getByLabelText(/给智能体的需求/i), '生成一份 AI 产品发布演示')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    expect(seenRequestBody).toContain('"skillId":"html_ppt"')
    expect(seenRequestBody).not.toContain('"htmlPpt"')
    expect(await screen.findByText('已生成一份 html-ppt 风格的 HTML 候选。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /应用草稿/i })).toBeNull()
    expect(screen.getByRole('button', { name: /进入对比模式/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /进入对比模式/i }))

    expect(screen.getByTestId('candidate-compare-preview')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /退出对比模式/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /下载 HTML 候选/i }))

    expect(createObjectUrl).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:html-ppt')
  })

  it('uploads arbitrary reference files through the managed upload endpoint and keeps host paths out of the generation request', async () => {
    const user = userEvent.setup()
    const requestBodies: string[] = []
    const uploadedBodies: Array<{ url: string; fileName: string | null; contentType: string | null }> = []

    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url.includes('/api/agent/uploads?sessionId=')) {
        uploadedBodies.push({
          url,
          fileName: init?.headers instanceof Headers
            ? init.headers.get('x-file-name')
            : Array.isArray(init?.headers)
              ? null
              : (init?.headers as Record<string, string> | undefined)?.['x-file-name'] ?? null,
          contentType: init?.headers instanceof Headers
            ? init.headers.get('content-type')
            : Array.isArray(init?.headers)
              ? null
              : (init?.headers as Record<string, string> | undefined)?.['content-type'] ?? null,
        })

        return new Response(JSON.stringify({
          asset: {
            assetId: 'asset-brief',
            fileName: 'metrics.xlsx',
            contentType: 'application/octet-stream',
            ext: '.xlsx',
            sizeBytes: 16,
            usability: 'usable',
          },
        }), {
          status: 201,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (!url.endsWith('/api/ai/turns')) {
        throw new Error(`Unexpected fetch request: ${url}`)
      }

      requestBodies.push(String(init?.body ?? ''))

      return new Response(
        [
          JSON.stringify({ type: 'assistant_done', text: '我已经根据应用层简报继续生成。' }),
          JSON.stringify({ type: 'done' }),
        ].join('\n') + '\n',
        {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        },
      )
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    const asset = new File(['spreadsheet bytes'], 'metrics.xlsx', { type: '' })
    await user.upload(screen.getByLabelText(/上传参考资料/i), asset)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '生成一份 AI 产品发布演示')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    await waitFor(() => {
      expect(uploadedBodies).toHaveLength(1)
      expect(requestBodies).toHaveLength(1)
    })

    expect(uploadedBodies[0]).toEqual(expect.objectContaining({
      fileName: 'metrics.xlsx',
      contentType: 'application/octet-stream',
    }))
    expect(requestBodies[0]).not.toContain('"htmlPpt"')
    expect(requestBodies[0]).not.toContain('./assets/screenshots')
  })

  it('encodes non-ascii reference filenames before sending upload headers', async () => {
    const user = userEvent.setup()
    const uploadedFileNames: string[] = []

    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (/\/api\/agent\/sessions\/[^/]+\/snapshot$/.test(url)) {
        return new Response(JSON.stringify({
          snapshot: null,
        }), {
          status: 404,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (url.includes('/api/agent/uploads?sessionId=')) {
        const fileName = init?.headers instanceof Headers
          ? init.headers.get('x-file-name')
          : Array.isArray(init?.headers)
            ? null
            : (init?.headers as Record<string, string> | undefined)?.['x-file-name'] ?? null
        uploadedFileNames.push(String(fileName))

        return new Response(JSON.stringify({
          asset: {
            assetId: 'asset-cn-name',
            fileName: '季度复盘.xlsx',
            contentType: 'application/octet-stream',
            ext: '.xlsx',
            sizeBytes: 16,
            usability: 'usable',
            referenceText: {
              status: 'extracted',
              excerpt: 'Pipeline | 42%',
              charCount: 13,
              truncated: false,
            },
          },
        }), {
          status: 201,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (url.endsWith('/api/agent/skills')) {
        return new Response(JSON.stringify({
          skills: [],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      throw new Error(`Unexpected fetch request: ${url}`)
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.upload(
      screen.getByLabelText(/上传参考资料/i),
      new File(['spreadsheet bytes'], '季度复盘.xlsx', { type: '' }),
    )

    await waitFor(() => {
      expect(uploadedFileNames).toEqual([encodeURIComponent('季度复盘.xlsx')])
    })
    expect(await screen.findByText('季度复盘.xlsx')).toBeInTheDocument()
  })

  it('renders a simplified upload-backed reference input for html-ppt generation', async () => {
    const user = userEvent.setup()
    mockAgentFetch({
      events: [{ type: 'done' }],
    })

    render(<App initialDeckHtml={sampleDeck} />)

    expect(screen.queryByLabelText(/演示目的/i)).toBeNull()
    expect(screen.queryByLabelText(/演示长度/i)).toBeNull()
    expect(screen.queryByLabelText(/内容准备度/i)).toBeNull()
    await openAgentDrawer(user)
    expect(screen.getByLabelText(/上传参考资料/i)).toBeInTheDocument()
    const referenceButton = screen.getByRole('button', { name: /^参考资料$/i })
    const clearButton = screen.getByRole('button', { name: /清空当前 HTML/i })
    const utilityRow = referenceButton.closest('.agent-utility-row')
    expect(referenceButton).toBeInTheDocument()
    expect(utilityRow).not.toBeNull()
    expect(clearButton.closest('.toolbar')).not.toBeNull()
    expect(clearButton.closest('.agent-utility-row')).toBeNull()
    expect(screen.queryByText(/参考资料只在生成时提供上下文/i)).toBeNull()
  })

  it('sends uploaded image assets as per-message AI material', async () => {
    const user = userEvent.setup()
    let seenRequestBody = ''
    mockAgentFetch({
      events: [{ type: 'done' }],
      uploadPayload: {
        assetId: 'asset-logo',
        fileName: 'logo.png',
        contentType: 'image/png',
        ext: '.png',
        sizeBytes: 4,
        usability: 'usable',
      },
      onRequestBody: (body) => {
        seenRequestBody = body
      },
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.upload(
      screen.getByLabelText(/上传图片素材/i),
      new File(['logo'], 'logo.png', { type: 'image/png' }),
    )

    expect(await screen.findByText('logo.png')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/给智能体的需求/i), '使用这张图做封面')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    expect(seenRequestBody).toContain('"messageAssetIds":["asset-logo"]')
    expect(seenRequestBody).not.toContain('"path"')
    await waitFor(() => {
      expect(screen.queryByLabelText('本次消息图片素材')).toBeNull()
    })
  })

  it('shows uploaded reference assets as compact chips below the reference button', async () => {
    const user = userEvent.setup()
    mockAgentFetch({
      events: [{ type: 'done' }],
      uploadPayload: {
        assetId: 'asset-brief',
        fileName: 'brief.md',
        contentType: 'text/markdown',
        ext: '.md',
        sizeBytes: 16,
        usability: 'usable',
        referenceText: {
          status: 'extracted',
          excerpt: '# Launch Brief\nUse Safety AI positioning.',
          charCount: 41,
          truncated: false,
        },
      },
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.upload(
      screen.getByLabelText(/上传参考资料/i),
      new File(['# launch brief'], 'brief.md', { type: 'text/markdown' }),
    )

    expect(screen.getByRole('button', { name: /参考资料 · 1/i })).toBeInTheDocument()
    expect(await screen.findByText('brief.md')).toBeInTheDocument()
    expect(screen.getByText('text/markdown')).toBeInTheDocument()
    expect(within(screen.getByLabelText('已上传参考资料')).getByText('已提取 41 字')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /brief.md/i }))

    expect(screen.getByText('文字预览')).toBeInTheDocument()
    expect(screen.getByText(/Use Safety AI positioning/i)).toBeInTheDocument()
  })

  it('clears agent reference assets and message images when importing a new html deck', async () => {
    const user = userEvent.setup()
    const resetBodies: string[] = []
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (/\/api\/agent\/sessions\/[^/]+\/snapshot$/.test(url)) {
        return new Response(JSON.stringify({
          snapshot: {
            htmlPptState: {
              uploadedAssets: [
                {
                  assetId: 'asset-stale',
                  fileName: 'stale.md',
                  contentType: 'text/markdown',
                  ext: '.md',
                  sizeBytes: 8,
                  usability: 'usable',
                  referenceText: {
                    status: 'extracted',
                    excerpt: 'stale reference',
                    charCount: 15,
                    truncated: false,
                  },
                },
              ],
            },
          },
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (url.includes('/api/agent/uploads?sessionId=')) {
        const fileName = init?.headers instanceof Headers
          ? init.headers.get('x-file-name')
          : Array.isArray(init?.headers)
            ? null
            : (init?.headers as Record<string, string> | undefined)?.['x-file-name'] ?? null
        const decodedFileName = decodeURIComponent(String(fileName ?? 'asset.bin'))
        const isImage = decodedFileName.endsWith('.png')

        return new Response(JSON.stringify({
          asset: {
            assetId: isImage ? 'asset-logo' : 'asset-brief',
            fileName: decodedFileName,
            contentType: isImage ? 'image/png' : 'text/markdown',
            ext: isImage ? '.png' : '.md',
            sizeBytes: 16,
            usability: 'usable',
            referenceText: isImage
              ? {
                  status: 'unsupported',
                  excerpt: '',
                  charCount: 0,
                  truncated: false,
                  reason: '暂不支持预览',
                }
              : {
                  status: 'extracted',
                  excerpt: '# Launch Brief\nUse Safety AI positioning.',
                  charCount: 41,
                  truncated: false,
                },
          },
        }), {
          status: 201,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (/\/api\/agent\/sessions\/[^/]+\/reset$/.test(url)) {
        resetBodies.push(String(init?.body ?? ''))
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (url.endsWith('/api/agent/skills')) {
        return new Response(JSON.stringify({
          skills: [],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      throw new Error(`Unexpected fetch request: ${url}`)
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    const referenceUploadInput = screen.getByLabelText('上传参考资料')
    await user.upload(referenceUploadInput, new File(['# launch brief'], 'brief.md', { type: 'text/markdown' }))
    await user.upload(
      screen.getByLabelText(/上传图片素材/i),
      new File(['logo'], 'logo.png', { type: 'image/png' }),
    )

    expect(await screen.findByText('brief.md')).toBeInTheDocument()
    expect(await screen.findByText('logo.png')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /参考资料 · /i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /图片素材 · 1/i })).toBeInTheDocument()

    const htmlInput = document.querySelector<HTMLInputElement>('input[accept=".html,text/html"]')
    expect(htmlInput).not.toBeNull()
    await user.upload(htmlInput as HTMLInputElement, new File([paragraphTextDeck], 'new-deck.html', { type: 'text/html' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('已上传参考资料')).toBeNull()
      expect(screen.queryByLabelText('本次消息图片素材')).toBeNull()
    })
    expect(screen.queryByText('文字预览')).toBeNull()
    expect(screen.getByRole('button', { name: /^参考资料$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^上传图片$/i })).toBeInTheDocument()
    expect(resetBodies).toContain(JSON.stringify({ preserveUploadedAssets: false }))
  })

  it('surfaces reference upload failures in the agent status area', async () => {
    const user = userEvent.setup()

    vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (/\/api\/agent\/sessions\/[^/]+\/snapshot$/.test(url)) {
        return new Response(JSON.stringify({
          snapshot: null,
        }), {
          status: 404,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (url.includes('/api/agent/uploads?sessionId=')) {
        return new Response(JSON.stringify({
          error: 'upload_failed',
        }), {
          status: 500,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (url.endsWith('/api/agent/skills')) {
        return new Response(JSON.stringify({
          skills: [],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      throw new Error(`Unexpected fetch request: ${url}`)
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.upload(
      screen.getByLabelText(/上传参考资料/i),
      new File(['broken'], 'brief.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    )

    await waitFor(() => {
      expect(screen.getAllByText('参考资料上传失败：上传参考素材失败').length).toBeGreaterThan(0)
    })
    expect(screen.queryByLabelText('已上传参考资料')).toBeNull()
  })

  it('hides local filesystem path controls while exposing upload-backed asset input', async () => {
    const user = userEvent.setup()
    mockAgentFetch({
      skillPayload: [
        {
          id: 'html_ppt',
          label: 'HTML PPT',
          description: '原生 html-ppt HTML agent 工作流。',
          searchMode: 'off',
          workflow: 'html_agent',
        },
      ],
      events: [{ type: 'done' }],
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    const uploadInput = screen.getByLabelText(/上传参考资料/i)
    expect(uploadInput).toBeInTheDocument()
    expect(uploadInput).not.toHaveAttribute('accept')
    expect(screen.queryByLabelText(/图片目录路径/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /扫描图片目录/i })).toBeNull()
  })

  it('keeps the HTML candidate panel readable with only the first three page previews', async () => {
    const user = userEvent.setup()

    mockAgentFetch({
      skillPayload: [
        {
          id: 'html_ppt',
          label: 'HTML PPT',
          description: '原生 html-ppt HTML agent 工作流。',
          searchMode: 'off',
          workflow: 'html_agent',
        },
      ],
      events: [
        { type: 'assistant_done', text: '我已经生成了一份较长的 HTML 候选。' },
        {
          type: 'html_candidate_ready',
          candidateId: 'candidate-html-readable',
          summary: '这是一段很长的候选说明，用来模拟 agent 返回的大段文字。它应该被压缩在候选页签里，而不是把导入编辑器、下载候选和丢弃草稿这些关键按钮挤到不可见的位置。',
          html: createHtmlCandidateDeck(5),
          previewMeta: {
            title: 'Readable Candidate',
            slideCount: 5,
          },
          sources: [],
          runMeta: {
            skillId: 'html_ppt',
            model: 'MiniMax-M2.7',
            usedWebSearch: false,
            searchMode: 'off',
          },
        },
        { type: 'done' },
      ],
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '生成一份 5 页候选')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    expect(await screen.findByText(/这是一段很长的候选说明/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /候选/i }))
    expect(screen.getByRole('button', { name: /导入编辑器/i })).toBeInTheDocument()
    expect(screen.getAllByTestId('candidate-page-preview')).toHaveLength(3)
    expect(screen.getByText('Candidate page 1')).toBeInTheDocument()
    expect(screen.getByText('Candidate page 3')).toBeInTheDocument()
    expect(screen.queryByText('Candidate page 4')).toBeNull()
  })

  it('renders distinct candidate thumbnail previews even when slide ids are missing', async () => {
    const user = userEvent.setup()

    mockAgentFetch({
      skillPayload: [
        {
          id: 'html_ppt',
          label: 'HTML PPT',
          description: '原生 html-ppt HTML agent 工作流。',
          searchMode: 'off',
          workflow: 'html_agent',
        },
      ],
      events: [
        { type: 'assistant_done', text: '我已经生成了一份 3 页 HTML 候选。' },
        {
          type: 'html_candidate_ready',
          candidateId: 'candidate-html-missing-slide-ids',
          summary: '候选包含三页，但原始 slide 没有显式 id。',
          html: createHtmlCandidateDeckWithoutSlideIds(3),
          previewMeta: {
            title: 'Missing Slide Ids Candidate',
            slideCount: 3,
          },
          sources: [],
          runMeta: {
            skillId: 'html_ppt',
            model: 'MiniMax-M2.7',
            usedWebSearch: false,
            searchMode: 'off',
          },
        },
        { type: 'done' },
      ],
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.type(screen.getByLabelText(/给智能体的需求/i), '生成一份 3 页候选')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))

    expect(await screen.findByText('候选包含三页，但原始 slide 没有显式 id。')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /候选/i }))

    const thumbnails = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe.candidate-thumbnail-preview'))
    expect(thumbnails).toHaveLength(3)

    const activeTitles = thumbnails.map((thumbnail) => {
      const previewDocument = new DOMParser().parseFromString(thumbnail.getAttribute('srcdoc') ?? '', 'text/html')
      return previewDocument.querySelector('.slide.is-active h1')?.textContent?.trim() ?? null
    })

    expect(activeTitles).toEqual([
      'Candidate page 1',
      'Candidate page 2',
      'Candidate page 3',
    ])
  })

  it('imports an HTML candidate into the editable deck workflow', async () => {
    const user = userEvent.setup()

    mockAgentFetch({
      skillPayload: [
        {
          id: 'html_ppt',
          label: 'HTML PPT',
          description: '原生 html-ppt HTML agent 工作流。',
          searchMode: 'off',
          workflow: 'html_agent',
        },
      ],
      events: [
        { type: 'assistant_done', text: '我已经生成了一份 HTML 候选。' },
        {
          type: 'html_candidate_ready',
          candidateId: 'candidate-html-import',
          summary: '已生成一份 html-ppt 风格的 HTML 候选。',
          html: '<!doctype html><html><head><title>Imported Launch</title></head><body><section class="slide"><h1>Imported Launch</h1><p>Market-ready narrative.</p></section></body></html>',
          previewMeta: {
            title: 'Imported Launch',
            slideCount: 1,
          },
          sources: [],
          runMeta: {
            skillId: 'html_ppt',
            model: 'MiniMax-M2.7',
            usedWebSearch: false,
            searchMode: 'off',
          },
        },
        { type: 'done' },
      ],
    })

    render(<App initialDeckHtml={sampleDeck} />)

    await openAgentDrawer(user)
    await user.click(screen.getByLabelText(/从零生成/i))
    await user.type(screen.getByLabelText(/给智能体的需求/i), '生成一份 AI 产品发布演示')
    await user.click(screen.getByRole('button', { name: /生成候选/i }))
    expect(await screen.findByText('已生成一份 html-ppt 风格的 HTML 候选。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /导入编辑器/i }))

    expect(getPreviewSrcDoc()).toContain('Imported Launch')
    await openInspectorPanel(user)
    expect(screen.getByRole('button', { name: /slide-1-node-1/i })).toBeInTheDocument()
    expect(screen.queryByTestId('agent-progress-overlay')).toBeNull()
  })
})

function mockImageDimensions(dimensions: { width: number; height: number }): void {
  class MockImage {
    width = dimensions.width
    height = dimensions.height
    naturalWidth = dimensions.width
    naturalHeight = dimensions.height
    onload: null | (() => void) = null
    onerror: null | (() => void) = null

    set src(_value: string) {
      queueMicrotask(() => {
        this.onload?.()
      })
    }
  }

  Object.defineProperty(window, 'Image', {
    configurable: true,
    writable: true,
    value: MockImage,
  })
}

function mockAgentFetch(options: {
  events: Array<Record<string, unknown>>
  onRequestBody?: (body: string) => void
  skillPayload?: Array<Record<string, unknown>>
  previewPayload?: Array<Record<string, unknown>>
  assetPayload?: Array<Record<string, unknown>>
  uploadPayload?: Record<string, unknown>
}): void {
  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

    if (url.endsWith('/api/agent/skills')) {
      return new Response(JSON.stringify({
        skills: options.skillPayload ?? [
          {
            id: 'general_edit',
            label: '通用改写',
            description: '面向当前 deck 的通用重写与整理。',
            searchMode: 'auto',
            workflow: 'deck',
          },
          {
            id: 'research_refresh',
            label: '研究补全',
            description: '自动联网搜索公开资料并补全内容。',
            searchMode: 'required',
            workflow: 'deck',
          },
        ],
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    }

    if (!url.endsWith('/api/ai/turns')) {
      if (/\/api\/agent\/sessions\/[^/]+\/snapshot$/.test(url)) {
        return new Response(JSON.stringify({
          snapshot: null,
        }), {
          status: 404,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (url.includes('/api/agent/uploads?sessionId=')) {
        return new Response(JSON.stringify({
          asset: options.uploadPayload ?? {
            assetId: 'asset-uploaded',
            fileName: 'asset.png',
            contentType: 'image/png',
            ext: '.png',
            sizeBytes: 4,
            usability: 'usable',
          },
        }), {
          status: 201,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (url.endsWith('/api/agent/html-ppt/style-previews')) {
        return new Response(JSON.stringify({
          previews: options.previewPayload ?? [],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      if (url.endsWith('/api/agent/html-ppt/assets/scan')) {
        return new Response(JSON.stringify({
          assets: options.assetPayload ?? [],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      throw new Error(`Unexpected fetch request: ${url}`)
    }

    options.onRequestBody?.(String(init?.body ?? ''))
    const payload = `${options.events.map((event) => JSON.stringify(event)).join('\n')}\n`
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload))
        controller.close()
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'application/x-ndjson',
      },
    })
  })
}

async function openAgentDrawer(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  if (screen.queryByLabelText(/给智能体的需求/i)) {
    return
  }

  await user.click(screen.getByRole('tab', { name: '智能体' }))
  await screen.findByRole('heading', { name: '智能体' })
}

async function openInspectorPanel(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  if (screen.queryByRole('heading', { name: '对象列表' })) {
    return
  }

  await user.click(screen.getByRole('tab', { name: '编辑' }))
  await screen.findByRole('heading', { name: '对象列表' })
}

async function openAgentTranscript(user: ReturnType<typeof userEvent.setup>) {
  await openAgentDrawer(user)

  if (!screen.queryByTestId('agent-transcript-scroll')) {
    await user.click(screen.getByRole('tab', { name: /对话记录/i }))
  }

  return screen.findByTestId('agent-transcript-scroll')
}
