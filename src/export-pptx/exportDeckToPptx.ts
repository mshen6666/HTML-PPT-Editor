import PptxGenJS from 'pptxgenjs'
import JSZip from 'jszip'
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
const MIN_EXPORT_OBJECT_WIDTH_PX = 4
const MIN_EXPORT_OBJECT_HEIGHT_PX = 4
const MIN_TEXT_OBJECT_WIDTH_PX = 8
const MIN_TEXT_OBJECT_HEIGHT_PX = 8
const BACKGROUND_OBJECT_NAME = 'fs-slide-background'
const SCREENSHOT_OBJECT_NAME = 'fs-slide-screenshot'
const MAX_ANIMATED_PPTX_OBJECTS = 80
const EXCLUDED_PPTX_EXPORT_SELECTOR = [
  '.notes',
  '.notes-overlay',
  '.overview',
  '.overview-overlay',
  '.presenter-panel',
  '.progress',
  '.progress-bar',
  '.nav-dots',
  '.nav-dot',
  '[data-pptx-static-capture]',
  '[data-editor-overlay]',
].join(',')
const TEXT_EXPORT_SELECTOR = [
  '[data-edit-kind="text"]',
  '[data-slot-key]',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'li',
  'blockquote',
  'figcaption',
  'caption',
  'dt',
  'dd',
  'th',
  'td',
  'button',
  'a',
  'small',
  'mark',
  'code',
  'span',
  'div',
].join(',')

type PptxBox = {
  x: number
  y: number
  w: number
  h: number
}

type NormalizedCssColor = {
  hex: string
  alpha: number
}

type EditablePptxShapeObject = {
  kind: 'shape'
  box: PptxBox
  fill?: PptxGenJS.ShapeFillProps
  line?: PptxGenJS.ShapeLineProps
  objectName: string
  domOrder: number
  isBackground?: boolean
}

type EditablePptxTextObject = {
  kind: 'text'
  box: PptxBox
  text: string
  options: Pick<
    PptxGenJS.TextPropsOptions,
    | 'align'
    | 'bold'
    | 'breakLine'
    | 'color'
    | 'fit'
    | 'fontFace'
    | 'fontSize'
    | 'italic'
    | 'lineSpacingMultiple'
    | 'margin'
    | 'objectName'
    | 'valign'
    | 'wrap'
  >
  domOrder: number
}

type EditablePptxImageObject = {
  kind: 'image'
  box: PptxBox
  source: {
    data?: string
    path?: string
  }
  altText?: string
  objectName: string
  domOrder: number
}

export type EditablePptxObject =
  | EditablePptxShapeObject
  | EditablePptxTextObject
  | EditablePptxImageObject

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
  const exportFrame = await createExportFrame(html, canvasDimensions, { scripts: 'remove' })
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

  const pptxBlob = blob.type === PPTX_MIME_TYPE ? blob : new Blob([blob], { type: PPTX_MIME_TYPE })
  const exportBlob = await addNativePptxMotion(pptxBlob).catch(() => pptxBlob)

  savePptxBlob(
    exportBlob,
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
  const editableObjects = await collectEditablePptxObjects(preparedSlideNode, canvasDimensions, pptxSlideSize)

  if (shouldUseScreenshotVisualBaseline(preparedSlideNode)) {
    await addScreenshotFallbackToSlide(
      pptx,
      slide,
      resolvePptxCaptureNode(exportDocument, preparedSlideNode),
      canvasDimensions,
      pptxSlideSize,
    )
    return
  }

  if (shouldUseEditablePptxExport(editableObjects)) {
    addEditableObjectsToSlide(pptx, slide, editableObjects)
    return
  }

  await addScreenshotFallbackToSlide(
    pptx,
    slide,
    resolvePptxCaptureNode(exportDocument, preparedSlideNode),
    canvasDimensions,
    pptxSlideSize,
  )
}

function addEditableObjectsToSlide(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  objects: EditablePptxObject[],
): void {
  for (const object of objects) {
    if (object.kind === 'shape') {
      slide.addShape(pptx.ShapeType.rect, {
        ...object.box,
        fill: object.fill ?? { color: 'FFFFFF' },
        line: object.line ?? { color: 'FFFFFF', transparency: 100, width: 0 },
        objectName: object.objectName,
      })
      continue
    }

    if (object.kind === 'image') {
      slide.addImage({
        ...object.source,
        ...object.box,
        altText: object.altText,
        objectName: object.objectName,
      })
      continue
    }

    slide.addText(object.text, {
      ...object.options,
      ...object.box,
      fill: { color: 'FFFFFF', transparency: 100 },
      line: { color: 'FFFFFF', transparency: 100, width: 0 },
      shape: pptx.ShapeType.rect,
      isTextBox: true,
    })
  }
}

function shouldUseEditablePptxExport(objects: EditablePptxObject[]): boolean {
  const contentObjectCount = objects.filter((object) => !('isBackground' in object && object.isBackground)).length
  return contentObjectCount > 0
}

export function shouldUseScreenshotVisualBaseline(slideNode: HTMLElement): boolean {
  const elements = [slideNode, ...Array.from(slideNode.querySelectorAll<HTMLElement>('*'))]
  return elements.some((element) => {
    const style = readComputedStyle(element)
    const backgroundImage = style.backgroundImage || ''
    if (backgroundImage && backgroundImage !== 'none') {
      return true
    }
    if (hasComplexVisualStyle(style)) {
      return true
    }

    const before = window.getComputedStyle(element, '::before')
    const after = window.getComputedStyle(element, '::after')
    return hasVisiblePseudoVisual(before) || hasVisiblePseudoVisual(after)
  })
}

function hasComplexVisualStyle(style: CSSStyleDeclaration): boolean {
  return Boolean(
    (style.filter && style.filter !== 'none')
    || (style.getPropertyValue('backdrop-filter') && style.getPropertyValue('backdrop-filter') !== 'none')
    || (style.clipPath && style.clipPath !== 'none')
    || (style.getPropertyValue('mask-image') && style.getPropertyValue('mask-image') !== 'none')
    || (style.getPropertyValue('border-image-source') && style.getPropertyValue('border-image-source') !== 'none'),
  )
}

function hasVisiblePseudoVisual(style: CSSStyleDeclaration): boolean {
  const content = style.content || ''
  if (!content || content === 'none' || content === 'normal') {
    return false
  }

  const background = style.backgroundImage || ''
  if (background && background !== 'none') {
    return true
  }

  const backgroundColor = normalizeCssColor(style.backgroundColor)
  return Boolean(backgroundColor && backgroundColor.alpha > 0)
}

async function addScreenshotFallbackToSlide(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  captureNode: HTMLElement,
  canvasDimensions: ExportViewportSize,
  pptxSlideSize: ExportViewportSize,
): Promise<void> {
  const fullSlideData = await captureFullSlide(captureNode, canvasDimensions)
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: pptxSlideSize.width,
    h: pptxSlideSize.height,
    fill: { color: 'FFFFFF' },
    line: { color: 'FFFFFF', transparency: 100, width: 0 },
    objectName: BACKGROUND_OBJECT_NAME,
  })
  slide.addImage({
    data: fullSlideData,
    x: 0,
    y: 0,
    w: pptxSlideSize.width,
    h: pptxSlideSize.height,
    objectName: SCREENSHOT_OBJECT_NAME,
  })
}

export async function collectEditablePptxObjects(
  slideNode: HTMLElement,
  canvasDimensions: ExportViewportSize,
  pptxSlideSize: ExportViewportSize,
): Promise<EditablePptxObject[]> {
  const slideRect = slideNode.getBoundingClientRect()
  const objects: EditablePptxObject[] = [
    createSlideBackgroundObject(slideNode, canvasDimensions, pptxSlideSize),
  ]

  const exportedTextNodes = collectExportableTextElements(slideNode)
  const exportedTextSet = new Set(exportedTextNodes)
  const elementOrder = buildElementOrderMap(slideNode)

  objects.push(
    ...collectExportableShapeElements(slideNode)
      .map((element) => createShapePptxObject(element, slideRect, canvasDimensions, pptxSlideSize, elementOrder))
      .filter((object): object is EditablePptxShapeObject => Boolean(object)),
  )

  objects.push(
    ...(await collectExportableImageElements(slideNode)
      .reduce<Promise<EditablePptxImageObject[]>>(async (promise, image) => {
        const items = await promise
        const object = await createImagePptxObject(image, slideRect, canvasDimensions, pptxSlideSize, elementOrder)
        if (object) {
          items.push(object)
        }
        return items
      }, Promise.resolve([]))),
  )

  objects.push(
    ...exportedTextNodes
      .map((element) => createTextPptxObject(element, slideRect, canvasDimensions, pptxSlideSize, elementOrder, exportedTextSet))
      .filter((object): object is EditablePptxTextObject => Boolean(object)),
  )

  return sortEditablePptxObjects(dedupeEditablePptxObjects(objects))
}

function createSlideBackgroundObject(
  slideNode: HTMLElement,
  canvasDimensions: ExportViewportSize,
  pptxSlideSize: ExportViewportSize,
): EditablePptxShapeObject {
  const computedStyle = readComputedStyle(slideNode)
  const backgroundColor =
    readFirstOpaqueColor(
      computedStyle?.backgroundColor,
      readComputedStyle(slideNode.ownerDocument.body).backgroundColor,
      readComputedStyle(slideNode.ownerDocument.documentElement).backgroundColor,
    ) ?? 'FFFFFF'

  return {
    kind: 'shape',
    box: {
      x: 0,
      y: 0,
      w: pxToInches(canvasDimensions.width, canvasDimensions.width, pptxSlideSize.width),
      h: pxToInches(canvasDimensions.height, canvasDimensions.height, pptxSlideSize.height),
    },
    fill: { color: backgroundColor },
    line: { color: backgroundColor, transparency: 100, width: 0 },
    objectName: BACKGROUND_OBJECT_NAME,
    domOrder: -1,
    isBackground: true,
  }
}

function collectExportableShapeElements(slideNode: HTMLElement): HTMLElement[] {
  return Array.from(slideNode.querySelectorAll<HTMLElement>('*')).filter((element) => {
    if (isExcludedFromPptxExport(element) || isElementHidden(element) || isSvgElement(element)) {
      return false
    }

    if (element.tagName === 'IMG' || element.tagName === 'SCRIPT' || element.tagName === 'STYLE') {
      return false
    }

    const computedStyle = readComputedStyle(element)
    if (!computedStyle) {
      return false
    }

    const rect = element.getBoundingClientRect()
    if (rect.width < MIN_EXPORT_OBJECT_WIDTH_PX || rect.height < MIN_EXPORT_OBJECT_HEIGHT_PX) {
      return false
    }

    return hasVisibleBackground(computedStyle)
      || hasVisibleBorder(computedStyle)
      || hasShapeLikeClass(element)
  })
}

function collectExportableTextElements(slideNode: HTMLElement): HTMLElement[] {
  const candidates = Array.from(slideNode.querySelectorAll<HTMLElement>(TEXT_EXPORT_SELECTOR)).filter((element) => {
    if (isExcludedFromPptxExport(element) || isElementHidden(element) || isSvgElement(element)) {
      return false
    }

    if (!hasVisibleText(element)) {
      return false
    }

    if (element.tagName === 'CODE' && element.closest('pre') !== element.parentElement) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width >= MIN_TEXT_OBJECT_WIDTH_PX && rect.height >= MIN_TEXT_OBJECT_HEIGHT_PX
  })

  return candidates.filter((element) => shouldExportTextElement(element, candidates))
}

function collectExportableImageElements(slideNode: HTMLElement): HTMLImageElement[] {
  return Array.from(slideNode.querySelectorAll<HTMLImageElement>('img[src]')).filter((image) => {
    if (isExcludedFromPptxExport(image) || isElementHidden(image)) {
      return false
    }

    const rect = image.getBoundingClientRect()
    return rect.width >= MIN_EXPORT_OBJECT_WIDTH_PX && rect.height >= MIN_EXPORT_OBJECT_HEIGHT_PX
  })
}

function createShapePptxObject(
  element: HTMLElement,
  slideRect: DOMRect,
  canvasDimensions: ExportViewportSize,
  pptxSlideSize: ExportViewportSize,
  elementOrder: Map<Element, number>,
): EditablePptxShapeObject | null {
  const computedStyle = readComputedStyle(element)
  const box = readPptxBox(element, slideRect, canvasDimensions, pptxSlideSize)

  if (!computedStyle || !box) {
    return null
  }

  const fillColor = normalizeCssColor(computedStyle.backgroundColor)
  const borderColor = readDominantBorderColor(computedStyle)
  const borderWidth = readDominantBorderWidth(computedStyle)
  const hasFill = Boolean(fillColor && fillColor.alpha > 0)
  const hasBorder = Boolean(borderColor && borderWidth > 0)

  if (!hasFill && !hasBorder && !hasShapeLikeClass(element)) {
    return null
  }

  return {
    kind: 'shape',
    box,
    fill: fillColor && fillColor.alpha > 0
      ? {
          color: fillColor.hex,
          transparency: alphaToTransparency(fillColor.alpha),
        }
      : { color: 'FFFFFF', transparency: 100 },
    line: borderColor && borderWidth > 0
      ? {
          color: borderColor.hex,
          transparency: alphaToTransparency(borderColor.alpha),
          width: pxToPoints(borderWidth),
        }
      : { color: 'FFFFFF', transparency: 100, width: 0 },
    objectName: createPptxObjectName(element, 'shape'),
    domOrder: elementOrder.get(element) ?? 0,
  }
}

function createTextPptxObject(
  element: HTMLElement,
  slideRect: DOMRect,
  canvasDimensions: ExportViewportSize,
  pptxSlideSize: ExportViewportSize,
  elementOrder: Map<Element, number>,
  exportedTextSet: ReadonlySet<HTMLElement>,
): EditablePptxTextObject | null {
  const computedStyle = readComputedStyle(element)
  const box = readPptxBox(element, slideRect, canvasDimensions, pptxSlideSize)
  const text = readExportText(element, exportedTextSet)

  if (!computedStyle || !box || !text) {
    return null
  }

  const color = normalizeCssColor(computedStyle.color)
  const fontSize = Math.max(5, Math.round(cssPxToNumber(computedStyle.fontSize, 16) * 0.75 * 10) / 10)

  return {
    kind: 'text',
    box,
    text,
    options: {
      align: normalizeHorizontalAlign(computedStyle.textAlign),
      bold: isBoldFontWeight(computedStyle.fontWeight),
      color: color?.hex ?? '111827',
      fit: 'shrink',
      fontFace: normalizeFontFace(computedStyle.fontFamily),
      fontSize,
      italic: computedStyle.fontStyle === 'italic' || computedStyle.fontStyle === 'oblique',
      lineSpacingMultiple: normalizeLineHeightMultiple(computedStyle.lineHeight, computedStyle.fontSize),
      margin: readTextMargins(computedStyle),
      objectName: createPptxObjectName(element, 'text'),
      valign: normalizeVerticalAlign(computedStyle),
      wrap: true,
    },
    domOrder: elementOrder.get(element) ?? 0,
  }
}

async function createImagePptxObject(
  image: HTMLImageElement,
  slideRect: DOMRect,
  canvasDimensions: ExportViewportSize,
  pptxSlideSize: ExportViewportSize,
  elementOrder: Map<Element, number>,
): Promise<EditablePptxImageObject | null> {
  const box = readPptxBox(image, slideRect, canvasDimensions, pptxSlideSize)
  const source = await readPptxImageSource(image)

  if (!box || !source) {
    return null
  }

  return {
    kind: 'image',
    box,
    source,
    altText: image.alt || image.getAttribute('aria-label') || undefined,
    objectName: createPptxObjectName(image, 'image'),
    domOrder: elementOrder.get(image) ?? 0,
  }
}

function readPptxBox(
  element: HTMLElement,
  slideRect: DOMRect,
  canvasDimensions: ExportViewportSize,
  pptxSlideSize: ExportViewportSize,
): PptxBox | null {
  const rect = element.getBoundingClientRect()
  const clippedLeft = clamp(rect.left - slideRect.left, 0, canvasDimensions.width)
  const clippedTop = clamp(rect.top - slideRect.top, 0, canvasDimensions.height)
  const clippedRight = clamp(rect.right - slideRect.left, 0, canvasDimensions.width)
  const clippedBottom = clamp(rect.bottom - slideRect.top, 0, canvasDimensions.height)
  const width = clippedRight - clippedLeft
  const height = clippedBottom - clippedTop

  if (width < MIN_EXPORT_OBJECT_WIDTH_PX || height < MIN_EXPORT_OBJECT_HEIGHT_PX) {
    return null
  }

  return {
    x: roundPptxInches(pxToInches(clippedLeft, canvasDimensions.width, pptxSlideSize.width)),
    y: roundPptxInches(pxToInches(clippedTop, canvasDimensions.height, pptxSlideSize.height)),
    w: roundPptxInches(pxToInches(width, canvasDimensions.width, pptxSlideSize.width)),
    h: roundPptxInches(pxToInches(height, canvasDimensions.height, pptxSlideSize.height)),
  }
}

function sortEditablePptxObjects(objects: EditablePptxObject[]): EditablePptxObject[] {
  return [...objects].sort((left, right) => {
    const leftLayer = readEditablePptxObjectLayer(left)
    const rightLayer = readEditablePptxObjectLayer(right)
    if (leftLayer !== rightLayer) {
      return leftLayer - rightLayer
    }

    return left.domOrder - right.domOrder
  })
}

function readEditablePptxObjectLayer(object: EditablePptxObject): number {
  if (object.kind === 'shape' && object.isBackground) {
    return 0
  }

  if (object.kind === 'shape') {
    return 1
  }

  if (object.kind === 'image') {
    return 2
  }

  return 3
}

function dedupeEditablePptxObjects(objects: EditablePptxObject[]): EditablePptxObject[] {
  const used = new Set<string>()
  return objects.filter((object) => {
    const key = [
      object.kind,
      object.kind === 'text' ? object.text : '',
      object.box.x,
      object.box.y,
      object.box.w,
      object.box.h,
    ].join('|')

    if (used.has(key)) {
      return false
    }

    used.add(key)
    return true
  })
}

function buildElementOrderMap(root: HTMLElement): Map<Element, number> {
  return new Map(Array.from(root.querySelectorAll('*')).map((element, index) => [element, index]))
}

function isExcludedFromPptxExport(element: HTMLElement): boolean {
  return Boolean(element.closest(EXCLUDED_PPTX_EXPORT_SELECTOR))
}

function isSvgElement(element: HTMLElement): boolean {
  return Boolean(element.closest('svg'))
}

function isElementHidden(element: HTMLElement): boolean {
  const computedStyle = readComputedStyle(element)

  return Boolean(
    computedStyle.display === 'none'
    || computedStyle.visibility === 'hidden'
    || computedStyle.opacity === '0'
    || element.hidden
    || element.getAttribute('aria-hidden') === 'true',
  )
}

function readComputedStyle(element: Element | null | undefined): CSSStyleDeclaration {
  if (!element) {
    return {} as CSSStyleDeclaration
  }

  return element.ownerDocument.defaultView?.getComputedStyle(element) ?? (element as HTMLElement).style
}

function hasVisibleText(element: HTMLElement): boolean {
  return normalizeWhitespace(element.innerText || element.textContent || '').length > 0
}

function shouldExportTextElement(element: HTMLElement, candidates: HTMLElement[]): boolean {
  if (element.dataset.editKind === 'text' || element.dataset.slotKey) {
    return true
  }

  const text = normalizeWhitespace(element.innerText || element.textContent || '')
  if (!text) {
    return false
  }

  const childTextElements = candidates.filter((candidate) => candidate !== element && element.contains(candidate))
  if (!childTextElements.length) {
    return isLikelyTextLeaf(element)
  }

  const childText = normalizeWhitespace(childTextElements.map((child) => child.innerText || child.textContent || '').join(' '))
  return childText.length < text.length * 0.6
}

function isLikelyTextLeaf(element: HTMLElement): boolean {
  if (/^H[1-6]$/.test(element.tagName)) {
    return true
  }

  if (['P', 'LI', 'BLOCKQUOTE', 'FIGCAPTION', 'CAPTION', 'DT', 'DD', 'TH', 'TD', 'BUTTON', 'A', 'SMALL', 'MARK', 'CODE'].includes(element.tagName)) {
    return true
  }

  if (element.tagName === 'SPAN') {
    return !Array.from(element.children).some((child) => hasVisibleText(child as HTMLElement))
  }

  return Boolean(element.dataset.nodeId || element.dataset.aiAnchorId)
}

function readExportText(element: HTMLElement, exportedTextSet: ReadonlySet<HTMLElement>): string {
  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll<HTMLElement>('*').forEach((child) => {
    const sourcePath = readElementPath(element, child)
    const sourceChild = sourcePath.reduce<HTMLElement | null>(
      (current: HTMLElement | null, index) => current?.children[index] as HTMLElement | null,
      element,
    )

    if (sourceChild && exportedTextSet.has(sourceChild)) {
      child.remove()
    }
  })

  return normalizeWhitespace(clone.innerText || clone.textContent || '')
}

function readElementPath(root: HTMLElement, element: HTMLElement): number[] {
  const path: number[] = []
  let current: HTMLElement | null = element

  while (current && current !== root) {
    const parent: HTMLElement | null = current.parentElement
    if (!parent) {
      break
    }

    path.unshift(Array.from(parent.children).indexOf(current))
    current = parent
  }

  return path
}

function hasVisibleBackground(style: CSSStyleDeclaration): boolean {
  const color = normalizeCssColor(style.backgroundColor)
  return Boolean(color && color.alpha > 0)
}

function hasVisibleBorder(style: CSSStyleDeclaration): boolean {
  return readDominantBorderWidth(style) > 0 && Boolean(readDominantBorderColor(style))
}

function readDominantBorderWidth(style: CSSStyleDeclaration): number {
  return Math.max(
    cssPxToNumber(style.borderTopWidth, 0),
    cssPxToNumber(style.borderRightWidth, 0),
    cssPxToNumber(style.borderBottomWidth, 0),
    cssPxToNumber(style.borderLeftWidth, 0),
  )
}

function readDominantBorderColor(style: CSSStyleDeclaration): NormalizedCssColor | null {
  return normalizeCssColor(style.borderTopColor)
    ?? normalizeCssColor(style.borderRightColor)
    ?? normalizeCssColor(style.borderBottomColor)
    ?? normalizeCssColor(style.borderLeftColor)
}

function hasShapeLikeClass(element: HTMLElement): boolean {
  const className = typeof element.className === 'string' ? element.className : ''
  return /(^|\s)(card|panel|block|tile|chip|pill|badge|tag|box|frame|metric|info|callout|hero|banner|step|quote|button|btn)(\s|$)/i.test(className)
}

function normalizeCssColor(value: string | null | undefined): NormalizedCssColor | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized === 'transparent' || normalized === 'currentcolor') {
    return null
  }

  if (normalized.startsWith('#')) {
    return parseHexCssColor(normalized)
  }

  const rgbMatch = /^rgba?\((.+)\)$/.exec(normalized)
  if (rgbMatch) {
    const parts = rgbMatch[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)

    if (parts.length >= 3) {
      const red = parseCssColorChannel(parts[0])
      const green = parseCssColorChannel(parts[1])
      const blue = parseCssColorChannel(parts[2])
      const alpha = parts[3] === undefined ? 1 : clamp(Number(parts[3]), 0, 1)
      if ([red, green, blue, alpha].every(Number.isFinite) && alpha > 0) {
        return {
          hex: rgbToHex(red, green, blue),
          alpha,
        }
      }
    }
  }

  return null
}

function parseHexCssColor(value: string): NormalizedCssColor | null {
  const hex = value.replace('#', '')
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return {
      hex: hex.split('').map((char) => `${char}${char}`).join('').toUpperCase(),
      alpha: 1,
    }
  }

  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return {
      hex: hex.toUpperCase(),
      alpha: 1,
    }
  }

  if (/^[0-9a-f]{8}$/i.test(hex)) {
    return {
      hex: hex.slice(0, 6).toUpperCase(),
      alpha: parseInt(hex.slice(6), 16) / 255,
    }
  }

  return null
}

function readFirstOpaqueColor(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const color = normalizeCssColor(value)
    if (color && color.alpha > 0) {
      return color.hex
    }
  }

  return null
}

function parseCssColorChannel(value: string): number {
  if (value.endsWith('%')) {
    return Math.round(clamp(Number(value.slice(0, -1)), 0, 100) * 2.55)
  }

  return Math.round(clamp(Number(value), 0, 255))
}

function rgbToHex(red: number, green: number, blue: number): string {
  return [red, green, blue]
    .map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

function alphaToTransparency(alpha: number): number {
  return Math.round((1 - clamp(alpha, 0, 1)) * 100)
}

function cssPxToNumber(value: string | null | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function pxToPoints(value: number): number {
  return Math.max(0, Math.round(value * 0.75 * 10) / 10)
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t\f\v]+/g, ' ').replace(/\n\s+/g, '\n').trim()
}

function normalizeHorizontalAlign(value: string): PptxGenJS.HAlign {
  if (value === 'center') {
    return 'center'
  }
  if (value === 'right' || value === 'end') {
    return 'right'
  }
  if (value === 'justify') {
    return 'justify'
  }

  return 'left'
}

function normalizeVerticalAlign(style: CSSStyleDeclaration): PptxGenJS.VAlign {
  if (style.alignItems === 'center' || style.justifyContent === 'center' || style.verticalAlign === 'middle') {
    return 'middle'
  }

  if (style.verticalAlign === 'bottom') {
    return 'bottom'
  }

  return 'top'
}

function normalizeFontFace(value: string): string {
  return value
    .split(',')
    .map((font) => font.trim().replace(/^['"]|['"]$/g, ''))
    .find((font) => font && !/^(inherit|initial|unset|system-ui)$/i.test(font))
    || 'Microsoft YaHei'
}

function normalizeLineHeightMultiple(lineHeight: string, fontSize: string): number | undefined {
  if (!lineHeight || lineHeight === 'normal') {
    return undefined
  }

  const lineHeightPx = cssPxToNumber(lineHeight, 0)
  const fontSizePx = cssPxToNumber(fontSize, 0)
  if (!lineHeightPx || !fontSizePx) {
    return undefined
  }

  return Math.round((lineHeightPx / fontSizePx) * 100) / 100
}

function readTextMargins(style: CSSStyleDeclaration): [number, number, number, number] {
  // PptxGenJS 的 margin 单位是 points，这里把 CSS padding 近似转换，避免文字贴边。
  return [
    pxToPoints(cssPxToNumber(style.paddingTop, 0)),
    pxToPoints(cssPxToNumber(style.paddingRight, 0)),
    pxToPoints(cssPxToNumber(style.paddingBottom, 0)),
    pxToPoints(cssPxToNumber(style.paddingLeft, 0)),
  ]
}

function isBoldFontWeight(value: string): boolean {
  if (value === 'bold' || value === 'bolder') {
    return true
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue >= 600
}

async function readPptxImageSource(image: HTMLImageElement): Promise<EditablePptxImageObject['source'] | null> {
  const source = image.currentSrc || image.src || image.getAttribute('src') || ''
  if (!source || /^javascript:/i.test(source)) {
    return null
  }

  if (/^data:/i.test(source)) {
    return { data: source }
  }

  if (/^blob:/i.test(source)) {
    try {
      return { data: await fetchImageAsDataUrl(source) }
    } catch {
      return null
    }
  }

  try {
    return { data: await fetchImageAsDataUrl(source) }
  } catch {
    return { path: source }
  }
}

async function fetchImageAsDataUrl(source: string): Promise<string> {
  const response = await fetch(source)
  if (!response.ok) {
    throw new Error(`图片读取失败：${source}`)
  }

  const blob = await response.blob()
  return blobToDataUrl(blob)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('图片转换失败'))
    reader.readAsDataURL(blob)
  })
}

function createPptxObjectName(element: HTMLElement, fallback: string): string {
  return element.dataset.nodeId
    || element.dataset.aiAnchorId
    || element.getAttribute('aria-label')
    || element.getAttribute('alt')
    || fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
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
    .slide.is-active [class*="anim-"],
    [data-preview-static="true"] [class*="anim-"],
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

    .slide.is-active [class*="anim-"]::before,
    .slide.is-active [class*="anim-"]::after,
    [data-preview-static="true"] [class*="anim-"]::before,
    [data-preview-static="true"] [class*="anim-"]::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      animation-fill-mode: forwards !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }

    .slide.is-active .anim-typewriter,
    [data-preview-static="true"] .anim-typewriter {
      width: auto !important;
      max-width: none !important;
      border-right: 0 !important;
      white-space: normal !important;
    }

    .slide.is-active .anim-shimmer-sweep::after,
    [data-preview-static="true"] .anim-shimmer-sweep::after {
      display: none !important;
    }

    .slide.is-active .path-draw path,
    .slide.is-active .path-draw line,
    .slide.is-active .path-draw circle,
    .slide.is-active .path-draw rect,
    .slide.is-active .path-draw polyline,
    .slide.is-active .anim-path-draw path,
    .slide.is-active .anim-path-draw line,
    .slide.is-active .anim-path-draw circle,
    .slide.is-active .anim-path-draw rect,
    .slide.is-active .anim-path-draw polyline,
    [data-preview-static="true"] .path-draw path,
    [data-preview-static="true"] .path-draw line,
    [data-preview-static="true"] .path-draw circle,
    [data-preview-static="true"] .path-draw rect,
    [data-preview-static="true"] .path-draw polyline,
    [data-preview-static="true"] .anim-path-draw path,
    [data-preview-static="true"] .anim-path-draw line,
    [data-preview-static="true"] .anim-path-draw circle,
    [data-preview-static="true"] .anim-path-draw rect,
    [data-preview-static="true"] .anim-path-draw polyline {
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

    html[data-fs-deck-profile="html-ppt"] section.slide[data-preview-static="true"] {
      position: relative !important;
      inset: auto !important;
      left: 0 !important;
      top: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      opacity: 1 !important;
      pointer-events: auto !important;
      visibility: visible !important;
      overflow: hidden !important;
      transform: none !important;
      z-index: 2 !important;
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
  for (const animation of doc.getAnimations()) {
    try {
      animation.finish()
    } catch {
      // Infinite canvas or CSS effects may not support finish(); static CSS above handles them.
    }
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

export function resolvePptxCaptureNode(_document: Document, fallbackNode: HTMLElement): HTMLElement {
  return fallbackNode
}

async function addNativePptxMotion(blob: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(blob)
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((left, right) => readSlideNumber(left) - readSlideNumber(right))

  await Promise.all(
    slidePaths.map(async (slidePath) => {
      const file = zip.file(slidePath)
      if (!file) {
        return
      }

      const xml = await file.async('string')
      zip.file(slidePath, injectNativePptxMotion(xml))
    }),
  )

  return zip.generateAsync({
    type: 'blob',
    mimeType: PPTX_MIME_TYPE,
  })
}

function readSlideNumber(path: string): number {
  const match = /slide(\d+)\.xml$/.exec(path)
  return match ? Number(match[1]) : 0
}

export function injectNativePptxMotion(xml: string): string {
  if (xml.includes('<p:timing')) {
    return xml
  }

  const shapeIds = readAnimatableShapeIds(xml)
  if (!shapeIds.length || !xml.includes('</p:sld>')) {
    return xml
  }

  const transitionXml = xml.includes('<p:transition') ? '' : createFadeTransitionXml()
  const timingXml = createFadeEntranceTimingXml(shapeIds)

  return xml.replace('</p:sld>', `${transitionXml}${timingXml}</p:sld>`)
}

function readAnimatableShapeIds(xml: string): string[] {
  const ids = Array.from(
    xml.matchAll(/<p:(?:pic|sp)>[\s\S]*?<p:cNvPr id="([^"]+)"/g),
    (match) => match[1],
  )
  const nonBackgroundIds = ids.filter((id) => {
    const escapedId = escapeRegExp(id)
    const objectMatch = new RegExp(`<p:(?:pic|sp)>[\\s\\S]*?<p:cNvPr id="${escapedId}" name="([^"]*)"`, 'i').exec(xml)
    const name = objectMatch?.[1] ?? ''
    return name !== BACKGROUND_OBJECT_NAME
  })

  return nonBackgroundIds.slice(0, MAX_ANIMATED_PPTX_OBJECTS)
}

function createFadeTransitionXml(): string {
  return '<p:transition advClick="1"><p:fade/></p:transition>'
}

function createFadeEntranceTimingXml(shapeIds: string[]): string {
  const animationXml = shapeIds.map((shapeId, index) => createFadeEntranceAnimationXml(shapeId, index)).join('')
  const buildXml = shapeIds.map((shapeId) => `<p:bldP spid="${shapeId}" grpId="0"/>`).join('')
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${animationXml}</p:childTnLst><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst><p:bldLst>${buildXml}</p:bldLst></p:timing>`
}

function createFadeEntranceAnimationXml(shapeId: string, index: number): string {
  const baseId = 3 + index * 3
  const delay = index === 0 ? 0 : Math.min(index * 60, 600)
  return `<p:par><p:cTn id="${baseId}" fill="hold"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${baseId + 1}" dur="500" fill="hold"/><p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createSafeFileName(value: string): string {
  const nextValue = Array.from(value)
    .filter((char) => {
      const codePoint = char.codePointAt(0) ?? 0
      return codePoint > 31 && !'<>:"/\\|?*'.includes(char)
    })
    .join('')
    .trim()
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
