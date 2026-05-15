import { describe, expect, it, vi } from 'vitest'

import {
  EXPORT_IMAGE_PIXEL_RATIO,
  EXPORT_VIEWPORT_HEIGHT,
  EXPORT_VIEWPORT_WIDTH,
  PPTX_HEIGHT_INCHES,
  PPTX_MIME_TYPE,
  PPTX_WIDTH_INCHES,
  ensureStaticCaptureStyles,
  resolvePptxSlideSize,
  savePptxBlob,
  pxToInches,
  waitForExportDocumentReady,
} from './exportDeckToPptx'

describe('exportDeckToPptx helpers', () => {
  it('captures slide screenshots at a higher-than-screen pixel ratio for sharper exports', () => {
    expect(EXPORT_IMAGE_PIXEL_RATIO).toBe(2)
  })

  it('converts viewport pixels into ppt inches', () => {
    expect(pxToInches(EXPORT_VIEWPORT_WIDTH / 2, EXPORT_VIEWPORT_WIDTH, PPTX_WIDTH_INCHES)).toBeCloseTo(
      PPTX_WIDTH_INCHES / 2,
      4,
    )
    expect(
      pxToInches(EXPORT_VIEWPORT_HEIGHT / 2, EXPORT_VIEWPORT_HEIGHT, PPTX_HEIGHT_INCHES),
    ).toBeCloseTo(PPTX_HEIGHT_INCHES / 2, 4)
  })

  it('keeps 16:9 decks on the standard wide pptx slide size', () => {
    expect(resolvePptxSlideSize({ width: 1280, height: 720 })).toEqual({
      width: PPTX_WIDTH_INCHES,
      height: PPTX_HEIGHT_INCHES,
    })
  })

  it('matches pptx slide size to portrait deck canvas ratios', () => {
    expect(resolvePptxSlideSize({ width: 810, height: 1080 })).toEqual({
      width: 5.625,
      height: PPTX_HEIGHT_INCHES,
    })
  })

  it('matches pptx slide size to extra-wide deck canvas ratios', () => {
    expect(resolvePptxSlideSize({ width: 1920, height: 720 })).toEqual({
      width: PPTX_WIDTH_INCHES,
      height: 5,
    })
  })

  it('waits for an iframe load that actually contains the editable deck root', async () => {
    const iframe = document.createElement('iframe')
    let currentDocument = document.implementation.createHTMLDocument('blank')

    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      get: () => currentDocument,
    })

    const readyPromise = waitForExportDocumentReady(iframe, 1000)

    iframe.dispatchEvent(new Event('load'))
    await Promise.resolve()

    currentDocument = document.implementation.createHTMLDocument('deck')
    currentDocument.documentElement.setAttribute('data-fs-editable-deck', '1')
    iframe.dispatchEvent(new Event('load'))

    await expect(readyPromise).resolves.toBe(currentDocument)
  })

  it('downloads pptx blobs with the office mime type and pptx extension', () => {
    const blob = new Blob(['demo'], { type: PPTX_MIME_TYPE })
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.fn()
    const anchor = {
      href: '',
      download: '',
      click,
    } as unknown as HTMLAnchorElement
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    savePptxBlob(blob, 'Deck Export')

    expect(anchor.href).toBe('blob:test')
    expect(anchor.download).toBe('Deck Export.pptx')
    expect(click).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')

    createElement.mockRestore()
    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
  })

  it('injects static capture styles that force reveal content into the final visible state', () => {
    const document = window.document.implementation.createHTMLDocument('deck')

    ensureStaticCaptureStyles(document)

    const styleTag = document.head.querySelector('[data-pptx-static-capture="true"]')
    expect(styleTag).not.toBeNull()
    expect(styleTag?.textContent).toContain('[data-preview-static="true"] .reveal')
    expect(styleTag?.textContent).toContain('opacity: 1 !important;')
    expect(styleTag?.textContent).toContain('transition: none !important;')
  })

  it('injects html-ppt capture styles for active-slide animations, bars, and path drawing', () => {
    const document = window.document.implementation.createHTMLDocument('deck')

    ensureStaticCaptureStyles(document)

    const styleTag = document.head.querySelector('[data-pptx-static-capture="true"]')
    expect(styleTag?.textContent).toContain('.slide.is-active [data-anim]')
    expect(styleTag?.textContent).toContain('.slide.is-active .stagger > *')
    expect(styleTag?.textContent).toContain('.slide.is-active .path-draw path')
    expect(styleTag?.textContent).toContain('[data-preview-static="true"] .bar-fill')
    expect(styleTag?.textContent).toContain('.slide.is-active .bar-fill')
  })

  it('injects html-ppt capture styles for stagger-list children used by agenda and grid layouts', () => {
    const document = window.document.implementation.createHTMLDocument('deck')

    ensureStaticCaptureStyles(document)

    const styleTag = document.head.querySelector('[data-pptx-static-capture="true"]')
    expect(styleTag?.textContent).toContain('.slide.is-active [data-anim="stagger-list"] > *')
    expect(styleTag?.textContent).toContain('[data-preview-static="true"] [data-anim="stagger-list"] > *')
    expect(styleTag?.textContent).toContain('.slide.is-active .anim-stagger-list > *')
    expect(styleTag?.textContent).toContain('[data-preview-static="true"] .anim-stagger-list > *')
  })
})
