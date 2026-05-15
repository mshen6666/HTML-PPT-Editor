import { describe, expect, it } from 'vitest'

import { resolveCanvasDimensions } from './previewLayout'
import { createDeckDocument } from '../deck-contract/deckContract'

describe('resolveCanvasDimensions', () => {
  it('falls back to the default editor canvas when the deck does not declare dimensions', () => {
    const document = createDeckDocument(`<!doctype html>
<html data-fs-editable-deck="1">
  <body>
    <section class="slide" data-slide-id="slide-1"></section>
  </body>
</html>`)

    expect(resolveCanvasDimensions(document)).toEqual({
      width: 1280,
      height: 720,
    })
  })

  it('uses the explicit canvas dimensions declared on the deck root', () => {
    const document = createDeckDocument(`<!doctype html>
<html data-fs-editable-deck="1" data-fs-canvas-width="810" data-fs-canvas-height="1080">
  <body>
    <section class="slide" data-slide-id="slide-1"></section>
  </body>
</html>`)

    expect(resolveCanvasDimensions(document)).toEqual({
      width: 810,
      height: 1080,
    })
  })

  it('infers the portrait canvas for xhs decks when explicit dimensions are absent', () => {
    const document = createDeckDocument(`<!doctype html>
<html data-fs-editable-deck="1">
  <head>
    <style>
      .tpl-xhs-post .deck { width: 810px; height: 1080px; }
    </style>
  </head>
  <body class="tpl-xhs-post">
    <section class="slide" data-slide-id="slide-1"></section>
  </body>
</html>`)

    expect(resolveCanvasDimensions(document)).toEqual({
      width: 810,
      height: 1080,
    })
  })
})
