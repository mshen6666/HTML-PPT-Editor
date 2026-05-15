import PptxGenJS from 'pptxgenjs'
import { toPng } from 'html-to-image'

import { resolveCanvasDimensions } from '../app/previewLayout'
import { createDeckDocument, parseControlledDeck, prepareSlideForStaticView } from '../deck-contract/deckContract'
import {
  createExportFrame,
  EXPORT_LOAD_TIMEOUT_MS,
  type ExportViewportSize,
  waitForAnimationFrames,
  waitForExportSurfaceReady,
} from '../export-runtime/exportFrame'

export {
  EXPORT_VIEWPORT_HEIGHT,
  EXPORT_VIEWPORT_WIDTH,
  waitForExportDocumentReady,
} from '../export-runtime/exportFrame'

export const EXPORT_IMAGE_PIXEL_RATIO = 2
export const PPTX_WIDTH_INCHES = 13.333
export const PPTX_HEIGHT_INCHES = 7.5
export const PPTX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'

const EXPORT_FILE_NAME = '可编辑演示'
const EXPORT_CAPTURE_TIMEOUT_MS = 20000
const STATIC_CAPTURE_STYLE_ID = 'pptx-static-capture-style'
const PPTX_LAYOUT_NAME = 'HTML_SLIDE_EXPORT'

export async function exportDeckToPptx(
  html: string,
  options?: {
    onProgress?: (message: string) => void
  },
): Promise<void> {
  const document = createDeckDocument(html)
  const deck = parseControlledDeck(document)
  const canvasDimensions = resolveCanvasDimensions(document)
  const pptxSlideSize = resolvePptxSlideSize(canvasDimensions)
  const pptx = new PptxGenJS()
  const exportFrame = await createExportFrame(html, canvasDimensions)
  const exportDocument = exportFrame.contentDocument

  if (!exportDocument) {
    exportFrame.remove()
    throw new Error('PPTX 导出环境初始化失败')
  }

  ensureStaticCaptureStyles(exportDocument)
  await waitForExportSurfaceReady(exportDocument, exportDocument.body ?? exportDocument.documentElement, EXPORT_LOAD_TIMEOUT_MS)

  pptx.defineLayout({
    name: PPTX_LAYOUT_NAME,
    width: pptxSlideSize.width,
    height: pptxSlideSize.height,
  })
  pptx.layout = PPTX_LAYOUT_NAME
  pptx.author = 'AI Agent'
  pptx.subject = 'HTML slide deck export'
  pptx.title = document.title || EXPORT_FILE_NAME

  try {
    for (const [index, slideId] of deck.slideOrder.entries()) {
      options?.onProgress?.(`正在导出 PPTX（${index + 1}/${deck.slideOrder.length}）…`)
      await exportSlideToPptx(pptx, exportFrame, slideId, canvasDimensions, pptxSlideSize)
      await waitForAnimationFrames()
    }
  } finally {
    exportFrame.remove()
  }

  const blob = await pptx.write({
    outputType: 'blob',
  })

  if (!(blob instanceof Blob)) {
    throw new Error('PPTX 导出未生成有效文件')
  }

  savePptxBlob(
    blob.type === PPTX_MIME_TYPE ? blob : new Blob([blob], { type: PPTX_MIME_TYPE }),
    createSafeFileName(document.title || EXPORT_FILE_NAME),
  )
}

export function resolvePptxSlideSize(canvasDimensions: ExportViewportSize): ExportViewportSize {
  if (canvasDimensions.width <= 0 || canvasDimensions.height <= 0) {
    return {
      width: PPTX_WIDTH_INCHES,
      height: PPTX_HEIGHT_INCHES,
    }
  }

  const aspectRatio = canvasDimensions.width / canvasDimensions.height
  const wideAspectRatio = PPTX_WIDTH_INCHES / PPTX_HEIGHT_INCHES

  if (Math.abs(aspectRatio - wideAspectRatio) < 0.001) {
    return {
      width: PPTX_WIDTH_INCHES,
      height: PPTX_HEIGHT_INCHES,
    }
  }

  if (aspectRatio >= wideAspectRatio) {
    return {
      width: PPTX_WIDTH_INCHES,
      height: roundPptxInches(PPTX_WIDTH_INCHES / aspectRatio),
    }
  }

  return {
    width: roundPptxInches(PPTX_HEIGHT_INCHES * aspectRatio),
    height: PPTX_HEIGHT_INCHES,
  }
}

function roundPptxInches(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function pxToInches(value: number, viewportSize: number, slideSizeInches: number): number {
  if (!viewportSize) {
    return 0
  }

  return (value / viewportSize) * slideSizeInches
}

async function exportSlideToPptx(
  pptx: PptxGenJS,
  exportFrame: HTMLIFrameElement,
  slideId: string,
  canvasDimensions: ExportViewportSize,
  pptxSlideSize: ExportViewportSize,
): Promise<void> {
  const exportDocument = exportFrame.contentDocument
  if (!exportDocument) {
    throw new Error('PPTX 导出环境初始化失败')
  }

  const slideNode = exportDocument.querySelector<HTMLElement>(`section.slide[data-slide-id="${slideId}"]`)

  if (!slideNode) {
    throw new Error(`未找到要导出的页面 ${slideId}`)
  }

  prepareSlideForStaticView(exportDocument, slideId)
  await waitForExportSurfaceReady(exportDocument, slideNode, EXPORT_LOAD_TIMEOUT_MS)

  const preparedSlideNode =
    exportDocument.querySelector<HTMLElement>(`section.slide[data-slide-id="${slideId}"]`) ?? slideNode

  const slide = pptx.addSlide()
  finishAllAnimations(exportDocument)
  const fullSlideData = await captureFullSlide(
    resolvePptxCaptureNode(exportDocument, preparedSlideNode),
    canvasDimensions,
  )
  slide.addImage({
    data: fullSlideData,
    x: 0,
    y: 0,
    w: pptxSlideSize.width,
    h: pptxSlideSize.height,
  })
}

export function ensureStaticCaptureStyles(document: Document): void {
  if (document.getElementById(STATIC_CAPTURE_STYLE_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = STATIC_CAPTURE_STYLE_ID
  style.setAttribute('data-pptx-static-capture', 'true')
  style.textContent = `
    [data-preview-static="true"] .reveal,
    .slide.visible .reveal {
      opacity: 1 !important;
      transform: none !important;
      filter: none !important;
      transition: none !important;
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      animation-fill-mode: forwards !important;
    }

    [data-preview-static="true"] *,
    [data-preview-static="true"] *::before,
    [data-preview-static="true"] *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      animation-fill-mode: forwards !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }

    .slide.is-active [data-anim],
    [data-preview-static="true"] [data-anim],
    .slide.is-active [data-anim="stagger-list"] > *,
    [data-preview-static="true"] [data-anim="stagger-list"] > *,
    .slide.is-active .anim-stagger-list > *,
    [data-preview-static="true"] .anim-stagger-list > *,
    .slide.is-active .stagger > *,
    [data-preview-static="true"] .stagger > * {
      opacity: 1 !important;
      transform: none !important;
      filter: none !important;
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      animation-fill-mode: forwards !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }

    .slide.is-active .path-draw path,
    .slide.is-active .path-draw line,
    .slide.is-active .path-draw circle,
    [data-preview-static="true"] .path-draw path,
    [data-preview-static="true"] .path-draw line,
    [data-preview-static="true"] .path-draw circle {
      stroke-dashoffset: 0 !important;
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      animation-fill-mode: forwards !important;
    }

    .slide.is-active .bar-fill,
    [data-preview-static="true"] .bar-fill {
      transform: scaleX(1) !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }

    .notes-overlay,
    .overview,
    .overview-overlay {
      display: none !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `

  document.head.appendChild(style)
}

function finishAllAnimations(doc: Document): void {
  try {
    for (const animation of doc.getAnimations()) {
      animation.finish()
    }
  } catch {
    // Some animations may throw if they can't be finished (e.g., inactive timelines)
  }
}

async function captureFullSlide(captureNode: HTMLElement, canvasDimensions: ExportViewportSize): Promise<string> {
  return withTimeout(
    toPng(captureNode, {
      cacheBust: true,
      pixelRatio: EXPORT_IMAGE_PIXEL_RATIO,
      width: canvasDimensions.width,
      height: canvasDimensions.height,
      skipFonts: true,
    }),
    EXPORT_CAPTURE_TIMEOUT_MS,
    '整页截图超时',
  )
}

function resolvePptxCaptureNode(document: Document, fallbackNode: HTMLElement): HTMLElement {
  return document.body ?? fallbackNode
}

function createSafeFileName(value: string): string {
  const nextValue = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').trim()
  return nextValue || EXPORT_FILE_NAME
}

export function savePptxBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${fileName}.pptx`
  anchor.click()
  URL.revokeObjectURL(url)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeout)
        reject(error)
      },
    )
  })
}
