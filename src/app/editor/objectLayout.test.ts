import { describe, expect, it } from 'vitest'

import {
  createCenteredImageLayout,
  resolveDraggedObjectLayout,
  resolveResizedObjectLayout,
} from './objectLayout'

describe('objectLayout', () => {
  it('centers uploaded images after fitting them within the viewport', () => {
    expect(createCenteredImageLayout(1280, 720, { width: 1200, height: 1200 })).toEqual({
      mode: 'floating',
      x: 442,
      y: 162,
      width: 396,
      height: 396,
    })
  })

  it('clamps dragged objects inside the viewport', () => {
    const layout = { mode: 'floating', x: 100, y: 100, width: 200, height: 120 } as const

    expect(resolveDraggedObjectLayout(layout, -500, 800, 640, 360)).toEqual({
      ...layout,
      x: 0,
      y: 240,
    })
  })

  it('preserves aspect ratio while resizing from a corner handle', () => {
    const layout = { mode: 'floating', x: 100, y: 80, width: 320, height: 180 } as const

    expect(resolveResizedObjectLayout(layout, 'se', 80, 20, 640, 360)).toEqual({
      ...layout,
      width: 400,
      height: 225,
    })
  })
})
