import { describe, expect, it } from 'vitest'

import {
  EXPORT_VIEWPORT_HEIGHT,
  EXPORT_VIEWPORT_WIDTH,
  createHiddenExportFrame,
} from './exportFrame'

describe('exportFrame helpers', () => {
  it('creates hidden export frames with the default viewport size', () => {
    const iframe = createHiddenExportFrame()

    expect(iframe.width).toBe(String(EXPORT_VIEWPORT_WIDTH))
    expect(iframe.height).toBe(String(EXPORT_VIEWPORT_HEIGHT))
    expect(iframe.style.width).toBe(`${EXPORT_VIEWPORT_WIDTH}px`)
    expect(iframe.style.height).toBe(`${EXPORT_VIEWPORT_HEIGHT}px`)
  })

  it('creates hidden export frames with a requested canvas size', () => {
    const iframe = createHiddenExportFrame({
      width: 810,
      height: 1080,
    })

    expect(iframe.width).toBe('810')
    expect(iframe.height).toBe('1080')
    expect(iframe.style.width).toBe('810px')
    expect(iframe.style.height).toBe('1080px')
  })
})
