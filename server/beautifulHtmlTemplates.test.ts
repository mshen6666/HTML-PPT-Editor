// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { buildBeautifulTemplatePreviewHtml } from './beautifulHtmlTemplates'

describe('buildBeautifulTemplatePreviewHtml', () => {
  it('extracts the first div.slide from templates that do not use section slides', () => {
    const preview = buildBeautifulTemplatePreviewHtml({
      slug: 'blue-professional',
      html: `<!doctype html>
<html>
<head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>.slide{display:none}.slide.active{display:block}.cover{color:blue}</style>
</head>
<body>
<div class="deck">
  <div class="slide layout-cover active"><h1>Cover</h1></div>
  <div class="slide"><h1>Second</h1></div>
</div>
</body>
</html>`,
    })

    expect(preview).toContain('blue-professional Preview')
    expect(preview).toContain('https://fonts.googleapis.com/css2?family=Inter')
    expect(preview).toContain('<div class="slide layout-cover active is-active" data-slide-id="beautiful-blue-professional-slide-1"><h1>Cover</h1></div>')
    expect(preview).not.toContain('Second')
    expect(preview).not.toContain('chart.js')
  })

  it('extracts direct deck-stage section children without requiring the slide class', () => {
    const preview = buildBeautifulTemplatePreviewHtml({
      slug: 'editorial-forest',
      html: `<!doctype html>
<html>
<head><style>.cover{background:green}</style></head>
<body>
<deck-stage aspect="1920/1080">
  <section class="cover" data-screen-label="01 Cover"><h1>Forest</h1></section>
  <section class="agenda"><h2>Agenda</h2></section>
</deck-stage>
</body>
</html>`,
    })

    expect(preview).toContain('<section class="cover is-active" data-screen-label="01 Cover" data-slide-id="beautiful-editorial-forest-slide-1"><h1>Forest</h1></section>')
    expect(preview).toMatch(/\.beautiful-template-preview-stage>section,\s*\.beautiful-template-preview-stage>div\{[\s\S]*width:100vw!important[\s\S]*height:100vh!important/)
    expect(preview).not.toContain('Agenda')
  })
})
