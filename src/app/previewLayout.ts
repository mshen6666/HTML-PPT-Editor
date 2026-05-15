const FALLBACK_SCALE = 1

export const DEFAULT_CANVAS_WIDTH = 1280
export const DEFAULT_CANVAS_HEIGHT = 720
export const XHS_CANVAS_WIDTH = 810
export const XHS_CANVAS_HEIGHT = 1080

type CanvasDimensions = {
  width: number
  height: number
}

type PreviewScaleArgs = {
  frameWidth: number
  frameHeight: number
  viewportWidth: number
  viewportHeight: number
}

export function calculatePreviewScale({
  frameWidth,
  frameHeight,
  viewportWidth,
  viewportHeight,
}: PreviewScaleArgs): number {
  if (frameWidth <= 0 || frameHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return FALLBACK_SCALE
  }

  return Math.min(frameWidth / viewportWidth, frameHeight / viewportHeight)
}

export function resolveCanvasDimensions(document: Document): CanvasDimensions {
  const root = document.documentElement
  const explicitWidth = parseCanvasDimension(root.getAttribute('data-fs-canvas-width'))
  const explicitHeight = parseCanvasDimension(root.getAttribute('data-fs-canvas-height'))
  if (explicitWidth && explicitHeight) {
    return {
      width: explicitWidth,
      height: explicitHeight,
    }
  }

  if (looksLikeXhsDeck(document)) {
    return {
      width: XHS_CANVAS_WIDTH,
      height: XHS_CANVAS_HEIGHT,
    }
  }

  return {
    width: DEFAULT_CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
  }
}

export function applyCanvasDimensions(document: Document, dimensions: CanvasDimensions): void {
  document.documentElement.setAttribute('data-fs-canvas-width', String(dimensions.width))
  document.documentElement.setAttribute('data-fs-canvas-height', String(dimensions.height))
}

function parseCanvasDimension(value: string | null): number | null {
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
