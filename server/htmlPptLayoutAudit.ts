import { JSDOM } from 'jsdom'

import {
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
  XHS_CANVAS_HEIGHT,
  XHS_CANVAS_WIDTH,
} from '../src/app/previewLayout'

export type HtmlPptLayoutWarning = {
  code: string
  severity: 'warning'
  slideId?: string
  slideIndex?: number
  message: string
}

const STANDARD_CANVAS = {
  width: DEFAULT_CANVAS_WIDTH,
  height: DEFAULT_CANVAS_HEIGHT,
}

const XHS_CANVAS = {
  width: XHS_CANVAS_WIDTH,
  height: XHS_CANVAS_HEIGHT,
}

const DENSE_TEXT_CHAR_THRESHOLD = 720
const LONG_LIST_ITEM_THRESHOLD = 9
const LONG_TABLE_CELL_THRESHOLD = 48

export function normalizeHtmlPptLayoutContract(html: string): string {
  const dom = new JSDOM(html)
  const { document } = dom.window
  const canvas = resolveCanvasContract(document)

  document.documentElement.setAttribute('data-fs-canvas-width', String(canvas.width))
  document.documentElement.setAttribute('data-fs-canvas-height', String(canvas.height))

  Array.from(document.querySelectorAll<HTMLElement>('section.slide')).forEach((slide, index) => {
    const slideId = slide.dataset.slideId || slide.id || `slide-${index + 1}`
    slide.dataset.slideId = slideId
    if (!slide.id) {
      slide.id = slideId
    }
  })

  return dom.serialize()
}

export function auditHtmlPptLayout(html: string): HtmlPptLayoutWarning[] {
  const dom = new JSDOM(html)
  const { document } = dom.window
  const warnings: HtmlPptLayoutWarning[] = []
  const canvas = resolveCanvasContract(document)
  const isXhs = canvas.width === XHS_CANVAS.width && canvas.height === XHS_CANVAS.height
  const explicitWidth = readPositiveNumber(document.documentElement.getAttribute('data-fs-canvas-width'))
  const explicitHeight = readPositiveNumber(document.documentElement.getAttribute('data-fs-canvas-height'))

  if (!isXhs && explicitWidth && explicitHeight && (explicitWidth !== STANDARD_CANVAS.width || explicitHeight !== STANDARD_CANVAS.height)) {
    warnings.push({
      code: 'canvas-size-mismatch',
      severity: 'warning',
      message: `普通演示应使用 ${STANDARD_CANVAS.width}x${STANDARD_CANVAS.height} 画布，当前为 ${explicitWidth}x${explicitHeight}。`,
    })
  }

  const inlineCss = Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n')
  if (!isXhs && /(?:width|height)\s*:\s*(?:1920|1080)px/i.test(inlineCss)) {
    warnings.push({
      code: 'legacy-fixed-canvas',
      severity: 'warning',
      message: '样式中包含 1920px/1080px 固定画布值，可能与编辑器 1280x720 预算不一致。',
    })
  }

  Array.from(document.querySelectorAll<HTMLElement>('section.slide')).forEach((slide, index) => {
    const slideId = slide.dataset.slideId || slide.id || `slide-${index + 1}`
    const slideIndex = index + 1
    const textLength = visibleSlideText(slide).length
    const longestList = Math.max(0, ...Array.from(slide.querySelectorAll('ul, ol')).map((list) => list.querySelectorAll('li').length))
    const tableCells = slide.querySelectorAll('th, td').length
    const hasScrollableContent = Array.from(slide.querySelectorAll<HTMLElement>('*')).some((node) => {
      const style = node.getAttribute('style') ?? ''
      return /overflow(?:-[xy])?\s*:\s*(auto|scroll)/i.test(style)
    })

    if (textLength > DENSE_TEXT_CHAR_THRESHOLD) {
      warnings.push({
        code: 'dense-text',
        severity: 'warning',
        slideId,
        slideIndex,
        message: `第 ${slideIndex} 页文本量约 ${textLength} 字，可能超出内容高度预算。`,
      })
    }

    if (longestList > LONG_LIST_ITEM_THRESHOLD) {
      warnings.push({
        code: 'long-list',
        severity: 'warning',
        slideId,
        slideIndex,
        message: `第 ${slideIndex} 页包含 ${longestList} 项列表，建议拆页或压缩为分组卡片。`,
      })
    }

    if (tableCells > LONG_TABLE_CELL_THRESHOLD) {
      warnings.push({
        code: 'large-table',
        severity: 'warning',
        slideId,
        slideIndex,
        message: `第 ${slideIndex} 页表格包含 ${tableCells} 个单元格，可能在 16:9 画布内拥挤。`,
      })
    }

    if (hasScrollableContent) {
      warnings.push({
        code: 'scrollable-content',
        severity: 'warning',
        slideId,
        slideIndex,
        message: `第 ${slideIndex} 页包含滚动容器，导出时可能截断隐藏内容。`,
      })
    }
  })

  return warnings
}

function resolveCanvasContract(document: Document): {
  width: number
  height: number
} {
  const explicitWidth = readPositiveNumber(document.documentElement.getAttribute('data-fs-canvas-width'))
  const explicitHeight = readPositiveNumber(document.documentElement.getAttribute('data-fs-canvas-height'))

  if (
    (explicitWidth === XHS_CANVAS.width && explicitHeight === XHS_CANVAS.height)
    || looksLikeXhsDeck(document)
  ) {
    return XHS_CANVAS
  }

  return STANDARD_CANVAS
}

function readPositiveNumber(value: string | null): number | null {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function looksLikeXhsDeck(document: Document): boolean {
  const bodyClassName = document.body?.className ?? ''
  if (/\bxhs\b|tpl-xhs-|xhs-/.test(bodyClassName)) {
    return true
  }

  const styles = Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n')

  return /aspect-ratio\s*:\s*3\s*\/\s*4/i.test(styles)
    || /width\s*:\s*810px\s*;\s*height\s*:\s*1080px/i.test(styles)
}

function visibleSlideText(slide: HTMLElement): string {
  const clone = slide.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.notes, [data-notes], [data-speaker-notes], script, style').forEach((node) => node.remove())
  return (clone.textContent ?? '').replace(/\s+/g, '').trim()
}
