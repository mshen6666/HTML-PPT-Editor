import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

import { createDeckDocument } from '../deck-contract/deckContract'
import {
  createStandaloneHtmlExport,
  prepareDeckDocumentForHtmlExport,
} from './exportDeckToHtml'

const require = createRequire(import.meta.url)
const { JSDOM, VirtualConsole } = require('jsdom') as {
  JSDOM: new (...args: unknown[]) => {
    window: Window & typeof globalThis
  }
  VirtualConsole: new () => {
    on: (eventName: string, listener: (error: Error) => void) => void
  }
}

const htmlPptDeck = `<!doctype html>
<html lang="zh-CN" data-fs-editable-deck="1" data-fs-deck-profile="html-ppt">
  <head>
    <meta charset="UTF-8" />
    <style>
      .slide {
        opacity: 0;
      }

      .slide.is-active {
        opacity: 1;
      }

      [data-anim='stagger-list'] > * {
        opacity: 0;
      }

      .slide.is-active [data-anim='stagger-list'] > * {
        opacity: 1;
      }
    </style>
  </head>
  <body>
    <div class="deck">
      <section class="slide" data-slide-id="slide-1" id="slide-1" data-title="Cover">
        <main>
          <div class="stack" data-anim="stagger-list">
            <div class="agenda-row"><span>第一页</span></div>
          </div>
        </main>
      </section>
      <section class="slide is-active is-prev" data-slide-id="slide-2" id="slide-2" data-title="Agenda">
        <main>
          <div class="stack" data-anim="stagger-list">
            <div class="agenda-row"><span>第二页</span></div>
          </div>
        </main>
      </section>
    </div>
    <div class="notes-overlay open" aria-hidden="false"></div>
    <div class="overview-overlay open" aria-hidden="false"></div>
  </body>
</html>`

describe('exportDeckToHtml helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resets html-ppt decks to a clean first-slide state before html export', () => {
    const document = createDeckDocument(htmlPptDeck)
    const runtimeOnlyNode = document.createElement('div')
    runtimeOnlyNode.className = 'runtime-generated'
    runtimeOnlyNode.textContent = 'Runtime-generated summary'
    document.querySelector('section.slide[data-slide-id="slide-1"] main')?.appendChild(runtimeOnlyNode)

    prepareDeckDocumentForHtmlExport(document)

    const firstSlide = document.querySelector<HTMLElement>('section.slide[data-slide-id="slide-1"]')
    const secondSlide = document.querySelector<HTMLElement>('section.slide[data-slide-id="slide-2"]')
    const notesOverlay = document.querySelector<HTMLElement>('.notes-overlay')
    const overviewOverlay = document.querySelector<HTMLElement>('.overview-overlay')

    expect(firstSlide?.classList.contains('is-active')).toBe(true)
    expect(secondSlide?.classList.contains('is-active')).toBe(false)
    expect(secondSlide?.classList.contains('is-prev')).toBe(false)
    expect(notesOverlay?.classList.contains('open')).toBe(false)
    expect(notesOverlay?.getAttribute('aria-hidden')).toBe('true')
    expect(overviewOverlay?.classList.contains('open')).toBe(false)
    expect(document.body.textContent).toContain('Runtime-generated summary')
  })

  it('inlines external stylesheet, script, and image assets into a standalone html export', async () => {
    const document = createDeckDocument(`<!doctype html>
<html lang="zh-CN" data-fs-editable-deck="1" data-fs-deck-profile="html-ppt">
  <head>
    <meta charset="UTF-8" />
    <title>Standalone Export</title>
    <link rel="stylesheet" href="http://localhost:3000/deck-theme.css" />
  </head>
  <body>
    <div class="deck">
      <section class="slide is-active" data-slide-id="slide-1" id="slide-1">
        <main>
          <div class="stack" data-anim="stagger-list">
            <div class="agenda-row">01</div>
          </div>
        </main>
      </section>
    </div>
    <script src="http://localhost:3000/runtime.js"></script>
  </body>
</html>`)

    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url === 'http://localhost:3000/deck-theme.css') {
        return new Response('.slide { color: rgb(255, 0, 0); }', {
          status: 200,
          headers: { 'Content-Type': 'text/css' },
        })
      }

      if (url === 'http://localhost:3000/runtime.js') {
        return new Response('window.__deckRuntimeLoaded = true;', {
          status: 200,
          headers: { 'Content-Type': 'application/javascript' },
        })
      }

      throw new Error(`Unexpected asset fetch: ${url}`)
    })

    const html = await createStandaloneHtmlExport(document)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(html).toContain('<style data-export-inline-source="http://localhost:3000/deck-theme.css">')
    expect(html).toContain('.slide { color: rgb(255, 0, 0); }')
    expect(html).toContain('<script data-export-inline-source="http://localhost:3000/runtime.js">')
    expect(html).toContain('window.__deckRuntimeLoaded = true;')
    expect(html).toContain('<style data-export-runtime="standalone-stagger-fix">')
    expect(html).toContain(".slide.is-active [data-anim='stagger-list'] { opacity: 1 !important; }")
    expect(html).toContain('<script data-export-runtime="standalone-animation-replay">')
    expect(html).toContain('replaySlideAnimations')
    expect(html).toContain("document.querySelectorAll('.slide')")
    expect(html).toContain('data-anim="stagger-list"')
    expect(html).not.toContain('rel="stylesheet" href="http://localhost:3000/deck-theme.css"')
    expect(html).not.toContain('<script src="http://localhost:3000/runtime.js"></script>')
  })

  it('wraps body-level html-ppt slides in a deck container during standalone export', async () => {
    const document = createDeckDocument(`<!doctype html>
<html lang="zh-CN" data-fs-editable-deck="1" data-fs-deck-profile="html-ppt">
  <head>
    <meta charset="UTF-8" />
    <title>Body Slides Export</title>
  </head>
  <body>
    <section class="slide is-active" data-slide-id="slide-1" id="slide-1"></section>
    <section class="slide" data-slide-id="slide-2" id="slide-2"></section>
    <script>window.__deckRuntimeLoaded = true;</script>
  </body>
</html>`)

    const html = await createStandaloneHtmlExport(document)
    const exportedDocument = createDeckDocument(html)
    const deck = exportedDocument.querySelector('.deck')

    expect(deck).not.toBeNull()
    expect(deck?.children[0]?.id).toBe('slide-1')
    expect(deck?.children[1]?.id).toBe('slide-2')
    expect(exportedDocument.body.lastElementChild?.tagName).toBe('SCRIPT')
  })

  it('wraps slide containers in a deck shell without flattening the original slide parent', async () => {
    const document = createDeckDocument(`<!doctype html>
<html lang="zh-CN" data-fs-editable-deck="1" data-fs-deck-profile="html-ppt">
  <head>
    <meta charset="UTF-8" />
    <title>Slide Offset Export</title>
  </head>
  <body>
    <div class="slides-offset">
      <section class="slide is-active" data-slide-id="slide-1" id="slide-1"></section>
      <section class="slide" data-slide-id="slide-2" id="slide-2"></section>
    </div>
  </body>
</html>`)

    const html = await createStandaloneHtmlExport(document)
    const exportedDocument = createDeckDocument(html)
    const deck = exportedDocument.querySelector('.deck')
    const slidesOffset = deck?.querySelector('.slides-offset')

    expect(deck).not.toBeNull()
    expect(slidesOffset).not.toBeNull()
    expect(slidesOffset?.parentElement).toBe(deck)
    expect(slidesOffset?.children[0]?.id).toBe('slide-1')
    expect(slidesOffset?.children[1]?.id).toBe('slide-2')
  })

  it('exports a standalone keyboard runtime that advances active html-ppt slides', async () => {
    const document = createDeckDocument(htmlPptDeck)
    prepareDeckDocumentForHtmlExport(document)

    const html = await createStandaloneHtmlExport(document)
    const consoleErrors: string[] = []
    const virtualConsole = new VirtualConsole()
    virtualConsole.on('jsdomError', (error) => {
      consoleErrors.push(error.message)
    })

    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'http://localhost/export.html',
      virtualConsole,
      pretendToBeVisual: true,
    })

    await new Promise((resolve) => {
      dom.window.setTimeout(resolve, 20)
    })

    expect(dom.window.document.querySelector('.slide.is-active')?.getAttribute('data-slide-id')).toBe('slide-1')

    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
    }))

    expect(dom.window.document.querySelector('.slide.is-active')?.getAttribute('data-slide-id')).toBe('slide-2')
    expect(consoleErrors).toEqual([])
  })

  it('does not inline dev-server html fallback responses as css or scripts', async () => {
    const document = createDeckDocument(`<!doctype html>
<html lang="zh-CN" data-fs-editable-deck="1" data-fs-deck-profile="html-ppt">
  <head>
    <meta charset="UTF-8" />
    <title>Fallback Asset Export</title>
    <link rel="stylesheet" href="http://localhost:5173/editor/assets/base.css" />
  </head>
  <body>
    <div class="deck">
      <section class="slide is-active" data-slide-id="slide-1" id="slide-1"></section>
    </div>
    <script src="http://localhost:5173/editor/assets/runtime.js"></script>
  </body>
</html>`)

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<!doctype html><html><body>App shell</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }))

    const html = await createStandaloneHtmlExport(document)

    expect(html).not.toContain('data-export-inline-source="http://localhost:5173/editor/assets/base.css"')
    expect(html).not.toContain('data-export-inline-source="http://localhost:5173/editor/assets/runtime.js"')
    expect(html).toContain('rel="stylesheet" href="http://localhost:5173/editor/assets/base.css"')
    expect(html).toContain('<script src="http://localhost:5173/editor/assets/runtime.js"></script>')
  })
})
