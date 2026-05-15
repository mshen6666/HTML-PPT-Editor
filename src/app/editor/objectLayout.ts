import type { ObjectLayout } from '../../deck-contract/deckContract'

export const DEFAULT_IMAGE_WIDTH = 320
export const DEFAULT_IMAGE_HEIGHT = 180
const MIN_IMAGE_WIDTH = 120
const INSERT_IMAGE_MAX_VIEWPORT_RATIO = 0.55

export type ObjectInteractionHandle = 'nw' | 'ne' | 'sw' | 'se'

export function createCenteredImageLayout(
  viewportWidth: number,
  viewportHeight: number,
  imageDimensions?: { width: number; height: number },
): Extract<ObjectLayout, { mode: 'floating' }> {
  const fitted = fitImageWithinViewport(
    imageDimensions ?? { width: DEFAULT_IMAGE_WIDTH, height: DEFAULT_IMAGE_HEIGHT },
    viewportWidth,
    viewportHeight,
  )

  return {
    mode: 'floating',
    width: fitted.width,
    height: fitted.height,
    x: Math.round((viewportWidth - fitted.width) / 2),
    y: Math.round((viewportHeight - fitted.height) / 2),
  }
}

export function resolveDraggedObjectLayout(
  startLayout: Extract<ObjectLayout, { mode: 'floating' }>,
  deltaX: number,
  deltaY: number,
  viewportWidth: number,
  viewportHeight: number,
): Extract<ObjectLayout, { mode: 'floating' }> {
  return {
    ...startLayout,
    x: clampNumber(Math.round(startLayout.x + deltaX), 0, Math.max(viewportWidth - startLayout.width, 0)),
    y: clampNumber(Math.round(startLayout.y + deltaY), 0, Math.max(viewportHeight - startLayout.height, 0)),
  }
}

export function resolveResizedObjectLayout(
  startLayout: Extract<ObjectLayout, { mode: 'floating' }>,
  handle: ObjectInteractionHandle,
  deltaX: number,
  deltaY: number,
  viewportWidth: number,
  viewportHeight: number,
): Extract<ObjectLayout, { mode: 'floating' }> {
  const aspectRatio = startLayout.width / Math.max(startLayout.height, 1)
  const horizontalDelta = handle.endsWith('e') ? deltaX : -deltaX
  const verticalDelta = handle.startsWith('s') ? deltaY : -deltaY
  const dominantDelta = Math.abs(horizontalDelta) > Math.abs(verticalDelta) ? horizontalDelta : verticalDelta
  const minWidth = MIN_IMAGE_WIDTH
  const maxWidthByHeight =
    handle.startsWith('s')
      ? (viewportHeight - startLayout.y) * aspectRatio
      : (startLayout.y + startLayout.height) * aspectRatio
  const maxWidthByWidth =
    handle.endsWith('e')
      ? viewportWidth - startLayout.x
      : startLayout.x + startLayout.width
  const nextWidth = clampNumber(Math.round(startLayout.width + dominantDelta), minWidth, Math.max(minWidth, Math.min(maxWidthByWidth, maxWidthByHeight)))
  const nextHeight = Math.round(nextWidth / aspectRatio)
  const nextX = handle.endsWith('w') ? startLayout.x + startLayout.width - nextWidth : startLayout.x
  const nextY = handle.startsWith('n') ? startLayout.y + startLayout.height - nextHeight : startLayout.y

  return {
    ...startLayout,
    x: Math.round(nextX),
    y: Math.round(nextY),
    width: nextWidth,
    height: nextHeight,
  }
}

function fitImageWithinViewport(
  imageDimensions: { width: number; height: number },
  viewportWidth: number,
  viewportHeight: number,
): { width: number; height: number } {
  const safeWidth = Math.max(imageDimensions.width, 1)
  const safeHeight = Math.max(imageDimensions.height, 1)
  const maxWidth = viewportWidth * INSERT_IMAGE_MAX_VIEWPORT_RATIO
  const maxHeight = viewportHeight * INSERT_IMAGE_MAX_VIEWPORT_RATIO
  const scale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight, 1)

  return {
    width: Math.max(Math.round(safeWidth * scale), MIN_IMAGE_WIDTH),
    height: Math.max(Math.round(safeHeight * scale), MIN_IMAGE_WIDTH),
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
