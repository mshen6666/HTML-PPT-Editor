import { describe, expect, it } from 'vitest'

import {
  createHtmlPptFallbackHtml,
  createHtmlPptHtmlInstructions,
} from './frontendSlides'

const defaultHtmlPptBrief = {
  audience: 'engineers',
  format: 'live',
  themeName: 'tokyo-night',
  fullDeckName: 'tech-sharing',
  includeNotes: true,
  preserveRuntime: true,
  slideCountHint: 3,
} as const

describe('createHtmlPptHtmlInstructions', () => {
  it('describes the fixed 16:9 editor canvas and content budget', () => {
    const instructions = createHtmlPptHtmlInstructions(defaultHtmlPptBrief)

    expect(instructions).toContain('1280x720')
    expect(instructions).toContain('1120x600')
    expect(instructions).toContain('Do not use scrollable slide content')
  })
})

describe('createHtmlPptFallbackHtml', () => {
  it('uses a fixed 16:9 canvas instead of viewport-height slides for standard fallback decks', () => {
    const fallback = createHtmlPptFallbackHtml('生成一份产品发布演示', defaultHtmlPptBrief, {
      targetSlideCount: 2,
    })

    expect(fallback.html).toContain('data-fs-canvas-width="1280"')
    expect(fallback.html).toContain('data-fs-canvas-height="720"')
    expect(fallback.html).toContain('width: 1280px;')
    expect(fallback.html).toContain('height: 720px;')
    expect(fallback.html).not.toContain('width: 100vw;')
    expect(fallback.html).not.toContain('height: 100vh;')
  })
})
