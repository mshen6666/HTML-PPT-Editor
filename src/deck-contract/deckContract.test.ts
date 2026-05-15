import { describe, expect, it } from 'vitest'

import {
  adaptImportedHtmlToDeck,
  applyDeckPatch,
  createDeckDocument,
  createImageNode,
  duplicateSlide,
  patchObjectLayout,
  patchObjectLayer,
  patchComponentSlotStyle,
  parseControlledDeck,
  patchComponentSlot,
  patchMotion,
  patchText,
  patchTextStyle,
  prepareSlideForStaticView,
  readTextStyle,
  removeNode,
  removeSlide,
  reorderSlides,
  replaceImage,
  ensureAiElementAnchor,
  serializeDeck,
  previewDeckPatch,
} from './deckContract'

const sampleDeck = `<!doctype html>
<html lang="en" data-fs-editable-deck="1">
  <head>
    <meta charset="UTF-8" />
    <title>Sample Deck</title>
  </head>
  <body>
    <div class="slides-offset">
      <section class="slide" data-slide-id="slide-1" id="slide-1">
        <div
          data-node-id="text-hero"
          data-edit-kind="text"
          data-motion-name="fade-up"
          data-motion-duration="600"
          data-motion-delay="50"
        >
          Hello <strong>world</strong>
        </div>
        <article data-node-id="card-1" data-edit-kind="component">
          <h2 data-slot-key="title">Quarterly review</h2>
          <p data-slot-key="body">Revenue is up 24% year on year.</p>
        </article>
        <figure data-node-id="image-1" data-edit-kind="image">
          <img src="data:image/png;base64,old" alt="Old cover" />
        </figure>
      </section>
      <section class="slide" data-slide-id="slide-2" id="slide-2">
        <div data-node-id="text-2" data-edit-kind="text">Slide two</div>
      </section>
    </div>
  </body>
</html>`

const importedHtmlPptDeck = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>HTML PPT Import</title>
  </head>
  <body>
    <div class="deck">
      <section class="slide is-active" data-title="Cover">
        <header class="deck-header">
          <p>Header copy</p>
        </header>
        <main>
          <p data-anim="fade-up">Launch Story</p>
          <h1>From model to system</h1>
          <p>One clear message for the market.</p>
          <img src="https://example.com/hero.png" alt="Hero" />
        </main>
        <footer class="deck-footer">
          <p>Footer copy</p>
        </footer>
        <div class="notes">Presenter-only notes</div>
      </section>
      <section class="slide" data-title="Metrics">
        <main>
          <h2>Pilot results</h2>
        </main>
      </section>
    </div>
    <div class="notes-overlay" id="notesOverlay"></div>
    <div class="overview-overlay" id="overviewOverlay"></div>
  </body>
</html>`

const importedRichHtmlPptDeck = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>Rich HTML PPT Import</title>
  </head>
  <body>
    <div class="deck">
      <section class="slide is-active" data-title="Capability Map">
        <div class="deck-header">
          <span>Deck chrome</span>
        </div>
        <main>
          <p class="kicker">Tech sharing</p>
          <h1>一套结构化编辑器</h1>
          <div class="row wrap">
            <span class="pill">HTML PPT</span>
            <span class="pill pill-accent">Template-first</span>
          </div>
          <div class="card">
            <h4>支持的内容块</h4>
            <p>标题、说明、标签、表格和代码都要进入检查面板。</p>
            <a href="https://example.com">资料链接</a>
            <button type="button">行动按钮</button>
            <small>补充说明</small>
          </div>
          <div class="visual" role="img" aria-label="背景图" style="background-image: url('/assets/bg.png');"></div>
          <pre class="code"><code>const keepRuntime = true;</code></pre>
          <table>
            <thead>
              <tr><th>模块</th><th>状态</th></tr>
            </thead>
            <tbody>
              <tr><td>Inspector</td><td>Needs work</td></tr>
            </tbody>
          </table>
        </main>
        <div class="notes">Presenter notes</div>
      </section>
    </div>
  </body>
</html>`

describe('parseControlledDeck', () => {
  it('reads slides, nodes, slots, and motion metadata from a controlled deck', () => {
    const document = createDeckDocument(sampleDeck)

    const deck = parseControlledDeck(document)

    expect(deck.slideOrder).toEqual(['slide-1', 'slide-2'])
    expect(deck.slides[0]).toMatchObject({
      id: 'slide-1',
      nodes: ['text-hero', 'card-1', 'image-1'],
    })
    expect(deck.nodes['text-hero']).toMatchObject({
      id: 'text-hero',
      slideId: 'slide-1',
      kind: 'text',
      html: 'Hello <strong>world</strong>',
      hidden: false,
      locked: false,
      resources: [],
      motion: {
        name: 'fade-up',
        duration: 600,
        delay: 50,
        enabled: true,
      },
    })
    expect(deck.nodes['card-1']).toMatchObject({
      kind: 'component',
      layout: {
        mode: 'flow',
        x: null,
        y: null,
        width: null,
        height: null,
      },
      slots: {
        title: 'Quarterly review',
        body: 'Revenue is up 24% year on year.',
      },
    })
    expect(deck.nodes['image-1']).toMatchObject({
      kind: 'image',
      layout: {
        mode: 'flow',
        x: null,
        y: null,
        width: null,
        height: null,
      },
      image: {
        src: 'data:image/png;base64,old',
        alt: 'Old cover',
      },
      resources: [
        {
          type: 'image',
          src: 'data:image/png;base64,old',
          alt: 'Old cover',
          assetId: null,
        },
      ],
    })
  })

  it('reads explicit style, resource, locked, and hidden fields from editable nodes', () => {
    const document = createDeckDocument(`<!doctype html>
<html lang="en" data-fs-editable-deck="1">
  <body>
    <section class="slide" data-slide-id="slide-1">
      <h1
        data-node-id="title-1"
        data-edit-kind="text"
        data-editor-locked="true"
        data-editor-hidden="true"
        style="font-size: 42px; color: #123456;"
      >Launch</h1>
      <figure data-node-id="image-1" data-edit-kind="image" data-asset-id="brand-mark">
        <img src="/assets/logo.svg" alt="Logo" />
      </figure>
    </section>
  </body>
</html>`)

    const deck = parseControlledDeck(document)

    expect(deck.nodes['title-1']).toMatchObject({
      kind: 'text',
      locked: true,
      hidden: true,
      style: {
        fontSize: '42px',
        color: '#123456',
      },
      capabilities: {
        canEditText: false,
        canDelete: false,
      },
    })
    expect(deck.nodes['image-1']).toMatchObject({
      kind: 'image',
      resources: [
        {
          type: 'image',
          src: '/assets/logo.svg',
          alt: 'Logo',
          assetId: 'brand-mark',
        },
      ],
    })
  })

  it('throws when the deck root marker is missing', () => {
    const document = createDeckDocument('<html><body><section class="slide"></section></body></html>')

    expect(() => parseControlledDeck(document)).toThrow('Expected an html-ppt editable deck root')
  })

  it('adapts native html-ppt html into an editable controlled deck', () => {
    const importedHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>HTML PPT Import</title>
  </head>
  <body>
    <section class="slide">
      <h1>Launch Story</h1>
      <p>One clear message for the market.</p>
      <img src="https://example.com/hero.png" alt="Hero" />
    </section>
  </body>
</html>`

    const adapted = adaptImportedHtmlToDeck(importedHtml)
    const deck = parseControlledDeck(createDeckDocument(adapted))

    expect(adapted).toContain('data-fs-editable-deck="1"')
    expect(deck.slideOrder).toEqual(['slide-1'])
    expect(deck.nodes['slide-1-node-1']).toMatchObject({
      kind: 'text',
      layout: {
        mode: 'flow',
        x: null,
        y: null,
        width: null,
        height: null,
      },
      html: 'Launch Story',
    })
    expect(deck.nodes['slide-1-node-3']).toMatchObject({
      kind: 'image',
      image: {
        alt: 'Hero',
      },
    })
  })

  it('detects html-ppt decks, preserves slide titles, and excludes chrome from editable nodes', () => {
    const adapted = adaptImportedHtmlToDeck(importedHtmlPptDeck)
    const deck = parseControlledDeck(createDeckDocument(adapted))

    expect(adapted).toContain('data-fs-editable-deck="1"')
    expect(adapted).toContain('data-fs-deck-profile="html-ppt"')
    expect(deck.profile).toBe('html-ppt')
    expect(deck.slides).toEqual([
      expect.objectContaining({
        id: 'slide-1',
        title: 'Cover',
      }),
      expect.objectContaining({
        id: 'slide-2',
        title: 'Metrics',
      }),
    ])

    const editableTexts = Object.values(deck.nodes)
      .filter((node) => node.kind === 'text')
      .map((node) => node.html)
    expect(editableTexts).toContain('Launch Story')
    expect(editableTexts).toContain('From model to system')
    expect(editableTexts).toContain('One clear message for the market.')
    expect(editableTexts).not.toContain('Header copy')
    expect(editableTexts).not.toContain('Footer copy')
    expect(editableTexts).not.toContain('Presenter-only notes')

    expect(deck.nodes['slide-1-node-1']).toMatchObject({
      kind: 'text',
      capabilities: {
        canEditText: true,
        canReplaceImage: false,
        canFloat: false,
        canDelete: false,
        canEditMotion: false,
      },
    })
    expect(deck.nodes['slide-1-node-4']).toMatchObject({
      kind: 'image',
      image: {
        alt: 'Hero',
      },
      capabilities: {
        canEditText: false,
        canReplaceImage: true,
        canFloat: false,
        canDelete: false,
        canEditMotion: false,
      },
    })
  })

  it('collects html-ppt native rich content blocks beyond headings and paragraphs', () => {
    const adapted = adaptImportedHtmlToDeck(importedRichHtmlPptDeck)
    const deck = parseControlledDeck(createDeckDocument(adapted))

    const editableTexts = Object.values(deck.nodes)
      .filter((node) => node.kind === 'text')
      .map((node) => node.html)

    expect(editableTexts).toContain('HTML PPT')
    expect(editableTexts).toContain('Template-first')
    expect(editableTexts).toContain('支持的内容块')
    expect(editableTexts).toContain('资料链接')
    expect(editableTexts).toContain('行动按钮')
    expect(editableTexts).toContain('补充说明')
    expect(editableTexts.some((html) => html.includes('const keepRuntime = true;'))).toBe(true)
    expect(editableTexts).toContain('模块')
    expect(editableTexts).toContain('状态')
    expect(editableTexts).toContain('Inspector')
    expect(editableTexts).toContain('Needs work')
    expect(editableTexts).not.toContain('Deck chrome')
    expect(editableTexts).not.toContain('Presenter notes')

    const backgroundNode = Object.values(deck.nodes).find(
      (node) => node.kind === 'image' && node.image.alt === '背景图',
    )
    expect(backgroundNode).toMatchObject({
      kind: 'image',
      image: {
        src: '/assets/bg.png',
        alt: '背景图',
      },
    })
  })
})

describe('deck patch helpers', () => {
  it('previews a text patch without mutating the source document', () => {
    const document = createDeckDocument(sampleDeck)

    const preview = previewDeckPatch(document, {
      type: 'text',
      nodeId: 'text-hero',
      html: 'Preview <em>copy</em>',
      fontSize: '48px',
    })

    expect(document.querySelector('[data-node-id="text-hero"]')?.innerHTML.trim()).toBe(
      'Hello <strong>world</strong>',
    )
    expect(preview.deck.nodes['text-hero']).toMatchObject({
      kind: 'text',
      html: 'Preview <em>copy</em>',
    })
    expect(preview.html).toContain('Preview <em>copy</em>')
    expect(preview.html).toContain('font-size: 48px;')
  })

  it('keeps paragraph text nodes readable after patching TipTap paragraph html', () => {
    const document = createDeckDocument(`<!doctype html>
<html lang="en" data-fs-editable-deck="1">
  <body>
    <section class="slide" data-slide-id="slide-1">
      <p data-node-id="body-copy" data-edit-kind="text">Original paragraph</p>
    </section>
  </body>
</html>`)

    patchText(document, 'body-copy', {
      html: '<p>Updated <strong>paragraph</strong></p>',
    })
    const reparsedDocument = createDeckDocument(serializeDeck(document))
    const reparsedDeck = parseControlledDeck(reparsedDocument)
    const reparsedNode = reparsedDocument.querySelector('[data-node-id="body-copy"]')

    expect(reparsedNode?.textContent).toBe('Updated paragraph')
    expect(reparsedDeck.nodes['body-copy']).toMatchObject({
      kind: 'text',
      html: 'Updated <strong>paragraph</strong>',
      label: 'Updated paragraph',
    })
  })

  it('applies text style, image, layout, component slot, and motion patches through one API', () => {
    const document = createDeckDocument(sampleDeck)

    applyDeckPatch(document, {
      type: 'text-style',
      nodeId: 'text-hero',
      style: {
        color: '#ff0000',
        fontWeight: '800',
      },
    })
    applyDeckPatch(document, {
      type: 'image',
      nodeId: 'image-1',
      dataUrl: 'data:image/png;base64,patched',
      alt: 'Patched image',
    })
    applyDeckPatch(document, {
      type: 'layout',
      nodeId: 'image-1',
      layout: {
        mode: 'floating',
        x: 80,
        y: 90,
        width: 400,
        height: 240,
        zIndex: 4,
      },
    })
    applyDeckPatch(document, {
      type: 'component-slot',
      nodeId: 'card-1',
      slotKey: 'title',
      value: 'Updated slot',
    })
    const result = applyDeckPatch(document, {
      type: 'motion',
      nodeId: 'text-hero',
      enabled: false,
      duration: 1200,
      delay: 300,
    })

    expect(result.deck.nodes['text-hero']).toMatchObject({
      kind: 'text',
      motion: {
        enabled: false,
        duration: 1200,
        delay: 300,
      },
    })
    expect(readTextStyle(document, 'text-hero')).toMatchObject({
      color: '#ff0000',
      fontWeight: '800',
    })
    expect(document.querySelector('[data-node-id="image-1"] img')?.getAttribute('src')).toBe(
      'data:image/png;base64,patched',
    )
    expect(document.querySelector('[data-node-id="image-1"] img')?.getAttribute('alt')).toBe(
      'Patched image',
    )
    expect(parseControlledDeck(document).nodes['image-1'].layout).toMatchObject({
      mode: 'floating',
      x: 80,
      y: 90,
      width: 400,
      height: 240,
      zIndex: 4,
    })
    expect(document.querySelector('[data-slot-key="title"]')?.textContent).toBe('Updated slot')
  })

  it('rejects a patch when the target node kind does not match the operation', () => {
    const document = createDeckDocument(sampleDeck)

    expect(() =>
      applyDeckPatch(document, {
        type: 'image',
        nodeId: 'text-hero',
        dataUrl: 'data:image/png;base64,wrong',
        alt: 'Wrong target',
      }),
    ).toThrow('Expected node "text-hero" to be of kind "image"')
  })

  it('validates patches before mutating the source document', () => {
    const document = createDeckDocument(sampleDeck)

    expect(() =>
      applyDeckPatch(document, {
        type: 'text-style',
        nodeId: 'text-hero',
        style: {
          fontSize: 'javascript:alert(1)',
        },
      }),
    ).toThrow('Invalid style value "javascript:alert(1)" for "font-size"')
    expect(() =>
      applyDeckPatch(document, {
        type: 'component-slot',
        nodeId: 'card-1',
        slotKey: 'missing',
        value: 'No slot',
      }),
    ).toThrow('Expected slot "missing" on node "card-1"')
    expect(parseControlledDeck(document).nodes['text-hero']).toMatchObject({
      kind: 'text',
      html: 'Hello <strong>world</strong>',
    })
  })

  it('previews and applies node state patches through the unified patch API', () => {
    const document = createDeckDocument(sampleDeck)

    const preview = previewDeckPatch(document, {
      type: 'node-state',
      nodeId: 'text-hero',
      locked: true,
      hidden: true,
    })

    expect(parseControlledDeck(document).nodes['text-hero']).toMatchObject({
      locked: false,
      hidden: false,
    })
    expect(preview.deck.nodes['text-hero']).toMatchObject({
      locked: true,
      hidden: true,
      capabilities: {
        canEditText: false,
        canDelete: false,
      },
    })

    const result = applyDeckPatch(document, {
      type: 'node-state',
      nodeId: 'text-hero',
      locked: false,
      hidden: true,
    })

    expect(result.deck.nodes['text-hero']).toMatchObject({
      locked: false,
      hidden: true,
    })
    expect(document.querySelector<HTMLElement>('[data-node-id="text-hero"]')?.hidden).toBe(true)
  })

  it('accepts a local text patch candidate without changing unrelated slides', () => {
    const document = createDeckDocument(sampleDeck)

    const preview = previewDeckPatch(document, {
      type: 'text',
      nodeId: 'text-hero',
      html: 'Local edit candidate',
    })

    expect(preview.deck.nodes['text-hero']).toMatchObject({
      kind: 'text',
      html: 'Local edit candidate',
    })
    expect(preview.deck.nodes['text-2']).toMatchObject({
      kind: 'text',
      html: 'Slide two',
    })

    const result = applyDeckPatch(document, {
      type: 'text',
      nodeId: 'text-hero',
      html: 'Local edit candidate',
    })

    expect(result.deck.nodes['text-hero']).toMatchObject({
      kind: 'text',
      html: 'Local edit candidate',
    })
    expect(result.deck.nodes['text-2']).toMatchObject({
      kind: 'text',
      html: 'Slide two',
    })
  })

  it('updates text nodes and font size without disturbing markup', () => {
    const document = createDeckDocument(sampleDeck)

    patchText(document, 'text-hero', {
      html: 'Updated <em>copy</em>',
      fontSize: 'clamp(2rem, 5vw, 4rem)',
    })

    const node = document.querySelector('[data-node-id="text-hero"]')
    expect(node?.innerHTML).toBe('Updated <em>copy</em>')
    expect(node?.getAttribute('style')).toContain('font-size: clamp(2rem, 5vw, 4rem);')
  })

  it('persists floating layout for text and component nodes without dropping existing styles', () => {
    const document = createDeckDocument(sampleDeck)

    patchTextStyle(document, 'text-hero', {
      color: '#123456',
      fontWeight: '700',
    })
    patchObjectLayout(document, 'text-hero', {
      mode: 'floating',
      x: 40,
      y: 60,
      width: 420,
      height: 120,
    })
    patchObjectLayout(document, 'card-1', {
      mode: 'floating',
      x: 500,
      y: 140,
      width: 320,
      height: 200,
    })

    const textNode = document.querySelector<HTMLElement>('[data-node-id="text-hero"]')
    const componentNode = document.querySelector<HTMLElement>('[data-node-id="card-1"]')
    expect(textNode?.getAttribute('style')).toContain('color: #123456;')
    expect(textNode?.getAttribute('style')).toContain('font-weight: 700;')
    expect(textNode?.getAttribute('style')).toContain('left: 40px;')
    expect(componentNode?.dataset.editorObject).toBe('true')
    expect(componentNode?.getAttribute('style')).toContain('top: 140px;')

    const deck = parseControlledDeck(document)
    expect(deck.nodes['text-hero']).toMatchObject({
      kind: 'text',
      layout: {
        mode: 'floating',
        x: 40,
        y: 60,
        width: 420,
        height: 120,
      },
    })
    expect(deck.nodes['card-1']).toMatchObject({
      kind: 'component',
      layout: {
        mode: 'floating',
        x: 500,
        y: 140,
        width: 320,
        height: 200,
      },
    })
  })

  it('persists floating object layer metadata and clears it when returning to flow layout', () => {
    const document = createDeckDocument(sampleDeck)

    patchObjectLayout(document, 'text-hero', {
      mode: 'floating',
      x: 40,
      y: 60,
      width: 420,
      height: 120,
      zIndex: 7,
    })

    const floatingNode = document.querySelector<HTMLElement>('[data-node-id="text-hero"]')
    expect(floatingNode?.dataset.editorZ).toBe('7')
    expect(floatingNode?.getAttribute('style')).toContain('z-index: 7;')
    expect(parseControlledDeck(document).nodes['text-hero'].layout).toMatchObject({
      mode: 'floating',
      zIndex: 7,
    })

    patchObjectLayout(document, 'text-hero', {
      mode: 'flow',
      x: null,
      y: null,
      width: null,
      height: null,
    })

    const flowNode = document.querySelector<HTMLElement>('[data-node-id="text-hero"]')
    expect(flowNode?.dataset.editorZ).toBeUndefined()
    expect(flowNode?.getAttribute('style') ?? '').not.toContain('z-index')
  })

  it('moves editable object layers within the current slide only', () => {
    const document = createDeckDocument(sampleDeck)

    patchObjectLayout(document, 'image-1', {
      mode: 'floating',
      x: 60,
      y: 80,
      width: 260,
      height: 160,
      zIndex: 3,
    })

    patchObjectLayer(document, 'image-1', 'back')

    const textHero = document.querySelector<HTMLElement>('[data-node-id="text-hero"]')
    const card = document.querySelector<HTMLElement>('[data-node-id="card-1"]')
    const image = document.querySelector<HTMLElement>('[data-node-id="image-1"]')
    const slideTwoText = document.querySelector<HTMLElement>('[data-node-id="text-2"]')

    expect(parseControlledDeck(document).nodes['image-1'].layout).toMatchObject({
      mode: 'floating',
      zIndex: 1,
    })
    expect(image?.dataset.editorZ).toBe('1')
    expect(image?.getAttribute('style')).toContain('position: absolute;')
    expect(image?.getAttribute('style')).toContain('z-index: 1;')
    expect(textHero?.dataset.editorZ).toBe('2')
    expect(textHero?.getAttribute('style')).toContain('position: relative;')
    expect(textHero?.getAttribute('style')).toContain('z-index: 2;')
    expect(card?.dataset.editorZ).toBe('3')
    expect(card?.getAttribute('style')).toContain('position: relative;')
    expect(card?.getAttribute('style')).toContain('z-index: 3;')
    expect(slideTwoText?.dataset.editorZ).toBeUndefined()
    expect(slideTwoText?.getAttribute('style') ?? '').not.toContain('z-index')
  })

  it('moves editable object layers one step at a time', () => {
    const document = createDeckDocument(sampleDeck)

    patchObjectLayout(document, 'image-1', {
      mode: 'floating',
      x: 60,
      y: 80,
      width: 260,
      height: 160,
      zIndex: 3,
    })

    patchObjectLayer(document, 'image-1', 'backward')

    expect(document.querySelector<HTMLElement>('[data-node-id="text-hero"]')?.dataset.editorZ).toBe('1')
    expect(document.querySelector<HTMLElement>('[data-node-id="image-1"]')?.dataset.editorZ).toBe('2')
    expect(document.querySelector<HTMLElement>('[data-node-id="card-1"]')?.dataset.editorZ).toBe('3')

    patchObjectLayer(document, 'image-1', 'forward')

    expect(document.querySelector<HTMLElement>('[data-node-id="text-hero"]')?.dataset.editorZ).toBe('1')
    expect(document.querySelector<HTMLElement>('[data-node-id="card-1"]')?.dataset.editorZ).toBe('2')
    expect(document.querySelector<HTMLElement>('[data-node-id="image-1"]')?.dataset.editorZ).toBe('3')
  })

  it('reads and patches serialized text styles for text nodes and component slots', () => {
    const document = createDeckDocument(sampleDeck)

    patchTextStyle(document, 'text-hero', {
      fontFamily: '"Satoshi", sans-serif',
      fontSize: '42px',
      fontWeight: '700',
      fontStyle: 'italic',
      textDecoration: 'underline',
      color: '#d95d39',
      textAlign: 'center',
      lineHeight: '1.4',
      letterSpacing: '0.08em',
    })
    patchComponentSlotStyle(document, 'card-1', 'title', {
      color: '#715f59',
      fontSize: '28px',
      textAlign: 'right',
    })

    expect(readTextStyle(document, 'text-hero')).toEqual({
      fontFamily: '"Satoshi", sans-serif',
      fontSize: '42px',
      fontWeight: '700',
      fontStyle: 'italic',
      textDecoration: 'underline',
      color: '#d95d39',
      textAlign: 'center',
      lineHeight: '1.4',
      letterSpacing: '0.08em',
    })
    expect(readTextStyle(document, 'card-1', 'title')).toEqual({
      fontFamily: '',
      fontSize: '28px',
      fontWeight: '',
      fontStyle: '',
      textDecoration: '',
      color: '#715f59',
      textAlign: 'right',
      lineHeight: '',
      letterSpacing: '',
    })
  })

  it('updates a declared component slot only', () => {
    const document = createDeckDocument(sampleDeck)

    patchComponentSlot(document, 'card-1', 'body', 'Revised body copy')

    expect(
      document.querySelector('[data-node-id="card-1"] [data-slot-key="body"]')?.textContent,
    ).toBe('Revised body copy')
    expect(
      document.querySelector('[data-node-id="card-1"] [data-slot-key="title"]')?.textContent,
    ).toBe('Quarterly review')
  })

  it('replaces an image src and alt text', () => {
    const document = createDeckDocument(sampleDeck)

    replaceImage(document, 'image-1', {
      dataUrl: 'data:image/png;base64,new',
      alt: 'Updated cover',
      assetId: 'asset-new',
    })

    const image = document.querySelector('[data-node-id="image-1"] img')
    expect(image?.getAttribute('src')).toBe('data:image/png;base64,new')
    expect(image?.getAttribute('alt')).toBe('Updated cover')
    expect(image?.getAttribute('data-asset-id')).toBe('asset-new')
    expect(parseControlledDeck(document).nodes['image-1']).toMatchObject({
      resources: [
        {
          assetId: 'asset-new',
        },
      ],
    })
  })

  it('persists floating image layout into data attributes and inline styles', () => {
    const document = createDeckDocument(sampleDeck)

    patchObjectLayout(document, 'image-1', {
      mode: 'floating',
      x: 120,
      y: 80,
      width: 360,
      height: 240,
    })

    const imageNode = document.querySelector<HTMLElement>('[data-node-id="image-1"]')
    expect(imageNode?.dataset.editorObject).toBe('true')
    expect(imageNode?.dataset.editorX).toBe('120')
    expect(imageNode?.dataset.editorY).toBe('80')
    expect(imageNode?.dataset.editorWidth).toBe('360')
    expect(imageNode?.dataset.editorHeight).toBe('240')
    expect(imageNode?.getAttribute('style')).toContain('position: absolute;')
    expect(imageNode?.getAttribute('style')).toContain('left: 120px;')
    expect(imageNode?.getAttribute('style')).toContain('top: 80px;')
    expect(imageNode?.getAttribute('style')).toContain('width: 360px;')
    expect(imageNode?.getAttribute('style')).toContain('height: 240px;')

    const deck = parseControlledDeck(document)
    expect(deck.nodes['image-1']).toMatchObject({
      kind: 'image',
      layout: {
        mode: 'floating',
        x: 120,
        y: 80,
        width: 360,
        height: 240,
      },
    })
  })

  it('updates motion flags and timing while preserving the existing motion name', () => {
    const document = createDeckDocument(sampleDeck)

    patchMotion(document, 'text-hero', {
      enabled: false,
      duration: 900,
      delay: 180,
    })

    const node = document.querySelector('[data-node-id="text-hero"]')
    expect(node?.getAttribute('data-motion-name')).toBe('fade-up')
    expect(node?.getAttribute('data-motion-enabled')).toBe('false')
    expect(node?.getAttribute('data-motion-duration')).toBe('900')
    expect(node?.getAttribute('data-motion-delay')).toBe('180')
  })
})

describe('serializeDeck', () => {
  it('removes editor-only attributes while keeping re-import markers intact', () => {
    const document = createDeckDocument(sampleDeck)
    const editableNode = document.querySelector('[data-node-id="text-hero"]')

    editableNode?.classList.add('is-selected')
    editableNode?.setAttribute('data-editor-hover', 'true')

    const html = serializeDeck(document)

    expect(html).toContain('data-fs-editable-deck="1"')
    expect(html).toContain('data-node-id="text-hero"')
    expect(html).not.toContain('is-selected')
    expect(html).not.toContain('data-editor-hover=')
  })
})

describe('AI element anchors', () => {
  it('uses an existing editable node id as the stable AI selector', () => {
    const document = createDeckDocument(sampleDeck)

    const result = ensureAiElementAnchor(document, {
      slideId: 'slide-1',
      selector: '[data-node-id="text-hero"]',
      elementTag: 'div',
      elementText: 'Hello world',
    })

    expect(result).toEqual({
      selector: 'section.slide[data-slide-id="slide-1"] [data-node-id="text-hero"]',
      anchorId: 'text-hero',
      changed: false,
    })
  })

  it('adds a stable AI anchor to an unmarked content element', () => {
    const document = createDeckDocument(`<!doctype html>
<html data-fs-editable-deck="1">
  <body>
    <section class="slide" data-slide-id="slide-1" id="slide-1">
      <div data-node-id="card-1" data-edit-kind="component">
        <span class="metric">42%</span>
      </div>
    </section>
  </body>
</html>`)

    const result = ensureAiElementAnchor(document, {
      slideId: 'slide-1',
      selector: '.metric',
      elementTag: 'span',
      elementText: '42%',
    })

    expect(result).toEqual({
      selector: 'section.slide[data-slide-id="slide-1"] [data-ai-anchor-id="selected-span"]',
      anchorId: 'selected-span',
      changed: true,
    })
    expect(document.querySelector('.metric')?.getAttribute('data-ai-anchor-id')).toBe('selected-span')
  })

  it('rejects deck scaffold elements for AI anchoring', () => {
    const document = createDeckDocument(sampleDeck)

    expect(() =>
      ensureAiElementAnchor(document, {
        slideId: 'slide-1',
        selector: 'section.slide[data-slide-id="slide-1"]',
      }),
    ).toThrow('不能锚定页面骨架元素')
  })
})

describe('slide helpers', () => {
  it('appends a new image node to a slide with stable editable markers', () => {
    const document = createDeckDocument(sampleDeck)

    createImageNode(document, 'slide-1', {
      nodeId: 'image-2',
      dataUrl: 'data:image/png;base64,inserted',
      alt: 'Inserted image',
      assetId: 'asset-inserted',
      layout: {
        mode: 'floating',
        x: 160,
        y: 120,
        width: 320,
        height: 180,
      },
    })

    const inserted = document.querySelector('[data-node-id="image-2"]')
    expect(inserted?.getAttribute('data-edit-kind')).toBe('image')
    expect(inserted?.getAttribute('data-asset-id')).toBe('asset-inserted')
    expect(inserted?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,inserted')
    expect(inserted?.querySelector('img')?.getAttribute('style')).toContain('object-fit: contain;')
    expect(inserted?.getAttribute('data-editor-object')).toBe('true')
    expect(inserted?.getAttribute('style')).toContain('left: 160px;')
  })

  it('reorders slides by id', () => {
    const document = createDeckDocument(sampleDeck)

    reorderSlides(document, 'slide-2', 'slide-1')

    const order = Array.from(document.querySelectorAll('section.slide')).map((slide) =>
      slide.getAttribute('data-slide-id'),
    )
    expect(order).toEqual(['slide-2', 'slide-1'])
  })

  it('duplicates a slide and rewrites slide and node ids', () => {
    const document = createDeckDocument(sampleDeck)

    const duplicateId = duplicateSlide(document, 'slide-1')

    const duplicate = document.querySelector(`section.slide[data-slide-id="${duplicateId}"]`)
    expect(duplicateId).toBe('slide-1-copy')
    expect(duplicate).not.toBeNull()
    expect(duplicate?.querySelector('[data-node-id="text-hero-copy"]')).not.toBeNull()
  })

  it('removes a slide by id', () => {
    const document = createDeckDocument(sampleDeck)

    removeSlide(document, 'slide-2')

    const order = Array.from(document.querySelectorAll('section.slide')).map((slide) =>
      slide.getAttribute('data-slide-id'),
    )
    expect(order).toEqual(['slide-1'])
  })

  it('removes a node by id without affecting sibling editable nodes', () => {
    const document = createDeckDocument(sampleDeck)

    removeNode(document, 'image-1')

    expect(document.querySelector('[data-node-id="image-1"]')).toBeNull()
    expect(document.querySelector('[data-node-id="text-hero"]')).not.toBeNull()
  })

  it('forces html-ppt static view visibility onto the selected slide before capture', () => {
    const document = createDeckDocument(adaptImportedHtmlToDeck(importedHtmlPptDeck))

    const firstSlide = document.querySelector<HTMLElement>('section.slide[data-slide-id="slide-1"]')
    const secondSlide = document.querySelector<HTMLElement>('section.slide[data-slide-id="slide-2"]')

    expect(firstSlide).not.toBeNull()
    expect(secondSlide).not.toBeNull()

    prepareSlideForStaticView(document, 'slide-2')

    expect(firstSlide?.classList.contains('is-active')).toBe(false)
    expect(secondSlide?.classList.contains('is-active')).toBe(true)
    expect(secondSlide?.getAttribute('data-preview-static')).toBe('true')
    expect(secondSlide?.getAttribute('style')).toContain('opacity: 1;')
    expect(secondSlide?.getAttribute('style')).toContain('pointer-events: auto;')
    expect(firstSlide?.getAttribute('style')).toContain('opacity: 0;')
  })

  it('forces stagger-list children into their final visible state for html-ppt static capture', () => {
    const document = createDeckDocument(`<!doctype html>
<html lang="en" data-fs-editable-deck="1" data-fs-deck-profile="html-ppt">
  <body>
    <div class="deck">
      <section class="slide" data-slide-id="slide-1" id="slide-1">
        <main>
          <div class="stack" data-anim="stagger-list">
            <div class="agenda-row">01</div>
            <div class="agenda-row">02</div>
          </div>
          <div class="list anim-stagger-list">
            <div class="agenda-row">03</div>
          </div>
        </main>
      </section>
    </div>
  </body>
</html>`)

    prepareSlideForStaticView(document, 'slide-1')

    const staggerChild = document.querySelector<HTMLElement>('[data-anim="stagger-list"] > .agenda-row')
    const animatedChild = document.querySelector<HTMLElement>('.anim-stagger-list > .agenda-row')
    expect(staggerChild?.getAttribute('style')).toContain('opacity: 1;')
    expect(staggerChild?.getAttribute('style')).toContain('animation: none;')
    expect(animatedChild?.getAttribute('style')).toContain('opacity: 1;')
    expect(animatedChild?.getAttribute('style')).toContain('animation: none;')
  })
})
