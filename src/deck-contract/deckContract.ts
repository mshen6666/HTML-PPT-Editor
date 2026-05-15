export type EditKind = 'text' | 'image' | 'component'
export type DeckProfile = 'frontend-slides' | 'html-ppt'

export type NodeCapabilities = {
  canEditText: boolean
  canReplaceImage: boolean
  canFloat: boolean
  canDelete: boolean
  canEditMotion: boolean
}

export type NodeResource = {
  type: 'image'
  src: string
  alt: string
  assetId: string | null
}

export type MotionMetadata = {
  name: string | null
  duration: number | null
  delay: number | null
  enabled: boolean
}

export type TextStyle = {
  fontFamily: string
  fontSize: string
  fontWeight: string
  fontStyle: string
  textDecoration: string
  color: string
  textAlign: string
  lineHeight: string
  letterSpacing: string
}

export type NodeBase = {
  id: string
  slideId: string
  label: string
  role: string
  layout: ObjectLayout
  style: TextStyle
  resources: NodeResource[]
  locked: boolean
  hidden: boolean
  motion: MotionMetadata
  capabilities: NodeCapabilities
}

export type ObjectLayout =
  | {
      mode: 'flow'
      x: null
      y: null
      width: null
      height: null
      zIndex?: null
    }
  | {
      mode: 'floating'
      x: number
      y: number
      width: number
      height: number
      zIndex?: number | null
    }

export type DeckNode =
  | (NodeBase & {
      kind: 'text'
      html: string
    })
  | (NodeBase & {
      kind: 'image'
      image: {
        src: string
        alt: string
      }
    })
  | (NodeBase & {
      kind: 'component'
      slots: Record<string, string>
    })

export type ParsedDeck = {
  profile: DeckProfile
  slideOrder: string[]
  slides: Array<{
    id: string
    title: string | null
    nodes: string[]
  }>
  nodes: Record<string, DeckNode>
}

export type DeckPatch =
  | {
      type: 'text'
      nodeId: string
      html: string
      fontSize?: string
    }
  | {
      type: 'component-slot'
      nodeId: string
      slotKey: string
      value: string
    }
  | {
      type: 'image'
      nodeId: string
      dataUrl: string
      alt: string
    }
  | {
      type: 'layout'
      nodeId: string
      layout: ObjectLayout
    }
  | {
      type: 'layer'
      nodeId: string
      action: ObjectLayerAction
    }
  | {
      type: 'text-style'
      nodeId: string
      style: Partial<TextStyle>
    }
  | {
      type: 'component-slot-style'
      nodeId: string
      slotKey: string
      style: Partial<TextStyle>
    }
  | {
      type: 'motion'
      nodeId: string
      enabled: boolean
      duration: number
      delay: number
    }
  | {
      type: 'node-state'
      nodeId: string
      locked?: boolean
      hidden?: boolean
    }
  | {
      type: 'remove-node'
      nodeId: string
    }

export type DeckPatchResult = {
  html: string
  deck: ParsedDeck
}

export type AiElementAnchor = {
  selector: string
  anchorId: string
  changed: boolean
}

const EDITABLE_ROOT_SELECTOR = '[data-fs-editable-deck="1"]'
const SLIDE_SELECTOR = 'section.slide[data-slide-id]'
const NODE_SELECTOR = '[data-node-id][data-edit-kind]'
const EDITOR_ONLY_ATTRIBUTES = ['data-editor-hover']
const TEXT_STYLE_PROPERTIES = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'color',
  'text-align',
  'line-height',
  'letter-spacing',
] as const
const LAYOUT_STYLE_PROPERTIES = ['position', 'left', 'top', 'width', 'height', 'z-index', 'background-image'] as const
export type ObjectLayerAction = 'forward' | 'backward' | 'front' | 'back'

export function createDeckDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

export function adaptImportedHtmlToDeck(html: string): string {
  const document = createDeckDocument(html)
  const profile = detectDeckProfile(document)
  document.documentElement.setAttribute('data-fs-editable-deck', '1')
  document.documentElement.setAttribute('data-fs-deck-profile', profile)

  const body = document.body ?? document.createElement('body')
  let slides = Array.from(document.querySelectorAll<HTMLElement>('section.slide'))

  if (!slides.length) {
    const slide = document.createElement('section')
    slide.className = 'slide'
    while (body.firstChild) {
      slide.appendChild(body.firstChild)
    }
    body.appendChild(slide)
    slides = [slide]
  }

  slides.forEach((slide, slideIndex) => {
    const slideId = slide.dataset.slideId || `slide-${slideIndex + 1}`
    slide.dataset.slideId = slideId
    slide.id = slide.id || slideId

    const editableElements = collectEditableElements(slide, profile)

    let nodeCounter = 0
    editableElements.forEach((element) => {
      if (element.closest('[data-node-id]')) {
        return
      }

      nodeCounter += 1
      const nodeId = `${slideId}-node-${nodeCounter}`

      if (element.tagName === 'IMG') {
        const imageElement = element as HTMLImageElement
        const existingFigure =
          imageElement.parentElement?.tagName === 'FIGURE' ? imageElement.parentElement as HTMLElement : null

        if (existingFigure) {
          existingFigure.dataset.nodeId = nodeId
          existingFigure.dataset.editKind = 'image'
          return
        }

        const figure = document.createElement('figure')
        figure.dataset.nodeId = nodeId
        figure.dataset.editKind = 'image'
        imageElement.replaceWith(figure)
        figure.appendChild(imageElement)
        return
      }

      if (hasBackgroundImage(element)) {
        element.dataset.nodeId = nodeId
        element.dataset.editKind = 'image'
        return
      }

      element.dataset.nodeId = nodeId
      element.dataset.editKind = 'text'
    })
  })

  return serializeDeck(document)
}

export function parseControlledDeck(document: Document): ParsedDeck {
  const root = document.querySelector(EDITABLE_ROOT_SELECTOR)
  if (!root) {
    throw new Error('Expected an html-ppt editable deck root')
  }

  const profile = detectDeckProfile(document)
  root.setAttribute('data-fs-deck-profile', profile)

  const slides = Array.from(document.querySelectorAll<HTMLElement>(SLIDE_SELECTOR))
  const parsedSlides = slides.map((slide) => {
    const id = slide.dataset.slideId
    if (!id) {
      throw new Error('Expected each slide to have data-slide-id')
    }

    const nodes = Array.from(slide.querySelectorAll<HTMLElement>(NODE_SELECTOR)).map((node) => {
      const nodeId = node.dataset.nodeId
      if (!nodeId) {
        throw new Error('Expected each editable node to have data-node-id')
      }
      return nodeId
    })

    return { id, nodes }
  })

  const parsedNodes = parsedSlides.flatMap((slide) =>
    slide.nodes.map((nodeId) => [nodeId, readNode(document, slide.id, nodeId)] as const),
  )

  return {
    profile,
    slideOrder: parsedSlides.map((slide) => slide.id),
    slides: parsedSlides.map((slide) => ({
      ...slide,
      title: readSlideTitle(document, slide.id),
    })),
    nodes: Object.fromEntries(parsedNodes),
  }
}

export function previewDeckPatch(document: Document, patch: DeckPatch): DeckPatchResult {
  validateDeckPatch(document, patch)
  const clone = document.cloneNode(true) as Document
  applyDeckPatchToDocument(clone, patch)
  return {
    html: serializeDeck(clone),
    deck: parseControlledDeck(clone),
  }
}

export function applyDeckPatch(document: Document, patch: DeckPatch): DeckPatchResult {
  validateDeckPatch(document, patch)
  applyDeckPatchToDocument(document, patch)
  return {
    html: serializeDeck(document),
    deck: parseControlledDeck(document),
  }
}

export function validateDeckPatch(document: Document, patch: DeckPatch): void {
  switch (patch.type) {
    case 'text':
      getNode(document, patch.nodeId, 'text')
      if (patch.fontSize !== undefined) {
        validateStylePatch({ fontSize: patch.fontSize })
      }
      return
    case 'component-slot':
      getComponentSlot(document, patch.nodeId, patch.slotKey)
      return
    case 'image':
      getNode(document, patch.nodeId, 'image')
      if (!patch.dataUrl.trim()) {
        throw new Error('Expected image patch to include a non-empty dataUrl')
      }
      return
    case 'layout':
      getNode(document, patch.nodeId)
      validateObjectLayout(patch.layout)
      return
    case 'layer':
      getNode(document, patch.nodeId)
      return
    case 'text-style':
      getNode(document, patch.nodeId, 'text')
      validateStylePatch(patch.style)
      return
    case 'component-slot-style':
      getComponentSlot(document, patch.nodeId, patch.slotKey)
      validateStylePatch(patch.style)
      return
    case 'motion':
      getNode(document, patch.nodeId)
      validateMotionPatch(patch)
      return
    case 'node-state':
      getNode(document, patch.nodeId)
      return
    case 'remove-node':
      getNode(document, patch.nodeId)
      return
  }
}

export function patchText(
  document: Document,
  nodeId: string,
  update: { html: string; fontSize?: string },
): void {
  const node = getNode(document, nodeId, 'text')
  node.innerHTML = normalizeTextPatchHtmlForNode(node, update.html)
  if (update.fontSize) {
    writeStyleRules(node, {
      'font-size': update.fontSize,
    })
  }
}

export function patchComponentSlot(
  document: Document,
  nodeId: string,
  slotKey: string,
  value: string,
): void {
  const node = getNode(document, nodeId, 'component')
  const slot = node.querySelector<HTMLElement>(`[data-slot-key="${slotKey}"]`)
  if (!slot) {
    throw new Error(`Expected slot "${slotKey}" on node "${nodeId}"`)
  }

  slot.textContent = value
}

export function replaceImage(
  document: Document,
  nodeId: string,
  update: { dataUrl: string; alt: string; assetId?: string | null },
): void {
  const node = getNode(document, nodeId, 'image')
  const image = node.querySelector<HTMLImageElement>('img')
  if (image) {
    image.src = update.dataUrl
    image.alt = update.alt
    setOptionalDatasetValue(image, 'assetId', update.assetId)
  } else {
    writeStyleRules(node, {
      'background-image': `url("${update.dataUrl}")`,
    })
    node.setAttribute('aria-label', update.alt)
  }

  setOptionalDatasetValue(node, 'assetId', update.assetId)
}

export function patchObjectLayout(document: Document, nodeId: string, layout: ObjectLayout): void {
  const node = getNode(document, nodeId)
  applyObjectLayout(node, layout)
}

export function patchObjectLayer(document: Document, nodeId: string, action: ObjectLayerAction): void {
  const node = getNode(document, nodeId)
  const slide = node.closest<HTMLElement>(SLIDE_SELECTOR)
  if (!slide) {
    throw new Error(`Expected node "${nodeId}" to belong to a slide`)
  }

  const layerNodes = Array.from(slide.querySelectorAll<HTMLElement>(NODE_SELECTOR))
  const layerNodeOrder = new Map(layerNodes.map((candidate, index) => [candidate, index]))
  layerNodes
    .sort((first, second) => {
      const firstLayer = readObjectLayer(first) ?? 0
      const secondLayer = readObjectLayer(second) ?? 0
      if (firstLayer !== secondLayer) {
        return firstLayer - secondLayer
      }

      return (layerNodeOrder.get(first) ?? 0) - (layerNodeOrder.get(second) ?? 0)
    })

  const currentIndex = layerNodes.indexOf(node)
  if (currentIndex < 0) {
    return
  }

  const [target] = layerNodes.splice(currentIndex, 1)
  const nextIndex =
    action === 'front'
      ? layerNodes.length
      : action === 'back'
        ? 0
        : action === 'forward'
          ? Math.min(currentIndex + 1, layerNodes.length)
          : Math.max(currentIndex - 1, 0)

  layerNodes.splice(nextIndex, 0, target)
  layerNodes.forEach((candidate, index) => {
    applyObjectZIndex(candidate, index + 1)
  })
}

export function readTextStyle(document: Document, nodeId: string, slotKey?: string): TextStyle {
  const target = getTextStyleTarget(document, nodeId, slotKey)
  return {
    fontFamily: readStyleRule(target, 'font-family'),
    fontSize: readStyleRule(target, 'font-size'),
    fontWeight: readStyleRule(target, 'font-weight'),
    fontStyle: readStyleRule(target, 'font-style'),
    textDecoration: readStyleRule(target, 'text-decoration'),
    color: readStyleRule(target, 'color'),
    textAlign: readStyleRule(target, 'text-align'),
    lineHeight: readStyleRule(target, 'line-height'),
    letterSpacing: readStyleRule(target, 'letter-spacing'),
  }
}

export function patchTextStyle(
  document: Document,
  nodeId: string,
  style: Partial<TextStyle>,
): void {
  const node = getNode(document, nodeId, 'text')
  applyTextStyle(node, style)
}

export function patchComponentSlotStyle(
  document: Document,
  nodeId: string,
  slotKey: string,
  style: Partial<TextStyle>,
): void {
  const slot = getComponentSlot(document, nodeId, slotKey)
  applyTextStyle(slot, style)
}

export function patchMotion(
  document: Document,
  nodeId: string,
  update: {
    enabled: boolean
    duration: number
    delay: number
  },
): void {
  const node = getNode(document, nodeId)
  node.dataset.motionEnabled = String(update.enabled)
  node.dataset.motionDuration = String(update.duration)
  node.dataset.motionDelay = String(update.delay)
}

export function patchNodeState(
  document: Document,
  nodeId: string,
  update: {
    locked?: boolean
    hidden?: boolean
  },
): void {
  const node = getNode(document, nodeId)
  if (update.locked !== undefined) {
    setBooleanDatasetState(node, 'editorLocked', update.locked)
  }
  if (update.hidden !== undefined) {
    setBooleanDatasetState(node, 'editorHidden', update.hidden)
    node.hidden = update.hidden
    node.setAttribute('aria-hidden', String(update.hidden))
  }
}

export function ensureAiElementAnchor(
  document: Document,
  args: {
    slideId: string
    selector: string
    elementTag?: string
    elementText?: string
  },
): AiElementAnchor {
  const slide = getSlide(document, args.slideId)
  let target: HTMLElement | null = null
  try {
    target = slide.querySelector<HTMLElement>(args.selector)
      ?? document.querySelector<HTMLElement>(args.selector)
  } catch {
    throw new Error('元素 selector 无效')
  }

  if (!target) {
    throw new Error('无法定位拣选元素')
  }

  if (!slide.contains(target)) {
    throw new Error('拣选元素不属于当前页面')
  }

  assertAiAnchorableElement(target, slide)

  const existingNodeId = target.dataset.nodeId?.trim()
  if (existingNodeId) {
    return {
      selector: stableSlideSelector(args.slideId, 'data-node-id', existingNodeId),
      anchorId: existingNodeId,
      changed: false,
    }
  }

  const existingAnchorId = target.dataset.aiAnchorId?.trim()
  if (existingAnchorId) {
    return {
      selector: stableSlideSelector(args.slideId, 'data-ai-anchor-id', existingAnchorId),
      anchorId: existingAnchorId,
      changed: false,
    }
  }

  const anchorId = allocateAiAnchorId(document, anchorBaseForAiElement(target, args.elementTag, args.elementText))
  target.dataset.aiAnchorId = anchorId
  return {
    selector: stableSlideSelector(args.slideId, 'data-ai-anchor-id', anchorId),
    anchorId,
    changed: true,
  }
}

function normalizeTextPatchHtmlForNode(node: HTMLElement, html: string): string {
  if (!shouldUnwrapParagraphPatch(node)) {
    return html
  }

  const template = node.ownerDocument.createElement('template')
  template.innerHTML = html
  const contentNodes = Array.from(template.content.childNodes).filter(
    (child) => child.nodeType !== Node.TEXT_NODE || (child.textContent ?? '').trim().length > 0,
  )

  if (
    contentNodes.length === 0
    || contentNodes.some((child) => child.nodeType !== Node.ELEMENT_NODE || (child as Element).tagName !== 'P')
  ) {
    return html
  }

  return contentNodes.map((child) => (child as HTMLElement).innerHTML).join('<br>')
}

function shouldUnwrapParagraphPatch(node: HTMLElement): boolean {
  return ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'A', 'BUTTON', 'SPAN', 'SMALL', 'MARK'].includes(node.tagName)
}

export function createImageNode(
  document: Document,
  slideId: string,
  image: {
    nodeId: string
    dataUrl: string
    alt: string
    layout: ObjectLayout
    assetId?: string | null
  },
): void {
  const slide = getSlide(document, slideId)
  const figure = document.createElement('figure')
  const img = document.createElement('img')

  figure.dataset.nodeId = image.nodeId
  figure.dataset.editKind = 'image'
  setOptionalDatasetValue(figure, 'assetId', image.assetId)
  img.src = image.dataUrl
  img.alt = image.alt
  setOptionalDatasetValue(img, 'assetId', image.assetId)
  img.style.setProperty('width', '100%')
  img.style.setProperty('height', '100%')
  img.style.setProperty('display', 'block')
  img.style.setProperty('object-fit', 'contain')

  figure.appendChild(img)
  applyObjectLayout(figure, image.layout)
  slide.appendChild(figure)
}

export function reorderSlides(document: Document, fromSlideId: string, toSlideId: string): void {
  const fromSlide = getSlide(document, fromSlideId)
  const toSlide = getSlide(document, toSlideId)

  toSlide.parentNode?.insertBefore(fromSlide, toSlide)
}

export function duplicateSlide(document: Document, slideId: string): string {
  const slide = getSlide(document, slideId)
  const clone = slide.cloneNode(true) as HTMLElement
  const duplicateId = `${slideId}-copy`

  clone.dataset.slideId = duplicateId
  clone.id = duplicateId
  clone.querySelectorAll<HTMLElement>('[data-node-id]').forEach((node) => {
    const currentId = node.dataset.nodeId
    if (currentId) {
      node.dataset.nodeId = `${currentId}-copy`
    }
  })

  slide.insertAdjacentElement('afterend', clone)
  return duplicateId
}

export function removeSlide(document: Document, slideId: string): void {
  getSlide(document, slideId).remove()
}

export function removeNode(document: Document, nodeId: string): void {
  getNode(document, nodeId).remove()
}

function applyDeckPatchToDocument(document: Document, patch: DeckPatch): void {
  switch (patch.type) {
    case 'text':
      patchText(document, patch.nodeId, {
        html: patch.html,
        fontSize: patch.fontSize,
      })
      return
    case 'component-slot':
      patchComponentSlot(document, patch.nodeId, patch.slotKey, patch.value)
      return
    case 'image':
      replaceImage(document, patch.nodeId, {
        dataUrl: patch.dataUrl,
        alt: patch.alt,
      })
      return
    case 'layout':
      patchObjectLayout(document, patch.nodeId, patch.layout)
      return
    case 'layer':
      patchObjectLayer(document, patch.nodeId, patch.action)
      return
    case 'text-style':
      patchTextStyle(document, patch.nodeId, patch.style)
      return
    case 'component-slot-style':
      patchComponentSlotStyle(document, patch.nodeId, patch.slotKey, patch.style)
      return
    case 'motion':
      patchMotion(document, patch.nodeId, {
        enabled: patch.enabled,
        duration: patch.duration,
        delay: patch.delay,
      })
      return
    case 'node-state':
      patchNodeState(document, patch.nodeId, {
        locked: patch.locked,
        hidden: patch.hidden,
      })
      return
    case 'remove-node':
      removeNode(document, patch.nodeId)
      return
  }
}

export function serializeDeck(document: Document): string {
  const clone = document.cloneNode(true) as Document
  clone.querySelectorAll<HTMLElement>(NODE_SELECTOR).forEach((node) => {
    node.classList.remove('is-selected')
    for (const attribute of EDITOR_ONLY_ATTRIBUTES) {
      node.removeAttribute(attribute)
    }
  })

  return '<!doctype html>\n' + clone.documentElement.outerHTML
}

export function getDeckProfile(document: Document): DeckProfile {
  return detectDeckProfile(document)
}

export function prepareSlideForStaticView(document: Document, slideId: string): void {
  const profile = detectDeckProfile(document)
  const slide = getSlide(document, slideId)

  document.querySelectorAll<HTMLElement>(SLIDE_SELECTOR).forEach((candidate) => {
    candidate.classList.remove('visible')
    candidate.removeAttribute('data-preview-static')
    if (profile === 'html-ppt') {
      candidate.classList.remove('is-active')
      candidate.style.setProperty('opacity', '0')
      candidate.style.setProperty('pointer-events', 'none')
      candidate.style.setProperty('visibility', 'hidden')
      candidate.style.setProperty('z-index', '0')
    }
  })

  slide.classList.add('visible')
  slide.setAttribute('data-preview-static', 'true')

  if (profile === 'html-ppt') {
    slide.classList.add('is-active')
    slide.style.setProperty('opacity', '1')
    slide.style.setProperty('pointer-events', 'auto')
    slide.style.setProperty('visibility', 'visible')
    slide.style.setProperty('z-index', '2')
    closeHtmlPptOverlays(document)
    freezeHtmlPptRuntime(slide)
  }
}

function readNode(document: Document, slideId: string, nodeId: string): DeckNode {
  const node = getNode(document, nodeId)
  const kind = node.dataset.editKind as EditKind
  const motion = readMotion(node)
  const style = readTextStyleFromElement(node)
  const resources = readNodeResources(node)
  const locked = readBooleanDatasetState(node, 'editorLocked') || node.getAttribute('aria-disabled') === 'true'
  const hidden =
    readBooleanDatasetState(node, 'editorHidden')
    || node.hidden === true
    || node.hidden === 'until-found'
    || node.getAttribute('aria-hidden') === 'true'
  const capabilities = readNodeCapabilities(document, node)
  const common = {
    id: nodeId,
    slideId,
    label: readNodeLabel(node, kind),
    role: readNodeRole(node, kind),
    layout: readObjectLayout(node),
    style,
    resources,
    locked,
    hidden,
    motion,
    capabilities,
  }

  if (kind === 'text') {
    return {
      ...common,
      kind,
      html: node.innerHTML.trim(),
    }
  }

  if (kind === 'image') {
    const image = node.querySelector<HTMLImageElement>('img')
    const src = image?.getAttribute('src') ?? readBackgroundImageSource(node) ?? ''
    const alt =
      image?.getAttribute('alt')
      ?? node.getAttribute('aria-label')
      ?? node.getAttribute('title')
      ?? ''
    return {
      ...common,
      kind,
      image: {
        src,
        alt,
      },
    }
  }

  return {
    ...common,
    kind: 'component',
    slots: Object.fromEntries(
      Array.from(node.querySelectorAll<HTMLElement>('[data-slot-key]')).map((slot) => [
        slot.dataset.slotKey ?? '',
        slot.textContent ?? '',
      ]),
    ),
  }
}

function readMotion(node: HTMLElement): MotionMetadata {
  return {
    name: node.dataset.motionName ?? null,
    duration: node.dataset.motionDuration ? Number(node.dataset.motionDuration) : null,
    delay: node.dataset.motionDelay ? Number(node.dataset.motionDelay) : null,
    enabled: node.dataset.motionEnabled !== 'false',
  }
}

function getNode(
  document: Document,
  nodeId: string,
  expectedKind?: EditKind,
): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`)
  if (!node) {
    throw new Error(`Expected editable node "${nodeId}"`)
  }

  if (expectedKind && node.dataset.editKind !== expectedKind) {
    throw new Error(`Expected node "${nodeId}" to be of kind "${expectedKind}"`)
  }

  return node
}

function getComponentSlot(document: Document, nodeId: string, slotKey: string): HTMLElement {
  const node = getNode(document, nodeId, 'component')
  const slot = node.querySelector<HTMLElement>(`[data-slot-key="${slotKey}"]`)
  if (!slot) {
    throw new Error(`Expected slot "${slotKey}" on node "${nodeId}"`)
  }

  return slot
}

function getSlide(document: Document, slideId: string): HTMLElement {
  const slide = document.querySelector<HTMLElement>(`${SLIDE_SELECTOR}[data-slide-id="${slideId}"]`)
  if (!slide) {
    throw new Error(`Expected slide "${slideId}"`)
  }

  return slide
}

function readObjectLayout(node: HTMLElement): ObjectLayout {
  const x = readDatasetNumber(node.dataset.editorX)
  const y = readDatasetNumber(node.dataset.editorY)
  const width = readDatasetNumber(node.dataset.editorWidth)
  const height = readDatasetNumber(node.dataset.editorHeight)
  const zIndex = readObjectLayer(node)

  if (
    node.dataset.editorObject === 'true' &&
    x !== null &&
    y !== null &&
    width !== null &&
    height !== null
  ) {
    return {
      mode: 'floating',
      x,
      y,
      width,
      height,
      zIndex,
    }
  }

  return {
    mode: 'flow',
    x: null,
    y: null,
    width: null,
    height: null,
    zIndex: null,
  }
}

function applyObjectLayout(node: HTMLElement, layout: ObjectLayout): void {
  if (layout.mode === 'flow') {
    delete node.dataset.editorObject
    delete node.dataset.editorX
    delete node.dataset.editorY
    delete node.dataset.editorWidth
    delete node.dataset.editorHeight
    delete node.dataset.editorZ
    writeStyleRules(node, {
      position: null,
      left: null,
      top: null,
      width: null,
      height: null,
      'z-index': null,
    })
    return
  }

  const existingZIndex = readObjectLayer(node)
  const nextZIndex = layout.zIndex === undefined ? existingZIndex : layout.zIndex
  node.dataset.editorObject = 'true'
  node.dataset.editorX = String(Math.round(layout.x))
  node.dataset.editorY = String(Math.round(layout.y))
  node.dataset.editorWidth = String(Math.round(layout.width))
  node.dataset.editorHeight = String(Math.round(layout.height))
  writeStyleRules(node, {
    position: 'absolute',
    left: `${Math.round(layout.x)}px`,
    top: `${Math.round(layout.y)}px`,
    width: `${Math.round(layout.width)}px`,
    height: `${Math.round(layout.height)}px`,
    'z-index': nextZIndex === null ? null : String(Math.round(nextZIndex)),
  })
  if (nextZIndex === null) {
    delete node.dataset.editorZ
    return
  }

  node.dataset.editorZ = String(Math.round(nextZIndex))
}

function readDatasetNumber(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readObjectLayer(node: HTMLElement): number | null {
  return readDatasetNumber(node.dataset.editorZ) ?? readDatasetNumber(node.style.getPropertyValue('z-index'))
}

function applyObjectZIndex(node: HTMLElement, zIndex: number): void {
  node.dataset.editorZ = String(zIndex)
  const layout = readObjectLayout(node)
  const layerStyles: Partial<Record<(typeof LAYOUT_STYLE_PROPERTIES)[number], string>> = {
    'z-index': String(zIndex),
  }

  if (layout.mode !== 'floating') {
    layerStyles.position = readStyleRule(node, 'position') || 'relative'
  }

  writeStyleRules(node, layerStyles)
}

function getTextStyleTarget(document: Document, nodeId: string, slotKey?: string): HTMLElement {
  if (slotKey) {
    return getComponentSlot(document, nodeId, slotKey)
  }

  return getNode(document, nodeId, 'text')
}

function detectDeckProfile(document: Document): DeckProfile {
  const explicitProfile = document.documentElement.getAttribute('data-fs-deck-profile')
  if (explicitProfile === 'html-ppt' || explicitProfile === 'frontend-slides') {
    return explicitProfile
  }

  if (
    document.querySelector('.notes-overlay, .overview-overlay, .deck > section.slide, section.slide[data-title], [data-anim], .slide.is-active')
  ) {
    return 'html-ppt'
  }

  return 'frontend-slides'
}

function collectEditableElements(slide: HTMLElement, profile: DeckProfile): HTMLElement[] {
  const selector = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, img'

  if (profile !== 'html-ppt') {
    return Array.from(slide.querySelectorAll<HTMLElement>(selector))
  }

  const roots = Array.from(slide.querySelectorAll<HTMLElement>('main'))
  const searchRoots = roots.length ? roots : [slide]

  return searchRoots.flatMap((root) => {
    const candidates = Array.from(root.querySelectorAll<HTMLElement>('*')).filter((element) => {
      return isHtmlPptEditableElement(element)
        && !element.closest(
          '.deck-header, .deck-footer, .notes, .notes-overlay, .overview-overlay, .progress, .progress-bar, .nav-dots, svg',
        )
    })

    return candidates.filter((element) => {
      return !candidates.some((candidate) => candidate !== element && candidate.contains(element))
    })
  })
}

function isHtmlPptEditableElement(element: HTMLElement): boolean {
  const tagName = element.tagName

  if (tagName === 'IMG') {
    return true
  }

  if (hasBackgroundImage(element)) {
    return true
  }

  if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'BLOCKQUOTE', 'FIGCAPTION', 'PRE', 'TH', 'TD', 'A', 'BUTTON', 'SMALL', 'CAPTION', 'DT', 'DD', 'MARK'].includes(tagName)) {
    return hasVisibleTextContent(element)
  }

  if (tagName === 'CODE') {
    return !element.closest('pre') && hasVisibleTextContent(element)
  }

  if (tagName === 'SPAN') {
    return !element.closest('pre')
      && hasVisibleTextContent(element)
      && /(^|\s)(pill|tag|badge|chip|quote|focus|gradient-text|dim|dim2|num|label|value|stat|kicker|eyebrow)(\s|$)/.test(element.className)
  }

  if (tagName === 'DIV') {
    return hasVisibleTextContent(element)
      && /(^|\s)(tag|quote|prompt|big|big-num|insight|footer|lede|sub|label|value|step|txt|hero|metric)(\s|$)/.test(element.className)
  }

  return false
}

function hasVisibleTextContent(element: HTMLElement): boolean {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim().length > 0
}

function stableSlideSelector(slideId: string, attributeName: string, value: string): string {
  return `section.slide[data-slide-id="${attrEscape(slideId)}"] [${attributeName}="${attrEscape(value)}"]`
}

function attrEscape(value: string): string {
  return value.replace(/"/g, '\\"')
}

function assertAiAnchorableElement(target: HTMLElement, slide: HTMLElement): void {
  const tagName = target.tagName.toLowerCase()
  const ownerDocument = target.ownerDocument
  if (
    target === slide
    || target === ownerDocument.documentElement
    || target === ownerDocument.body
    || ['html', 'head', 'body', 'script', 'style', 'link', 'meta', 'title'].includes(tagName)
    || target.classList.contains('deck')
    || target.classList.contains('slide')
  ) {
    throw new Error('不能锚定页面骨架元素')
  }
}

function anchorBaseForAiElement(target: HTMLElement, elementTag?: string, elementText?: string): string {
  const tagName = (elementTag || target.tagName || 'element').toLowerCase()
  const text = (elementText || target.textContent || '').replace(/\s+/g, ' ').trim()
  if (text) {
    return `selected-${tagName}`
  }

  const role = target.getAttribute('data-role') || target.getAttribute('role') || ''
  if (role) {
    return `selected-${role}`
  }

  return `selected-${tagName}`
}

function allocateAiAnchorId(document: Document, base: string): string {
  const normalized = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'selected-element'
  const used = new Set(
    Array.from(document.querySelectorAll<HTMLElement>('[data-ai-anchor-id]'))
      .map((node) => node.dataset.aiAnchorId)
      .filter((value): value is string => Boolean(value)),
  )
  let candidate = normalized
  let index = 1
  while (used.has(candidate)) {
    candidate = `${normalized}-${index}`
    index += 1
  }
  return candidate
}

function hasBackgroundImage(element: HTMLElement): boolean {
  return Boolean(readBackgroundImageSource(element))
}

function readBackgroundImageSource(element: HTMLElement): string | null {
  const styleValue = element.style.getPropertyValue('background-image')
  const match = styleValue.match(/url\((['"]?)(.*?)\1\)/)
  return match?.[2]?.trim() || element.dataset.bg || null
}

function readNodeLabel(node: HTMLElement, kind: EditKind): string {
  if (kind === 'image') {
    const image = node.querySelector<HTMLImageElement>('img')
    return image?.getAttribute('alt')
      ?? node.getAttribute('aria-label')
      ?? node.getAttribute('title')
      ?? '图片'
  }

  return (node.textContent ?? '').replace(/\s+/g, ' ').trim() || node.dataset.nodeId || '未命名对象'
}

function readNodeRole(node: HTMLElement, kind: EditKind): string {
  if (kind === 'image') {
    return '图片'
  }

  const tagName = node.tagName
  if (/^H[1-6]$/.test(tagName)) {
    return '标题'
  }
  if (tagName === 'A') {
    return '链接'
  }
  if (tagName === 'BUTTON') {
    return '按钮'
  }
  if (tagName === 'LI') {
    return '列表项'
  }
  if (tagName === 'TH' || tagName === 'TD') {
    return '表格'
  }
  if (tagName === 'PRE' || tagName === 'CODE') {
    return '代码'
  }
  if (tagName === 'BLOCKQUOTE') {
    return '引用'
  }
  if (tagName === 'FIGCAPTION' || tagName === 'CAPTION') {
    return '说明'
  }
  if (tagName === 'SMALL') {
    return '注释'
  }
  if (/(^|\s)(eyebrow|kicker|pill|tag|badge|chip|label)(\s|$)/.test(node.className)) {
    return '标签'
  }

  return '文本'
}

function readSlideTitle(document: Document, slideId: string): string | null {
  const slide = getSlide(document, slideId)
  const explicitTitle = slide.dataset.title?.trim()
  if (explicitTitle) {
    return explicitTitle
  }

  const heading = slide.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6')
  const headingText = heading?.textContent?.trim()
  if (headingText) {
    return headingText
  }

  return null
}

function readNodeCapabilities(document: Document, node: HTMLElement): NodeCapabilities {
  const profile = detectDeckProfile(document)
  const kind = node.dataset.editKind as EditKind
  const isFloatingObject = node.dataset.editorObject === 'true'
  const locked = readBooleanDatasetState(node, 'editorLocked') || node.getAttribute('aria-disabled') === 'true'

  if (locked) {
    return {
      canEditText: false,
      canReplaceImage: false,
      canFloat: false,
      canDelete: false,
      canEditMotion: false,
    }
  }

  if (profile === 'html-ppt') {
    return {
      canEditText: kind === 'text',
      canReplaceImage: kind === 'image',
      canFloat: isFloatingObject,
      canDelete: isFloatingObject,
      canEditMotion: false,
    }
  }

  return {
    canEditText: kind === 'text',
    canReplaceImage: kind === 'image',
    canFloat: true,
    canDelete: true,
    canEditMotion: true,
  }
}

function freezeHtmlPptRuntime(slide: HTMLElement): void {
  const forceCompleteStyles: Record<string, string> = {
    opacity: '1',
    transform: 'none',
    filter: 'none',
    animation: 'none',
    'animation-duration': '0s',
    'animation-delay': '0s',
    'animation-fill-mode': 'forwards',
    'transition-duration': '0s',
    'transition-delay': '0s',
  }

  slide.querySelectorAll<HTMLElement>('[data-anim]').forEach((node) => {
    appendInlineStyles(node, forceCompleteStyles)
  })

  slide.querySelectorAll<HTMLElement>('[data-anim="stagger-list"] > *').forEach((node) => {
    appendInlineStyles(node, forceCompleteStyles)
  })

  slide.querySelectorAll<HTMLElement>('.anim-stagger-list > *').forEach((node) => {
    appendInlineStyles(node, forceCompleteStyles)
  })

  slide.querySelectorAll<HTMLElement>('.stagger > *').forEach((node) => {
    appendInlineStyles(node, forceCompleteStyles)
  })

  slide.querySelectorAll<HTMLElement>('.path-draw path, .path-draw line, .path-draw circle').forEach((node) => {
    appendInlineStyles(node, {
      'stroke-dashoffset': '0',
      'animation-duration': '0s',
      'animation-delay': '0s',
      'animation-fill-mode': 'forwards',
    })
  })

  slide.querySelectorAll<HTMLElement>('.bar-fill').forEach((node) => {
    appendInlineStyles(node, {
      transform: 'scaleX(1)',
      'transition-duration': '0s',
      'transition-delay': '0s',
    })
  })

  slide.querySelectorAll<HTMLElement>('.counter[data-to]').forEach((node) => {
    node.textContent = node.dataset.to ?? node.textContent ?? ''
  })

  // Finish all WAAPI animations so they jump to their final state
  try {
    for (const animation of slide.ownerDocument.getAnimations()) {
      animation.finish()
    }
  } catch {
    // Some animations may throw if they can't be finished (e.g., inactive timelines)
  }
}

function closeHtmlPptOverlays(document: Document): void {
  document.querySelectorAll<HTMLElement>('.notes-overlay, .overview, .overview-overlay').forEach((node) => {
    node.classList.remove('open')
    node.setAttribute('aria-hidden', 'true')
    appendInlineStyles(node, {
      display: 'none',
      opacity: '0',
      'pointer-events': 'none',
    })
  })
}

function applyTextStyle(node: HTMLElement, style: Partial<TextStyle>): void {
  writeStyleRules(node, {
    'font-family': style.fontFamily,
    'font-size': style.fontSize,
    'font-weight': style.fontWeight,
    'font-style': style.fontStyle,
    'text-decoration': style.textDecoration,
    color: style.color,
    'text-align': style.textAlign,
    'line-height': style.lineHeight,
    'letter-spacing': style.letterSpacing,
  })
}

function validateObjectLayout(layout: ObjectLayout): void {
  if (layout.mode === 'flow') {
    return
  }

  const fields = {
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
  }
  for (const [field, value] of Object.entries(fields)) {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid layout value for "${field}"`)
    }
  }
  if (layout.width <= 0 || layout.height <= 0) {
    throw new Error('Invalid layout dimensions: width and height must be positive')
  }
  if (layout.zIndex !== undefined && layout.zIndex !== null && !Number.isFinite(layout.zIndex)) {
    throw new Error('Invalid layout value for "zIndex"')
  }
}

function validateMotionPatch(update: { duration: number; delay: number }): void {
  if (!Number.isFinite(update.duration) || update.duration < 0) {
    throw new Error('Invalid motion duration')
  }
  if (!Number.isFinite(update.delay) || update.delay < 0) {
    throw new Error('Invalid motion delay')
  }
}

function validateStylePatch(style: Partial<TextStyle>): void {
  const propertyNames: Partial<Record<keyof TextStyle, string>> = {
    fontFamily: 'font-family',
    fontSize: 'font-size',
    fontWeight: 'font-weight',
    fontStyle: 'font-style',
    textDecoration: 'text-decoration',
    color: 'color',
    textAlign: 'text-align',
    lineHeight: 'line-height',
    letterSpacing: 'letter-spacing',
  }

  for (const [field, value] of Object.entries(style) as Array<[keyof TextStyle, string | undefined]>) {
    if (value === undefined || value === '') {
      continue
    }

    const propertyName = propertyNames[field] ?? field
    if (!isSafeStyleValue(value)) {
      throw new Error(`Invalid style value "${value}" for "${propertyName}"`)
    }
  }
}

function isSafeStyleValue(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return Boolean(normalized)
    && !normalized.includes('javascript:')
    && !normalized.includes('expression(')
    && !normalized.includes('<')
    && !normalized.includes('>')
    && !normalized.includes('{')
    && !normalized.includes('}')
}

function readStyleRule(node: HTMLElement, property: string): string {
  const rules = parseStyleRules(node.getAttribute('style'))
  return rules[property] ?? ''
}

function readTextStyleFromElement(node: HTMLElement): TextStyle {
  return {
    fontFamily: readStyleRule(node, 'font-family'),
    fontSize: readStyleRule(node, 'font-size'),
    fontWeight: readStyleRule(node, 'font-weight'),
    fontStyle: readStyleRule(node, 'font-style'),
    textDecoration: readStyleRule(node, 'text-decoration'),
    color: readStyleRule(node, 'color'),
    textAlign: readStyleRule(node, 'text-align'),
    lineHeight: readStyleRule(node, 'line-height'),
    letterSpacing: readStyleRule(node, 'letter-spacing'),
  }
}

function readNodeResources(node: HTMLElement): NodeResource[] {
  if (node.dataset.editKind !== 'image') {
    return []
  }

  const image = node.querySelector<HTMLImageElement>('img')
  const backgroundSrc = readBackgroundImageSource(node)
  if (!image && !backgroundSrc) {
    return []
  }

  const src = image?.getAttribute('src') ?? backgroundSrc ?? ''
  const alt =
    image?.getAttribute('alt')
    ?? node.getAttribute('aria-label')
    ?? node.getAttribute('title')
    ?? ''

  return [
    {
      type: 'image',
      src,
      alt,
      assetId: node.dataset.assetId ?? image?.dataset.assetId ?? null,
    },
  ]
}

function readBooleanDatasetState(node: HTMLElement, key: 'editorHidden' | 'editorLocked'): boolean {
  return node.dataset[key] === 'true'
}

function setBooleanDatasetState(
  node: HTMLElement,
  key: 'editorHidden' | 'editorLocked',
  value: boolean,
): void {
  if (value) {
    node.dataset[key] = 'true'
    return
  }

  delete node.dataset[key]
}

function setOptionalDatasetValue(node: HTMLElement, key: 'assetId', value: string | null | undefined): void {
  if (value) {
    node.dataset[key] = value
    return
  }

  delete node.dataset[key]
}

function writeStyleRules(
  node: HTMLElement,
  updates: Partial<Record<(typeof TEXT_STYLE_PROPERTIES)[number] | (typeof LAYOUT_STYLE_PROPERTIES)[number], string | null | undefined>>,
): void {
  const rules = parseStyleRules(node.getAttribute('style'))

  for (const [property, value] of Object.entries(updates)) {
    if (!property) {
      continue
    }

    if (value === null || value === undefined || value === '') {
      delete rules[property]
      continue
    }

    rules[property] = value
  }

  const serialized = serializeStyleRules(rules)
  if (serialized) {
    node.setAttribute('style', serialized)
    return
  }

  node.removeAttribute('style')
}

function parseStyleRules(style: string | null): Record<string, string> {
  return Object.fromEntries(
    (style ?? '')
      .split(';')
      .map((rule) => rule.trim())
      .filter(Boolean)
      .map((rule) => {
        const separatorIndex = rule.indexOf(':')
        if (separatorIndex === -1) {
          return ['', '']
        }

        return [rule.slice(0, separatorIndex).trim(), rule.slice(separatorIndex + 1).trim()]
      })
      .filter(([property, value]) => property && value),
  )
}

function serializeStyleRules(rules: Record<string, string>): string {
  const orderedEntries = [
    ...TEXT_STYLE_PROPERTIES,
    ...LAYOUT_STYLE_PROPERTIES,
    ...Object.keys(rules).filter(
      (property) => !TEXT_STYLE_PROPERTIES.includes(property as (typeof TEXT_STYLE_PROPERTIES)[number]) && !LAYOUT_STYLE_PROPERTIES.includes(property as (typeof LAYOUT_STYLE_PROPERTIES)[number]),
    ),
  ]
    .filter((property, index, values) => values.indexOf(property) === index)
    .map((property) => [property, rules[property]] as const)
    .filter(([, value]) => value)

  return orderedEntries.map(([property, value]) => `${property}: ${value};`).join(' ')
}

function appendInlineStyles(node: Element, updates: Record<string, string>): void {
  const current = parseStyleRules(node.getAttribute('style'))
  for (const [property, value] of Object.entries(updates)) {
    current[property] = value
  }

  const serialized = serializeStyleRules(current)
  if (serialized) {
    node.setAttribute('style', serialized)
  }
}
