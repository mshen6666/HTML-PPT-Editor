import { describe, expect, it } from 'vitest'

import {
  auditHtmlPptLayout,
  normalizeHtmlPptLayoutContract,
} from './htmlPptLayoutAudit'

describe('normalizeHtmlPptLayoutContract', () => {
  it('sets the default 16:9 editor canvas for standard decks', () => {
    const html = normalizeHtmlPptLayoutContract(`<!doctype html>
<html lang="zh-CN">
  <head><title>Deck</title></head>
  <body><section class="slide"><h1>Title</h1></section></body>
</html>`)

    expect(html).toContain('data-fs-canvas-width="1280"')
    expect(html).toContain('data-fs-canvas-height="720"')
    expect(html).toContain('data-slide-id="slide-1"')
  })

  it('preserves the xhs portrait canvas exception', () => {
    const html = normalizeHtmlPptLayoutContract(`<!doctype html>
<html lang="zh-CN" data-fs-canvas-width="810" data-fs-canvas-height="1080">
  <head><title>XHS</title></head>
  <body class="tpl-xhs-post"><section class="slide" data-slide-id="cover"><h1>Cover</h1></section></body>
</html>`)

    expect(html).toContain('data-fs-canvas-width="810"')
    expect(html).toContain('data-fs-canvas-height="1080"')
    expect(html).toContain('data-slide-id="cover"')
  })
})

describe('auditHtmlPptLayout', () => {
  it('warns when a standard deck uses a 1920 by 1080 canvas contract', () => {
    const warnings = auditHtmlPptLayout(`<!doctype html>
<html data-fs-canvas-width="1920" data-fs-canvas-height="1080">
  <head><style>.slide{width:1920px;height:1080px}</style></head>
  <body><section class="slide" data-slide-id="slide-1"><h1>Title</h1></section></body>
</html>`)

    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'canvas-size-mismatch',
      }),
      expect.objectContaining({
        code: 'legacy-fixed-canvas',
      }),
    ]))
  })

  it('warns for high-risk dense slide content', () => {
    const longList = Array.from({ length: 11 }, (_, index) => `<li>Item ${index + 1}</li>`).join('')
    const longText = '这是一段很长的正文'.repeat(90)
    const warnings = auditHtmlPptLayout(`<!doctype html>
<html>
  <body>
    <section class="slide" data-slide-id="dense">
      <h2>Dense</h2>
      <p>${longText}</p>
      <ul>${longList}</ul>
      <div style="overflow:auto">Scrollable details</div>
    </section>
  </body>
</html>`)

    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'dense-text',
        slideId: 'dense',
        slideIndex: 1,
      }),
      expect.objectContaining({
        code: 'long-list',
        slideId: 'dense',
        slideIndex: 1,
      }),
      expect.objectContaining({
        code: 'scrollable-content',
        slideId: 'dense',
        slideIndex: 1,
      }),
    ]))
  })
})
