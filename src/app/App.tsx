import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent, PointerEvent as ReactPointerEvent, ReactElement } from 'react'

import {
  adaptImportedHtmlToDeck,
  createDeckDocument,
  createImageNode,
  duplicateSlide,
  ensureAiElementAnchor,
  patchComponentSlotStyle,
  patchObjectLayer,
  patchObjectLayout,
  parseControlledDeck,
  patchComponentSlot,
  patchMotion,
  patchNodeState,
  patchText,
  patchTextStyle,
  readTextStyle,
  removeNode,
  removeSlide,
  reorderSlides,
  replaceImage,
  serializeDeck,
  type ObjectLayout,
  type ParsedDeck,
  type TextStyle,
} from '../deck-contract/deckContract'
import { loadExportDeckToHtml } from '../export-html/loadExportDeckToHtml'
import { loadExportDeckToPdf } from '../export-pdf/loadExportDeckToPdf'
import {
  applyCanvasDimensions,
  calculatePreviewScale,
  resolveCanvasDimensions,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
} from './previewLayout'
import { AiPanel, type CandidatePreview } from './AiPanel'
import { useAgentSession } from './useAgentSession'
import { RichTextNodeEditor } from './editor/RichTextNodeEditor'
import {
  SmartExportDrawer,
  type SmartExportLogEntry,
  type SmartExportPanelState,
} from './editor/SmartExportDrawer'
import { getNodeKindLabel, truncateNodeLabel } from './editor/editorLabels'
import {
  DEFAULT_IMAGE_HEIGHT,
  DEFAULT_IMAGE_WIDTH,
  createCenteredImageLayout,
  resolveDraggedObjectLayout,
  resolveResizedObjectLayout,
  type ObjectInteractionHandle,
} from './editor/objectLayout'
import type { HtmlPptAsset } from '../agent/protocol'
import { pptxExportEventSchema, type PptxExportEvent } from '../agent/protocol'
import { blankDeckHtml } from '../blankDeck'
import { Link, useInRouterContext } from 'react-router-dom'
import { HTML_PPT_SKILL_GUIDE_PATH } from './routePaths'

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 960 540'%3E%3Crect width='960' height='540' fill='%23f0ebe4'/%3E%3Crect x='72' y='72' width='816' height='396' rx='18' fill='%23fffaf1' stroke='%23d8cfc0'/%3E%3Cpath d='M144 372l152-156 132 124 164-180 224 212H144Z' fill='%23d95d39' opacity='.78'/%3E%3Ccircle cx='336' cy='192' r='42' fill='%23201715' opacity='.14'/%3E%3C/svg%3E"
const CANDIDATE_PREVIEW_LIMIT = 3

type AppProps = {
  initialDeckHtml?: string
  initialAgentSessionId?: string
  initialComposerText?: string
  initialLeftPanelMode?: LeftPanelMode
  initialStatusMessage?: string
}

type PendingImageAction =
  | {
      mode: 'insert'
      slideId: string
    }
  | {
      mode: 'replace'
      nodeId: string
    }

type TextTarget = {
  nodeId: string
  slotKey?: string
}

type SelectedAiElement = {
  slideId: string
  selector: string
  elementTag?: string
  elementText?: string
}

type AgentDrawerTab = 'transcript' | 'candidate'
type WorkspaceMode = 'edit' | 'compare'
type FitMode = 'adaptive' | 'native'
type LeftPanelMode = 'pages' | 'inspector' | 'agent'
type AgentPhase = 'queued' | 'searching' | 'drafting' | 'finalizing'
type ObjectGeometryDraft = {
  x: string
  y: string
  width: string
  height: string
}

type RuntimeContentSize = {
  width: number
  height: number
}

type ObjectInteraction = {
  mode: 'drag' | 'resize'
  handle?: ObjectInteractionHandle
  nodeId: string
  startClientX: number
  startClientY: number
  startLayout: Extract<ObjectLayout, { mode: 'floating' }>
}

const EMPTY_TEXT_STYLE: TextStyle = {
  fontFamily: '',
  fontSize: '',
  fontWeight: '',
  fontStyle: '',
  textDecoration: '',
  color: '',
  textAlign: '',
  lineHeight: '',
  letterSpacing: '',
}

export function App({
  initialDeckHtml,
  initialAgentSessionId,
  initialComposerText,
  initialLeftPanelMode,
  initialStatusMessage,
}: AppProps): ReactElement {
  const isInRouter = useInRouterContext()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const previewCanvasRef = useRef<HTMLDivElement | null>(null)
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null)
  const objectInteractionRef = useRef<ObjectInteraction | null>(null)
  const pendingImageActionRef = useRef<PendingImageAction | null>(null)
  const smartExportAbortRef = useRef<AbortController | null>(null)
  const smartExportLogCounterRef = useRef(0)
  const [history, setHistory] = useState<string[]>(() => [loadInitialDeck(initialDeckHtml)])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedTextTarget, setSelectedTextTarget] = useState<TextTarget | null>(null)
  const [pendingImageAction, setPendingImageAction] = useState<PendingImageAction | null>(null)
  const [textStyleDraft, setTextStyleDraft] = useState<TextStyle>(EMPTY_TEXT_STYLE)
  const [mergeKey, setMergeKey] = useState<string | null>(null)
  const [isExportingHtml, setIsExportingHtml] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [isExportingSmartPptx, setIsExportingSmartPptx] = useState(false)
  const [smartExportPanelState, setSmartExportPanelState] = useState<SmartExportPanelState>('idle')
  const [smartExportPhase, setSmartExportPhase] = useState<Extract<PptxExportEvent, { type: 'status' }>['phase']>('queued')
  const [smartExportLogs, setSmartExportLogs] = useState<SmartExportLogEntry[]>([])
  const [smartExportReadyEvent, setSmartExportReadyEvent] = useState<Extract<PptxExportEvent, { type: 'pptx_export_ready' }>>()
  const [smartExportError, setSmartExportError] = useState<string | null>(null)
  const [isDownloadingSmartExport, setIsDownloadingSmartExport] = useState(false)
  const [status, setStatus] = useState(initialStatusMessage ?? '已加载可编辑 HTML 演示')
  const [generationMode, setGenerationMode] = useState<'from-scratch' | 'from-current'>('from-current')
  const [selectedAiElement, setSelectedAiElement] = useState<SelectedAiElement | null>(null)
  const [isElementPicking, setIsElementPicking] = useState(false)
  const [pendingMessageImageAssets, setPendingMessageImageAssets] = useState<HtmlPptAsset[]>([])
  const [agentDrawerTab, setAgentDrawerTab] = useState<AgentDrawerTab>('transcript')
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('edit')
  const [fitMode, setFitMode] = useState<FitMode>('adaptive')
  const [leftPanelMode, setLeftPanelMode] = useState<LeftPanelMode>(initialLeftPanelMode ?? 'pages')
  const [objectGeometryDraft, setObjectGeometryDraft] = useState<ObjectGeometryDraft>({
    x: '',
    y: '',
    width: '',
    height: '',
  })
  const [runtimeContentSize, setRuntimeContentSize] = useState<RuntimeContentSize | null>(null)
  const [previewFrame, setPreviewFrame] = useState({
    width: DEFAULT_CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
  })
  const {
    sessionId,
    candidate,
    composerText,
    replyText,
    pendingInput,
    pendingFormAnswers,
    activePhase,
    activeStatus,
    streamingAssistantText,
    uploadedAssets,
    isSubmitting,
    transcript,
    setComposerText,
    setReplyText,
    updatePendingFormAnswer,
    uploadHtmlPptAsset,
    abortTurn,
    clearConversation,
    submitTurn,
    markCandidateDisposition,
    isOptimizing,
    optimizedPrompt,
    optimizationExplanation,
    setOptimizedPrompt,
    optimizePrompt,
    applyOptimizedPrompt,
    dismissOptimization,
  } = useAgentSession({
    initialComposerText,
    sessionId: initialAgentSessionId,
  })

  const currentHtml = history[historyIndex]
  const historyRef = useRef(history)
  const historyIndexRef = useRef(historyIndex)
  const mergeKeyRef = useRef(mergeKey)
  const textStyleDraftRef = useRef(textStyleDraft)
  const currentDocument = useMemo(() => createDeckDocument(currentHtml), [currentHtml])
  const currentDeck = useMemo(() => parseControlledDeck(currentDocument), [currentDocument])
  const canvasDimensions = useMemo(() => resolveCanvasDimensions(currentDocument), [currentDocument])

  useEffect(() => {
    const previewCanvas = previewCanvasRef.current
    if (!previewCanvas) {
      return
    }

    const syncPreviewFrame = () => {
      const width = previewCanvas.clientWidth
      const height = previewCanvas.clientHeight
      if (!width || !height) {
        return
      }

      setPreviewFrame({
        width,
        height,
      })
    }

    syncPreviewFrame()

    window.addEventListener('resize', syncPreviewFrame)

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            syncPreviewFrame()
          })

    resizeObserver?.observe(previewCanvas)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncPreviewFrame)
    }
  }, [])

  useEffect(() => {
    if (!activeSlideId || !currentDeck.slideOrder.includes(activeSlideId)) {
      setActiveSlideId(currentDeck.slideOrder[0] ?? null)
    }
  }, [activeSlideId, currentDeck.slideOrder])

  useEffect(() => {
    if (selectedNodeId && !currentDeck.nodes[selectedNodeId]) {
      setSelectedNodeId(null)
    }
  }, [currentDeck.nodes, selectedNodeId])

  useEffect(() => {
    if (selectedTextTarget && !currentDeck.nodes[selectedTextTarget.nodeId]) {
      setSelectedTextTarget(null)
    }
  }, [currentDeck.nodes, selectedTextTarget])

  const activeSlide = useMemo(
    () => currentDeck.slides.find((slide) => slide.id === activeSlideId) ?? currentDeck.slides[0] ?? null,
    [activeSlideId, currentDeck.slides],
  )
  const selectedNode = selectedNodeId ? currentDeck.nodes[selectedNodeId] : null
  const selectedFloatingLayout =
    selectedNode?.layout.mode === 'floating' ? selectedNode.layout : null
  const selectedFloatingObjectLayout = selectedNode?.layout.mode === 'floating' ? selectedNode.layout : null
  const compareCandidate = candidate?.type === 'html_candidate_ready' ? candidate : null
  const isComparingCandidate = workspaceMode === 'compare' && Boolean(compareCandidate)
  const shouldShowAgentProgress = Boolean(activeStatus && isSubmitting && !candidate)
  const agentProgressPhase = activePhase ?? (candidate ? 'finalizing' : 'queued')
  const agentProgressText = streamingAssistantText.trim() || activeStatus || '智能体正在处理'
  const candidatePreviews = useMemo(() => buildCandidatePreviews(candidate), [candidate])
  const previewMetricsLabel =
    fitMode === 'adaptive'
      ? `画布 ${canvasDimensions.width}×${canvasDimensions.height} · 适配 ${Math.min(
          previewFrame.width / canvasDimensions.width,
          previewFrame.height / canvasDimensions.height,
        ).toFixed(2)}`
      : `画布 ${canvasDimensions.width}×${canvasDimensions.height} · 原尺寸`
  const runtimeOverflowLabel =
    runtimeContentSize && (runtimeContentSize.width > canvasDimensions.width || runtimeContentSize.height > canvasDimensions.height)
      ? '内容可能超出画布'
      : null
  const previewLayout = useMemo(
    () =>
      buildRuntimePreviewLayout({
        frameWidth: previewFrame.width,
        frameHeight: previewFrame.height,
        viewportWidth: canvasDimensions.width,
        viewportHeight: canvasDimensions.height,
        fitMode,
      }),
    [
      canvasDimensions.height,
      canvasDimensions.width,
      fitMode,
      previewFrame.height,
      previewFrame.width,
    ],
  )
  const runtimePreviewHtml = useMemo(
    () => buildRuntimePreviewHtml(currentHtml, activeSlide?.id ?? null),
    [activeSlide?.id, currentHtml],
  )
  const slideThumbSrcDocs = useMemo(() => {
    const map: Record<string, string> = {}
    for (const slideId of currentDeck.slideOrder) {
      map[slideId] = buildRuntimePreviewHtml(currentHtml, slideId)
    }
    return map
  }, [currentHtml, currentDeck.slideOrder])
  const workspaceClassName = [
    'workspace',
    'is-left-panel-wide',
    isComparingCandidate ? 'is-comparing' : '',
  ].filter(Boolean).join(' ')

  useEffect(
    () => () => {
      smartExportAbortRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    if (!selectedTextTarget) {
      setTextStyleDraft(EMPTY_TEXT_STYLE)
      textStyleDraftRef.current = EMPTY_TEXT_STYLE
      return
    }

    const nextStyle = readTextStyle(currentDocument, selectedTextTarget.nodeId, selectedTextTarget.slotKey)
    setTextStyleDraft(nextStyle)
    textStyleDraftRef.current = nextStyle
  }, [currentDocument, selectedTextTarget])

  useEffect(() => {
    if (!selectedFloatingLayout) {
      setObjectGeometryDraft({
        x: '',
        y: '',
        width: '',
        height: '',
      })
      return
    }

    setObjectGeometryDraft({
      x: String(Math.round(selectedFloatingLayout.x)),
      y: String(Math.round(selectedFloatingLayout.y)),
      width: String(Math.round(selectedFloatingLayout.width)),
      height: String(Math.round(selectedFloatingLayout.height)),
    })
  }, [selectedFloatingLayout])

  useEffect(() => {
    if (!activeStatus) {
      return
    }

    setStatus(activeStatus)
  }, [activeStatus])

  useEffect(() => {
    if (initialStatusMessage) {
      setStatus(initialStatusMessage)
    }
  }, [initialStatusMessage])

  useEffect(() => {
    if (initialLeftPanelMode) {
      setLeftPanelMode(initialLeftPanelMode)
    }
  }, [initialLeftPanelMode])

  useEffect(() => {
    if (!candidate) {
      setWorkspaceMode('edit')
      return
    }

    setLeftPanelMode('agent')
  }, [candidate])

  useEffect(() => {
    if (pendingInput) {
      setLeftPanelMode('agent')
      setAgentDrawerTab('transcript')
    }
  }, [pendingInput])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as {
        source?: string
        type?: string
        slideId?: string
        nodeId?: string
        selector?: string
        elementTag?: string
        elementText?: string
      } | null
      if (!data || data.source !== 'html-slide-editor-preview') {
        return
      }
      if (event.source && event.source !== previewIframeRef.current?.contentWindow) {
        return
      }

      if (data.type === 'content-size') {
        const width = Number((data as { width?: unknown }).width)
        const height = Number((data as { height?: unknown }).height)
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          setRuntimeContentSize((current) => {
            const next = {
              width: Math.ceil(width),
              height: Math.ceil(height),
            }
            return current?.width === next.width && current.height === next.height ? current : next
          })
        }
        return
      }

      if (data.type === 'active-slide' && data.slideId && currentDeck.slideOrder.includes(data.slideId)) {
        setActiveSlideId(data.slideId)
      }

      if (data.type === 'select-node' && data.nodeId && currentDeck.nodes[data.nodeId]) {
        const node = currentDeck.nodes[data.nodeId]
        setSelectedNodeId(data.nodeId)
        setSelectedTextTarget(node.kind === 'text' ? { nodeId: data.nodeId } : null)
        setMergeKey(null)
        setLeftPanelMode('inspector')
      }

      if (data.type === 'element-picked' && data.slideId && data.selector) {
        try {
          const result = ensureAiElementAnchor(currentDocument, {
            slideId: data.slideId,
            selector: data.selector,
            elementTag: data.elementTag,
            elementText: data.elementText,
          })
          if (result.changed) {
            const nextHtml = serializeDeck(currentDocument)
            setHistory((current) => current.map((entry, index) => (index === historyIndexRef.current ? nextHtml : entry)))
            historyRef.current = historyRef.current.map((entry, index) => (index === historyIndexRef.current ? nextHtml : entry))
          }
          setSelectedAiElement({
            slideId: data.slideId,
            selector: result.selector,
            elementTag: data.elementTag,
            elementText: data.elementText,
          })
          setIsElementPicking(false)
          setStatus('已拣选元素，可输入局部修改要求')
        } catch (error) {
          setStatus(error instanceof Error ? error.message : '拣选元素失败')
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [currentDeck.nodes, currentDeck.slideOrder, currentDocument])

  useEffect(() => {
    setRuntimeContentSize(null)
  }, [activeSlide?.id, currentHtml])

  useEffect(() => {
    if (!activeSlide?.id) {
      return
    }

    previewIframeRef.current?.contentWindow?.postMessage(
      {
        source: 'html-slide-editor',
        type: 'go-to-slide',
        slideId: activeSlide.id,
      },
      '*',
    )
  }, [activeSlide?.id, runtimePreviewHtml])

  useEffect(() => {
    previewIframeRef.current?.contentWindow?.postMessage(
      {
        source: 'html-slide-editor',
        type: 'select-node',
        nodeId: selectedNodeId,
      },
      '*',
    )
  }, [selectedNodeId, runtimePreviewHtml])

  useEffect(() => {
    previewIframeRef.current?.contentWindow?.postMessage(
      {
        source: 'html-slide-editor',
        type: 'set-element-pick-mode',
        enabled: isElementPicking,
      },
      '*',
    )
  }, [isElementPicking, runtimePreviewHtml])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && selectedNodeId) {
        if (isTypingTarget(event.target)) {
          return
        }

        const node = currentDeck.nodes[selectedNodeId]
        if (node?.layout.mode === 'floating' && node.capabilities.canFloat) {
          event.preventDefault()
          const step = event.shiftKey ? 10 : 1
          const delta = {
            ArrowLeft: { x: -step, y: 0 },
            ArrowRight: { x: step, y: 0 },
            ArrowUp: { x: 0, y: -step },
            ArrowDown: { x: 0, y: step },
          }[event.key] ?? { x: 0, y: 0 }
          commitDocumentChange(
            (document) => {
              patchObjectLayout(document, node.id, resolveDraggedObjectLayout(node.layout as Extract<ObjectLayout, { mode: 'floating' }>, delta.x, delta.y, canvasDimensions.width, canvasDimensions.height))
            },
            {
              nextSelectedNodeId: node.id,
              nextSelectedTextTarget: selectedTextTarget ?? undefined,
              merge: `nudge:${node.id}`,
              statusMessage: `已微调节点 ${node.id}`,
            },
          )
        }
        return
      }

      if ((event.key !== 'Delete' && event.key !== 'Backspace') || !selectedNodeId) {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      event.preventDefault()
      handleDeleteSelectedNode(selectedNodeId)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedNodeId, currentHtml, mergeKey, currentDeck.nodes, canvasDimensions.width, canvasDimensions.height, selectedTextTarget])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = objectInteractionRef.current
      if (!interaction) {
        return
      }

      const scale = previewLayout.previewScale || 1
      const deltaX = (event.clientX - interaction.startClientX) / scale
      const deltaY = (event.clientY - interaction.startClientY) / scale
      const nextLayout =
        interaction.mode === 'drag'
          ? resolveDraggedObjectLayout(interaction.startLayout, deltaX, deltaY, canvasDimensions.width, canvasDimensions.height)
          : resolveResizedObjectLayout(
              interaction.startLayout,
              interaction.handle ?? 'se',
              deltaX,
              deltaY,
              canvasDimensions.width,
              canvasDimensions.height,
            )

      commitDocumentChange(
        (document) => {
          patchObjectLayout(document, interaction.nodeId, nextLayout)
        },
        {
          nextSelectedNodeId: interaction.nodeId,
          nextSelectedTextTarget: null,
          merge: `canvas-object:${interaction.nodeId}`,
          statusMessage: `已调整节点 ${interaction.nodeId}`,
        },
      )
    }

    const handlePointerUp = () => {
      objectInteractionRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [canvasDimensions.height, canvasDimensions.width, previewLayout.previewScale])

  function commitDocumentChange(
    mutate: (document: Document) => void,
    options: {
      nextActiveSlideId?: string | null
      nextSelectedNodeId?: string | null
      nextSelectedTextTarget?: TextTarget | null
      merge?: string | null
      statusMessage: string
    },
  ) {
    const baseHistory = historyRef.current
    const baseIndex = historyIndexRef.current
    const baseHtml = baseHistory[baseIndex] ?? currentHtml
    const document = createDeckDocument(baseHtml)
    mutate(document)
    const nextHtml = serializeDeck(document)
    const shouldReplace = Boolean(
      options.merge && options.merge === mergeKeyRef.current && baseIndex === baseHistory.length - 1,
    )
    const nextHistory = shouldReplace
      ? baseHistory.map((entry, index) => (index === baseIndex ? nextHtml : entry))
      : [...baseHistory.slice(0, baseIndex + 1), nextHtml]
    const nextIndex = shouldReplace ? baseIndex : nextHistory.length - 1
    setHistory(nextHistory)
    historyRef.current = nextHistory
    setHistoryIndex(nextIndex)
    historyIndexRef.current = nextIndex
    setMergeKey(options.merge ?? null)
    mergeKeyRef.current = options.merge ?? null
    setStatus(options.statusMessage)

    if (options.nextActiveSlideId !== undefined) {
      setActiveSlideId(options.nextActiveSlideId)
    }
    if (options.nextSelectedNodeId !== undefined) {
      setSelectedNodeId(options.nextSelectedNodeId)
    }
    if (options.nextSelectedTextTarget !== undefined) {
      setSelectedTextTarget(options.nextSelectedTextTarget)
    }
  }

  function handleTextChange(value: string) {
    if (!selectedNode || selectedNode.kind !== 'text') {
      return
    }

    commitDocumentChange(
      (document) => {
        patchText(document, selectedNode.id, {
          html: value,
        })
      },
      {
        nextSelectedNodeId: selectedNode.id,
        nextSelectedTextTarget: { nodeId: selectedNode.id },
        merge: `text:${selectedNode.id}`,
        statusMessage: `已更新文本节点 ${selectedNode.id}`,
      },
    )
  }

  function handleComponentSlotChange(slotKey: string, value: string) {
    if (!selectedNode || selectedNode.kind !== 'component') {
      return
    }

    commitDocumentChange(
      (document) => {
        patchComponentSlot(document, selectedNode.id, slotKey, value)
      },
      {
        nextSelectedNodeId: selectedNode.id,
        nextSelectedTextTarget: selectedTextTarget ?? undefined,
        merge: `component:${selectedNode.id}`,
        statusMessage: `已更新插槽 ${slotKey}`,
      },
    )
  }

  function handleMotionChange(field: 'enabled' | 'duration' | 'delay', value: boolean | number) {
    if (!selectedNode || !selectedNode.capabilities.canEditMotion) {
      return
    }

    commitDocumentChange(
      (document) => {
        patchMotion(document, selectedNode.id, {
          enabled: field === 'enabled' ? Boolean(value) : selectedNode.motion.enabled,
          duration: field === 'duration' ? Number(value) : selectedNode.motion.duration ?? 0,
          delay: field === 'delay' ? Number(value) : selectedNode.motion.delay ?? 0,
        })
      },
      {
        nextSelectedNodeId: selectedNode.id,
        nextSelectedTextTarget: selectedTextTarget ?? undefined,
        merge: `motion:${selectedNode.id}`,
        statusMessage: `已更新 ${selectedNode.id} 的动效设置`,
      },
    )
  }

  function handleImageChange(field: 'alt' | 'dataUrl', value: string) {
    if (!selectedNode || selectedNode.kind !== 'image') {
      return
    }

    commitDocumentChange(
      (document) => {
        replaceImage(document, selectedNode.id, {
          dataUrl: field === 'dataUrl' ? value : selectedNode.image.src,
          alt: field === 'alt' ? value : selectedNode.image.alt,
        })
      },
      {
        nextSelectedNodeId: selectedNode.id,
        nextSelectedTextTarget: null,
        merge: `image:${selectedNode.id}`,
        statusMessage: `已更新图片节点 ${selectedNode.id}`,
      },
    )
  }

  function handleTextStyleChange(nextStyle: Partial<TextStyle>) {
    if (!selectedTextTarget) {
      return
    }

    commitDocumentChange(
      (document) => {
        if (selectedTextTarget.slotKey) {
          patchComponentSlotStyle(document, selectedTextTarget.nodeId, selectedTextTarget.slotKey, nextStyle)
          return
        }

        patchTextStyle(document, selectedTextTarget.nodeId, nextStyle)
      },
      {
        nextSelectedNodeId: selectedTextTarget.nodeId,
        nextSelectedTextTarget: selectedTextTarget,
        merge: `style:${selectedTextTarget.nodeId}:${selectedTextTarget.slotKey ?? 'node'}`,
        statusMessage: `已更新文本样式 ${selectedTextTarget.slotKey ? `${selectedTextTarget.nodeId}/${selectedTextTarget.slotKey}` : selectedTextTarget.nodeId}`,
      },
    )
  }

  function toggleTextStyle(field: keyof Pick<TextStyle, 'fontWeight' | 'fontStyle' | 'textDecoration'>, activeValue: string) {
    const nextValue = textStyleDraftRef.current[field] === activeValue ? '' : activeValue
    const nextStyle = { ...textStyleDraftRef.current, [field]: nextValue }
    textStyleDraftRef.current = nextStyle
    setTextStyleDraft(nextStyle)
    handleTextStyleChange(nextStyle)
  }

  function setTextAlign(value: TextStyle['textAlign']) {
    const nextStyle = { ...textStyleDraftRef.current, textAlign: value }
    textStyleDraftRef.current = nextStyle
    setTextStyleDraft(nextStyle)
    handleTextStyleChange(nextStyle)
  }

  function updateStyleField(field: keyof TextStyle, value: string) {
    const nextStyle = { ...textStyleDraftRef.current, [field]: value }
    textStyleDraftRef.current = nextStyle
    setTextStyleDraft(nextStyle)
    handleTextStyleChange(nextStyle)
  }

  function beginInsertImage() {
    if (!activeSlide?.id) {
      return
    }

    const action: PendingImageAction = {
      mode: 'insert',
      slideId: activeSlide.id,
    }
    pendingImageActionRef.current = action
    setPendingImageAction(action)
    imageInputRef.current?.click()
  }

  function beginReplaceImage() {
    if (!selectedNode || selectedNode.kind !== 'image') {
      return
    }

    const action: PendingImageAction = {
      mode: 'replace',
      nodeId: selectedNode.id,
    }
    pendingImageActionRef.current = action
    setPendingImageAction(action)
    imageInputRef.current?.click()
  }

  function handleDeleteSelectedNode(nodeId: string) {
    const node = currentDeck.nodes[nodeId]
    if (!node || !node.capabilities.canDelete) {
      return
    }

    commitDocumentChange(
      (document) => {
        removeNode(document, nodeId)
      },
      {
        nextSelectedNodeId: null,
        nextSelectedTextTarget: null,
        merge: null,
        statusMessage: `已删除节点 ${nodeId}`,
      },
    )
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const text = await file.text()

    try {
      const nextHtml = normalizeDeckHtml(text)
      const nextDeck = parseControlledDeck(createDeckDocument(nextHtml))
      setPendingMessageImageAssets([])
      setSelectedAiElement(null)
      setIsElementPicking(false)
      pendingImageActionRef.current = null
      setPendingImageAction(null)
      await clearConversation({ preserveUploadedAssets: false })
      setHistory([nextHtml])
      historyRef.current = [nextHtml]
      setHistoryIndex(0)
      historyIndexRef.current = 0
      setActiveSlideId(nextDeck.slideOrder[0] ?? null)
      setSelectedNodeId(null)
      setSelectedTextTarget(null)
      setMergeKey(null)
      mergeKeyRef.current = null
      setStatus(`已导入 ${file.name}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导入失败')
    } finally {
      event.target.value = ''
    }
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const action = pendingImageActionRef.current ?? pendingImageAction

    if (!file || !action) {
      event.target.value = ''
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const alt = createAltFromFilename(file.name)

      if (action.mode === 'insert') {
        const nextNodeId = createNextImageId(currentDeck)
        const dimensions = await loadImageDimensions(dataUrl)
        const nextLayout = createCenteredImageLayout(canvasDimensions.width, canvasDimensions.height, dimensions)

        commitDocumentChange(
          (document) => {
            createImageNode(document, action.slideId, {
              nodeId: nextNodeId,
              dataUrl,
              alt,
              layout: nextLayout,
            })
          },
          {
            nextActiveSlideId: action.slideId,
            nextSelectedNodeId: nextNodeId,
            nextSelectedTextTarget: null,
            merge: null,
            statusMessage: `已插入图片节点 ${nextNodeId}`,
          },
        )
        setLeftPanelMode('inspector')
      } else {
        commitDocumentChange(
          (document) => {
            replaceImage(document, action.nodeId, {
              dataUrl,
              alt,
            })
          },
          {
            nextSelectedNodeId: action.nodeId,
            nextSelectedTextTarget: null,
            merge: `image:${action.nodeId}`,
            statusMessage: `已替换图片节点 ${action.nodeId}`,
          },
        )
        setLeftPanelMode('inspector')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '读取图片失败')
    } finally {
      pendingImageActionRef.current = null
      setPendingImageAction(null)
      event.target.value = ''
    }
  }

  function handleDuplicateSlide() {
    if (!activeSlide) {
      return
    }

    commitDocumentChange(
      (document) => {
        duplicateSlide(document, activeSlide.id)
      },
      {
        nextActiveSlideId: `${activeSlide.id}-copy`,
        nextSelectedNodeId: null,
        nextSelectedTextTarget: null,
        merge: null,
        statusMessage: `已复制 ${activeSlide.id}`,
      },
    )
  }

  function handleDeleteSlide() {
    if (!activeSlide || currentDeck.slideOrder.length === 1) {
      return
    }

    const currentIndex = currentDeck.slideOrder.indexOf(activeSlide.id)
    const fallbackSlideId =
      currentDeck.slideOrder[currentIndex - 1] ?? currentDeck.slideOrder[currentIndex + 1] ?? null

    commitDocumentChange(
      (document) => {
        removeSlide(document, activeSlide.id)
      },
      {
        nextActiveSlideId: fallbackSlideId,
        nextSelectedNodeId: null,
        nextSelectedTextTarget: null,
        merge: null,
        statusMessage: `已删除 ${activeSlide.id}`,
      },
    )
  }

  function handleMoveSlide(direction: -1 | 1) {
    if (!activeSlide) {
      return
    }

    const currentIndex = currentDeck.slideOrder.indexOf(activeSlide.id)
    const targetIndex = currentIndex + direction
    const targetId = currentDeck.slideOrder[targetIndex]
    if (!targetId) {
      return
    }

    commitDocumentChange(
      (document) => {
        if (direction === -1) {
          // Move up: insert before target
          reorderSlides(document, activeSlide.id, targetId)
        } else {
          // Move down: insert after target
          // Find the slide after target and insert before it
          // If target is the last slide, append to the end
          const targetSlide = document.querySelector(`[data-slide-id="${targetId}"]`)
          const currentSlide = document.querySelector(`[data-slide-id="${activeSlide.id}"]`)
          if (targetSlide && currentSlide) {
            const nextSibling = targetSlide.nextElementSibling
            if (nextSibling) {
              targetSlide.parentNode?.insertBefore(currentSlide, nextSibling)
            } else {
              targetSlide.parentNode?.appendChild(currentSlide)
            }
          }
        }
      },
      {
        nextActiveSlideId: activeSlide.id,
        nextSelectedNodeId: selectedNodeId,
        nextSelectedTextTarget: selectedTextTarget ?? undefined,
        merge: null,
        statusMessage: `已移动 ${activeSlide.id}`,
      },
    )
  }

  function updateObjectGeometryDraft(field: keyof ObjectGeometryDraft, value: string) {
    setObjectGeometryDraft((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function commitObjectGeometryDraft(field: keyof ObjectGeometryDraft, rawValue = objectGeometryDraft[field]) {
    if (!selectedNode || !selectedNode.capabilities.canFloat) {
      return
    }

    const parsed = Number(rawValue)
    if (!Number.isFinite(parsed)) {
      return
    }

    if (selectedNode.layout.mode !== 'floating') {
      return
    }

    const normalizedValue =
      field === 'width' || field === 'height'
        ? Math.max(Math.round(parsed), 1)
        : Math.round(parsed)
    const nextLayout: Extract<ObjectLayout, { mode: 'floating' }> = {
      ...selectedNode.layout,
      [field]: normalizedValue,
    }

    commitDocumentChange(
      (document) => {
        patchObjectLayout(document, selectedNode.id, nextLayout)
      },
      {
        nextSelectedNodeId: selectedNode.id,
        nextSelectedTextTarget: selectedTextTarget ?? undefined,
        merge: `geometry:${selectedNode.id}:${field}`,
        statusMessage: `已更新节点 ${selectedNode.id} 的${field}`,
      },
    )
  }

  function handleObjectLayerChange(action: 'forward' | 'backward' | 'front' | 'back') {
    if (!selectedNode || selectedNode.layout.mode !== 'floating') {
      return
    }

    commitDocumentChange(
      (document) => {
        patchObjectLayer(document, selectedNode.id, action)
      },
      {
        nextSelectedNodeId: selectedNode.id,
        nextSelectedTextTarget: selectedTextTarget ?? undefined,
        merge: null,
        statusMessage: `已调整节点 ${selectedNode.id} 的图层`,
      },
    )
  }

  function handleNodeStateChange(update: { locked?: boolean; hidden?: boolean }) {
    if (!selectedNode) {
      return
    }

    commitDocumentChange(
      (document) => {
        patchNodeState(document, selectedNode.id, update)
      },
      {
        nextSelectedNodeId: selectedNode.id,
        nextSelectedTextTarget: selectedTextTarget ?? undefined,
        merge: null,
        statusMessage: `已更新节点状态 ${selectedNode.id}`,
      },
    )
  }

  function beginObjectCanvasInteraction(
    event: ReactPointerEvent<HTMLElement>,
    mode: ObjectInteraction['mode'],
    handle?: ObjectInteractionHandle,
  ) {
    if (!selectedNode || selectedNode.layout.mode !== 'floating' || !selectedNode.capabilities.canFloat) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    objectInteractionRef.current = {
      mode,
      handle,
      nodeId: selectedNode.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLayout: selectedNode.layout,
    }
  }

  function applyDeckHtml(nextHtml: string, statusMessage: string) {
    const normalizedHtml = normalizeDeckHtml(nextHtml)
    const nextDeck = parseControlledDeck(createDeckDocument(normalizedHtml))
    const nextHistory = [...history.slice(0, historyIndex + 1), normalizedHtml]

    setHistory(nextHistory)
    historyRef.current = nextHistory
    setHistoryIndex(nextHistory.length - 1)
    historyIndexRef.current = nextHistory.length - 1
    setActiveSlideId(nextDeck.slideOrder[0] ?? null)
    setSelectedNodeId(null)
    setSelectedTextTarget(null)
    setMergeKey(null)
    mergeKeyRef.current = null
    setStatus(statusMessage)
  }

  async function handleExportHtml() {
    if (isExportingHtml) {
      return
    }

    setIsExportingHtml(true)
    setStatus(createExportReadinessMessage(currentDocument))

    try {
      const { exportDeckToHtml } = await loadExportDeckToHtml()
      await exportDeckToHtml(historyRef.current[historyIndexRef.current] ?? currentHtml, {
        onProgress: (message) => {
          setStatus(message)
        },
      })
      setStatus('已导出独立 HTML 文件')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导出 HTML 失败')
    } finally {
      setIsExportingHtml(false)
    }
  }

  async function handleExportPdf() {
    if (isExportingPdf) {
      return
    }

    setIsExportingPdf(true)
    setStatus(createExportReadinessMessage(currentDocument))

    try {
      const { exportDeckToPdf } = await loadExportDeckToPdf()
      await exportDeckToPdf(historyRef.current[historyIndexRef.current] ?? currentHtml, {
        onProgress: (message) => {
          setStatus(message)
        },
      })
      setStatus('已导出 PDF 文件')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导出 PDF 失败')
    } finally {
      setIsExportingPdf(false)
    }
  }

  async function handleGenerateCandidate() {
    const latestHtml = historyRef.current[historyIndexRef.current] ?? currentHtml
    const effectiveGenerationMode = selectedAiElement ? 'from-current' : generationMode
    const sourceHtml = effectiveGenerationMode === 'from-scratch' ? blankDeckHtml : latestHtml
    setLeftPanelMode('agent')
    setAgentDrawerTab('transcript')
    setWorkspaceMode('edit')
    await submitTurn(sourceHtml, effectiveGenerationMode, {
      selectedElement: selectedAiElement ?? undefined,
      messageAssetIds: pendingMessageImageAssets
        .map((asset) => asset.assetId)
        .filter((assetId): assetId is string => Boolean(assetId)),
    })
    setSelectedAiElement(null)
    setPendingMessageImageAssets([])
  }

  function appendSmartExportLog(kind: SmartExportLogEntry['kind'], text: string): void {
    const trimmed = text.trim()
    if (!trimmed) {
      return
    }

    smartExportLogCounterRef.current += 1
    const id = `smart-export-${smartExportLogCounterRef.current}`
    setSmartExportLogs((current) => [
      ...current,
      {
        id,
        kind,
        text: trimmed,
      },
    ])
  }

  async function handleSmartExportPptx() {
    if (isExportingSmartPptx) {
      return
    }

    const latestHtml = historyRef.current[historyIndexRef.current] ?? currentHtml
    const abortController = new AbortController()
    smartExportAbortRef.current = abortController
    setIsExportingSmartPptx(true)
    setSmartExportPanelState('running')
    setSmartExportPhase('queued')
    setSmartExportLogs([])
    setSmartExportReadyEvent(undefined)
    setSmartExportError(null)
    setStatus('正在请求智能体生成可编辑 PPTX')
    appendSmartExportLog('status', '正在请求智能体生成可编辑 PPTX')

    try {
      const response = await fetch('/api/agent/pptx-export', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          documentId: 'local-document',
          currentDeckHtml: latestHtml,
          currentDeckHash: hashString(latestHtml),
          clientContext: {
            locale: typeof navigator === 'undefined' ? 'zh-CN' : navigator.language || 'zh-CN',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            surface: 'editor',
          },
        }),
        signal: abortController.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error('智能 PPTX 导出服务暂时不可用')
      }

      let readyEvent: Extract<PptxExportEvent, { type: 'pptx_export_ready' }> | null = null
      for await (const event of readPptxExportEvents(response.body)) {
        if (event.type === 'status') {
          setSmartExportPhase(event.phase)
          appendSmartExportLog('status', event.label)
          setStatus(event.label)
          continue
        }
        if (event.type === 'assistant_done') {
          appendSmartExportLog('assistant', event.text)
          setStatus(event.text)
          continue
        }
        if (event.type === 'pptx_export_ready') {
          readyEvent = event
          setSmartExportReadyEvent(event)
          setSmartExportPanelState('ready')
          setSmartExportPhase('finalizing')
          appendSmartExportLog('status', 'PPTX 已准备好')
          setStatus(event.summary)
          continue
        }
        if (event.type === 'error') {
          throw new Error(event.message)
        }
      }

      if (!readyEvent) {
        throw new Error('智能体未返回 PPTX 文件')
      }

      setSmartExportReadyEvent(readyEvent)
      setSmartExportPanelState('ready')
      setStatus('智能 PPTX 已准备好，请点击下载')
    } catch (error) {
      if (abortController.signal.aborted) {
        setStatus('已取消智能导出 PPTX')
        setSmartExportPanelState('idle')
        return
      }

      const message = error instanceof Error ? error.message : '智能导出 PPTX 失败'
      setSmartExportError(message)
      setSmartExportPanelState('error')
      appendSmartExportLog('status', message)
      setStatus(message)
    } finally {
      if (smartExportAbortRef.current === abortController) {
        smartExportAbortRef.current = null
      }
      setIsExportingSmartPptx(false)
    }
  }

  async function handleDownloadSmartExportPptx() {
    if (!smartExportReadyEvent || isDownloadingSmartExport) {
      return
    }

    setIsDownloadingSmartExport(true)
    try {
      await downloadArtifact(smartExportReadyEvent.downloadUrl, smartExportReadyEvent.artifactRef.fileName)
      setStatus('已导出智能 PPTX 文件')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PPTX 文件下载失败'
      setSmartExportError(message)
      setSmartExportPanelState('error')
      appendSmartExportLog('status', message)
      setStatus(message)
    } finally {
      setIsDownloadingSmartExport(false)
    }
  }

  function handleCloseSmartExportPanel() {
    if (smartExportPanelState === 'running') {
      if (!window.confirm('关闭会中断智能导出，PPTX 将不会生成。是否继续？')) {
        return
      }

      smartExportAbortRef.current?.abort()
    }

    setSmartExportPanelState('idle')
    setSmartExportReadyEvent(undefined)
    setSmartExportError(null)
    setSmartExportLogs([])
  }

  async function handleUploadMessageImageAsset(file: File): Promise<void> {
    if (!isImageAssetFile(file)) {
      setStatus('请上传 png、jpg、jpeg、webp、gif 或 svg 图片')
      return
    }

    const asset = await uploadHtmlPptAsset(file)
    if (!asset) {
      return
    }

    setPendingMessageImageAssets((current) => [
      ...current.filter((item) => (item.assetId ?? item.fileName) !== (asset.assetId ?? asset.fileName)),
      asset,
    ])
  }

  function handleClearDeck() {
    if (!window.confirm('这会清空当前页面内容，但保留最小 deck 结构。是否继续？')) {
      return
    }

    applyDeckHtml(blankDeckHtml, '已清空当前 HTML')
  }

  function handleApplyCandidate() {
    if (!candidate || candidate.type !== 'candidate_ready') {
      return
    }

    applyDeckHtml(candidate.compiledHtml, `已应用智能体草稿 ${candidate.candidateId}`)
    setWorkspaceMode('edit')
    markCandidateDisposition('applied')
  }

  function handleDownloadHtmlCandidate() {
    if (!candidate || candidate.type !== 'html_candidate_ready') {
      return
    }

    const blob = new Blob([candidate.html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${candidate.previewMeta.title || 'html-ppt-candidate'}.html`
    anchor.click()
    URL.revokeObjectURL(url)
    setStatus(`已导出 HTML 候选 ${candidate.candidateId}`)
  }

  function handleImportHtmlCandidate() {
    if (!candidate || candidate.type !== 'html_candidate_ready') {
      return
    }

    applyDeckHtml(candidate.html, `已将 HTML 候选导入编辑器 ${candidate.candidateId}`)
    setWorkspaceMode('edit')
    markCandidateDisposition('applied')
  }

  function handleDiscardCandidate() {
    if (!candidate) {
      return
    }

    setWorkspaceMode('edit')
    markCandidateDisposition('discarded')
    setStatus(`已丢弃智能体草稿 ${candidate.candidateId}`)
  }

  function handleEnterCompareMode() {
    if (!compareCandidate) {
      return
    }

    setWorkspaceMode('compare')
  }

  function handleExitCompareMode() {
    setWorkspaceMode('edit')
  }

  function handleOpenPresenterMode() {
    const presenterWindow = window.open('', 'html-slide-presenter', 'width=1280,height=820')
    if (!presenterWindow) {
      setStatus('浏览器阻止了演示窗口，请允许弹窗后重试')
      return
    }

    presenterWindow.document.open()
    presenterWindow.document.write(buildPresenterWindowHtml(historyRef.current[historyIndexRef.current] ?? currentHtml, activeSlide?.id ?? null))
    presenterWindow.document.close()
    setStatus('已打开演示窗口')
  }

  const inspectorContent = (
    <>
      <div className="panel-header">
        <div>
          <p className="eyebrow">编辑面板</p>
          <h2>对象列表</h2>
        </div>
        <span>{activeSlide?.nodes.length ?? 0} 个节点</span>
      </div>

      <div className="node-list">
        {activeSlide?.nodes.map((nodeId) => (
          <button
            key={nodeId}
            type="button"
            className={selectedNodeId === nodeId ? 'node-button is-active' : 'node-button'}
            onClick={() => {
              setSelectedNodeId(nodeId)
              setSelectedTextTarget(currentDeck.nodes[nodeId]?.kind === 'text' ? { nodeId } : null)
              setMergeKey(null)
              setLeftPanelMode('inspector')
            }}
          >
            {getNodeButtonLabel(currentDeck, currentDocument, nodeId)}
          </button>
        ))}
      </div>

      {selectedNode ? (
        <section className="inspector-section">
          <p className="eyebrow">当前对象</p>
          <h3>{getNodeInspectorTitle(currentDeck, currentDocument, selectedNode.id)}</h3>
          <p className="node-kind">类型：{getNodeKindLabel(selectedNode.kind)}</p>
          <div className="toolbar-actions">
            <button
              type="button"
              className={selectedNode.locked ? 'secondary-action is-active' : 'secondary-action'}
              aria-pressed={selectedNode.locked}
              onClick={() => handleNodeStateChange({ locked: !selectedNode.locked })}
            >
              {selectedNode.locked ? '解锁' : '锁定'}
            </button>
            <button
              type="button"
              className={selectedNode.hidden ? 'secondary-action is-active' : 'secondary-action'}
              aria-pressed={selectedNode.hidden}
              onClick={() => handleNodeStateChange({ hidden: !selectedNode.hidden })}
            >
              {selectedNode.hidden ? '显示' : '隐藏'}
            </button>
          </div>

          {selectedTextTarget ? (
            <section className="object-geometry-panel text-style-toolbar" aria-label="文字样式">
              <p className="eyebrow">文字样式</p>
              <label className="field">
                <span>字体</span>
                <select
                  aria-label="字体"
                  value={textStyleDraft.fontFamily}
                  onChange={(event) => updateStyleField('fontFamily', event.target.value)}
                >
                  <option value="">默认</option>
                  <option value="Arial">Arial</option>
                  <option value="宋体">宋体</option>
                  <option value="微软雅黑">微软雅黑</option>
                  <option value="Helvetica">Helvetica</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Courier New">Courier New</option>
                  <option value="Satoshi">Satoshi</option>
                </select>
              </label>
              <label className="field">
                <span>字号</span>
                <select
                  aria-label="字号"
                  value={textStyleDraft.fontSize}
                  onChange={(event) => updateStyleField('fontSize', event.target.value)}
                >
                  <option value="">默认</option>
                  <option value="12px">12px</option>
                  <option value="14px">14px</option>
                  <option value="16px">16px</option>
                  <option value="18px">18px</option>
                  <option value="24px">24px</option>
                  <option value="32px">32px</option>
                  <option value="48px">48px</option>
                  <option value="64px">64px</option>
                </select>
              </label>
              <label className="field">
                <span>字重</span>
                <select
                  aria-label="字重"
                  value={textStyleDraft.fontWeight}
                  onChange={(event) => updateStyleField('fontWeight', event.target.value)}
                >
                  <option value="">默认</option>
                  <option value="300">lighter (300)</option>
                  <option value="400">normal (400)</option>
                  <option value="700">bold (700)</option>
                  <option value="900">bolder (900)</option>
                </select>
              </label>
              <div className="toolbar-actions">
                <button type="button" aria-pressed={textStyleDraft.fontWeight === '700'} onClick={() => toggleTextStyle('fontWeight', '700')}>
                  加粗
                </button>
                <button type="button" aria-pressed={textStyleDraft.fontStyle === 'italic'} onClick={() => toggleTextStyle('fontStyle', 'italic')}>
                  斜体
                </button>
                <button
                  type="button"
                  aria-pressed={textStyleDraft.textDecoration === 'underline'}
                  onClick={() => toggleTextStyle('textDecoration', 'underline')}
                >
                  下划线
                </button>
                <button type="button" aria-pressed={textStyleDraft.textAlign === 'left'} onClick={() => setTextAlign('left')}>
                  左对齐
                </button>
                <button type="button" aria-pressed={textStyleDraft.textAlign === 'center'} onClick={() => setTextAlign('center')}>
                  居中对齐
                </button>
                <button type="button" aria-pressed={textStyleDraft.textAlign === 'right'} onClick={() => setTextAlign('right')}>
                  右对齐
                </button>
              </div>
              <label className="field">
                <span>文字颜色</span>
                <select
                  aria-label="文字颜色"
                  value={textStyleDraft.color}
                  onChange={(event) => updateStyleField('color', event.target.value)}
                >
                  <option value="">默认</option>
                  <option value="#000000">黑色 #000000</option>
                  <option value="#333333">深灰 #333333</option>
                  <option value="#666666">中灰 #666666</option>
                  <option value="#999999">浅灰 #999999</option>
                  <option value="#ffffff">白色 #ffffff</option>
                  <option value="#e53935">红色 #e53935</option>
                  <option value="#1e88e5">蓝色 #1e88e5</option>
                  <option value="#43a047">绿色 #43a047</option>
                  <option value="#fb8c00">橙色 #fb8c00</option>
                  <option value="#d95d39">#d95d39</option>
                </select>
              </label>
              <label className="field">
                <span>行高</span>
                <select
                  aria-label="行高"
                  value={textStyleDraft.lineHeight}
                  onChange={(event) => updateStyleField('lineHeight', event.target.value)}
                >
                  <option value="">默认</option>
                  <option value="1.0">1.0</option>
                  <option value="1.2">1.2</option>
                  <option value="1.4">1.4</option>
                  <option value="1.5">1.5</option>
                  <option value="1.8">1.8</option>
                  <option value="2.0">2.0</option>
                  <option value="2.5">2.5</option>
                </select>
              </label>
              <label className="field">
                <span>字距</span>
                <select
                  aria-label="字距"
                  value={textStyleDraft.letterSpacing}
                  onChange={(event) => updateStyleField('letterSpacing', event.target.value)}
                >
                  <option value="">默认</option>
                  <option value="0px">0px</option>
                  <option value="1px">1px</option>
                  <option value="2px">2px</option>
                  <option value="3px">3px</option>
                  <option value="5px">5px</option>
                  <option value="0.08em">0.08em</option>
                </select>
              </label>
            </section>
          ) : null}

          {selectedNode.capabilities.canFloat ? (
            <section className="object-geometry-panel" aria-label="对象位置和图层">
              <p className="eyebrow">位置和图层</p>
              {selectedFloatingLayout ? (
                <>
                  <div className="geometry-grid">
                    <label className="field geometry-field">
                      <span>X</span>
                      <input
                        aria-label="对象 X"
                        inputMode="numeric"
                        type="text"
                        value={objectGeometryDraft.x}
                        onBlur={(event) => commitObjectGeometryDraft('x', event.currentTarget.value)}
                        onChange={(event) => updateObjectGeometryDraft('x', event.target.value)}
                      />
                    </label>
                    <label className="field geometry-field">
                      <span>Y</span>
                      <input
                        aria-label="对象 Y"
                        inputMode="numeric"
                        type="text"
                        value={objectGeometryDraft.y}
                        onBlur={(event) => commitObjectGeometryDraft('y', event.currentTarget.value)}
                        onChange={(event) => updateObjectGeometryDraft('y', event.target.value)}
                      />
                    </label>
                    <label className="field geometry-field">
                      <span>宽</span>
                      <input
                        aria-label="对象宽度"
                        inputMode="numeric"
                        type="text"
                        value={objectGeometryDraft.width}
                        onBlur={(event) => commitObjectGeometryDraft('width', event.currentTarget.value)}
                        onChange={(event) => updateObjectGeometryDraft('width', event.target.value)}
                      />
                    </label>
                    <label className="field geometry-field">
                      <span>高</span>
                      <input
                        aria-label="对象高度"
                        inputMode="numeric"
                        type="text"
                        value={objectGeometryDraft.height}
                        onBlur={(event) => commitObjectGeometryDraft('height', event.currentTarget.value)}
                        onChange={(event) => updateObjectGeometryDraft('height', event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="layer-actions">
                    <button type="button" className="secondary-action" onClick={() => handleObjectLayerChange('back')}>
                      置于底层
                    </button>
                    <button type="button" className="secondary-action" onClick={() => handleObjectLayerChange('backward')}>
                      下移一层
                    </button>
                    <button type="button" className="secondary-action" onClick={() => handleObjectLayerChange('forward')}>
                      上移一层
                    </button>
                    <button type="button" className="secondary-action" onClick={() => handleObjectLayerChange('front')}>
                      置于顶层
                    </button>
                  </div>
                </>
              ) : (
                <p className="object-geometry-hint">选择已有浮动对象后，可在这里精确调整位置、尺寸和图层。</p>
              )}
            </section>
          ) : null}

          {selectedNode.kind === 'text' ? (
            <>
              <div className="field rich-text-field">
                <span>文本内容</span>
                <RichTextNodeEditor
                  html={selectedNode.html}
                  onCommit={(html) => {
                    if (html !== selectedNode.html) {
                      handleTextChange(html)
                    }
                  }}
                />
              </div>
            </>
          ) : null}

          {selectedNode.kind === 'component'
            ? Object.entries(selectedNode.slots).map(([slotKey, slotValue]) => (
                <label className="field" key={slotKey}>
                  <span>{`插槽 ${slotKey}`}</span>
                  <textarea
                    aria-label={`插槽 ${slotKey}`}
                    value={slotValue}
                    onChange={(event) => handleComponentSlotChange(slotKey, event.target.value)}
                  />
                </label>
              ))
            : null}

          {selectedNode.kind === 'image' ? (
            <>
              <button type="button" className="secondary-action" onClick={beginReplaceImage}>
                替换图片
              </button>
              <button
                type="button"
                className="secondary-action"
                disabled={!selectedNode.capabilities.canDelete}
                onClick={() => handleDeleteSelectedNode(selectedNode.id)}
              >
                删除元素
              </button>
              <label className="field">
                <span>图片替代文本</span>
                <input
                  aria-label="图片替代文本"
                  type="text"
                  value={selectedNode.image.alt}
                  onChange={(event) => handleImageChange('alt', event.target.value)}
                />
              </label>
            </>
          ) : null}

          {selectedNode.kind !== 'image' ? (
            <button
              type="button"
              className="secondary-action"
              disabled={!selectedNode.capabilities.canDelete}
              onClick={() => handleDeleteSelectedNode(selectedNode.id)}
            >
              删除元素
            </button>
          ) : null}

          {selectedNode.capabilities.canEditMotion ? (
            <div className="motion-card">
              <p className="eyebrow">动效</p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selectedNode.motion.enabled}
                  onChange={(event) => handleMotionChange('enabled', event.target.checked)}
                />
                <span>启用动效</span>
              </label>
              <label className="field">
                <span>时长</span>
                <input
                  aria-label="时长"
                  type="number"
                  value={selectedNode.motion.duration ?? 0}
                  onChange={(event) => handleMotionChange('duration', Number(event.target.value))}
                />
              </label>
              <label className="field">
                <span>延迟</span>
                <input
                  aria-label="延迟"
                  type="number"
                  value={selectedNode.motion.delay ?? 0}
                  onChange={(event) => handleMotionChange('delay', Number(event.target.value))}
                />
              </label>
            </div>
          ) : null}

        </section>
      ) : (
        <section className="inspector-section empty-state">
          <p className="eyebrow">对象</p>
          <h3>选择画布或列表中的对象</h3>
        </section>
      )}

    </>
  )

  const agentPanelContent = (
    <AiPanel
      candidate={candidate}
      candidatePreviews={candidatePreviews}
      composerText={composerText}
      replyText={replyText}
      pendingInput={pendingInput}
      pendingFormAnswers={pendingFormAnswers}
      uploadedAssets={uploadedAssets}
      pendingMessageImageAssets={pendingMessageImageAssets}
      selectedElement={selectedAiElement}
      isElementPickActive={isElementPicking}
      generationMode={generationMode}
      activeStatus={activeStatus}
      activeTab={agentDrawerTab}
      isCompareMode={isComparingCandidate}
      isSubmitting={isSubmitting}
      transcript={transcript}
      onComposerTextChange={setComposerText}
      onReplyTextChange={setReplyText}
      onPendingFormAnswerChange={updatePendingFormAnswer}
      onTabChange={setAgentDrawerTab}
      onUploadAsset={uploadHtmlPptAsset}
      onUploadMessageImageAsset={handleUploadMessageImageAsset}
      onRemoveMessageImageAsset={(assetKey) =>
        setPendingMessageImageAssets((current) =>
          current.filter((asset) => (asset.assetId ?? asset.fileName) !== assetKey),
        )}
      onStartElementPick={() => {
        setIsElementPicking(true)
        setStatus('点击预览中的具体元素进行拣选')
      }}
      onClearSelectedElement={() => {
        setSelectedAiElement(null)
        setIsElementPicking(false)
      }}
      onGenerationModeChange={setGenerationMode}
      onSubmit={handleGenerateCandidate}
      onAbortTurn={abortTurn}
      onClearConversation={clearConversation}
      onApplyCandidate={handleApplyCandidate}
      onDiscardCandidate={handleDiscardCandidate}
      onDownloadHtmlCandidate={handleDownloadHtmlCandidate}
      onEnterCompareMode={handleEnterCompareMode}
      onImportHtmlCandidate={handleImportHtmlCandidate}
      onOptimizePrompt={() => optimizePrompt(generationMode)}
      isOptimizing={isOptimizing}
      optimizedPrompt={optimizedPrompt}
      optimizationExplanation={optimizationExplanation}
      onOptimizedPromptChange={setOptimizedPrompt}
      onApplyOptimizedPrompt={applyOptimizedPrompt}
      onDismissOptimization={dismissOptimization}
    />
  )
  const smartExportPanel = smartExportPanelState !== 'idle' ? (
    <SmartExportDrawer
      state={smartExportPanelState}
      phase={smartExportPhase}
      logs={smartExportLogs}
      readyEvent={smartExportReadyEvent}
      error={smartExportError}
      isDownloading={isDownloadingSmartExport}
      onClose={handleCloseSmartExportPanel}
      onDownload={handleDownloadSmartExportPptx}
      onRetry={handleSmartExportPptx}
    />
  ) : null

  return (
    <div className="editor-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">智能体演示编辑</p>
          <h1>数智兵设演示文稿生成器</h1>
        </div>
        <div className="toolbar">
          {isInRouter ? (
            <Link className="toolbar-link" to={HTML_PPT_SKILL_GUIDE_PATH}>
              HTML PPT 指南
            </Link>
          ) : null}
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            导入 HTML
          </button>
          <button type="button" onClick={handleClearDeck}>
            清空当前 HTML
          </button>
          <button type="button" onClick={handleExportHtml} disabled={isExportingHtml}>
            {isExportingHtml ? '导出 HTML 中…' : '导出 HTML'}
          </button>
          <button type="button" onClick={handleExportPdf} disabled={isExportingPdf}>
            {isExportingPdf ? '导出 PDF 中…' : '导出 PDF'}
          </button>
          <button type="button" onClick={handleSmartExportPptx} disabled={isExportingSmartPptx}>
            {isExportingSmartPptx ? '智能导出中…' : '智能导出 PPTX'}
          </button>
          <button type="button" onClick={handleOpenPresenterMode}>
            演示
          </button>
        </div>
        <input
          ref={fileInputRef}
          hidden
          type="file"
          accept=".html,text/html"
          onChange={handleImportFile}
        />
        <input
          ref={imageInputRef}
          hidden
          data-testid="image-upload-input"
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
        />
      </header>

      <main className={workspaceClassName}>
        <aside className="panel pages-panel is-left-panel-wide">
          <div className="left-panel-tabs" role="tablist" aria-label="左侧面板">
            <button
              type="button"
              role="tab"
              aria-selected={leftPanelMode === 'pages'}
              className={leftPanelMode === 'pages' ? 'left-panel-tab is-active' : 'left-panel-tab'}
              onClick={() => setLeftPanelMode('pages')}
            >
              页面
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftPanelMode === 'inspector'}
              className={leftPanelMode === 'inspector' ? 'left-panel-tab is-active' : 'left-panel-tab'}
              onClick={() => setLeftPanelMode('inspector')}
            >
              编辑
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftPanelMode === 'agent'}
              className={leftPanelMode === 'agent' ? 'left-panel-tab is-active' : 'left-panel-tab'}
              onClick={() => setLeftPanelMode('agent')}
            >
              智能体
            </button>
          </div>

          <div className="left-panel-scroll is-left-panel-scroll">
            {leftPanelMode === 'pages' ? (
              <>
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">页面</p>
                    <h2>演示分页</h2>
                  </div>
                  <span>{currentDeck.slideOrder.length} 页</span>
                </div>

                <div className="page-actions">
                  <button type="button" onClick={() => handleMoveSlide(-1)} disabled={!activeSlide || currentDeck.slideOrder[0] === activeSlide.id}>
                    上移
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveSlide(1)}
                    disabled={!activeSlide || currentDeck.slideOrder[currentDeck.slideOrder.length - 1] === activeSlide.id}
                  >
                    下移
                  </button>
                  <button type="button" onClick={handleDuplicateSlide} disabled={!activeSlide}>
                    复制页面
                  </button>
                  <button type="button" onClick={handleDeleteSlide} disabled={!activeSlide || currentDeck.slideOrder.length === 1}>
                    删除页面
                  </button>
                  <button type="button" onClick={beginInsertImage} disabled={!activeSlide}>
                    插入图片块
                  </button>
                </div>

                <div className="page-list">
                  {currentDeck.slideOrder.map((slideId, index) => {
                    const slideButtonTitle = getSlideButtonTitle(currentDeck, slideId, index)
                    const srcDoc = slideThumbSrcDocs[slideId] ?? ''

                    return (
                      <button
                        key={slideId}
                        type="button"
                        className={slideId === activeSlide?.id ? 'page-thumb is-active' : 'page-thumb'}
                        title={slideButtonTitle}
                        onClick={() => {
                          setActiveSlideId(slideId)
                          setSelectedNodeId(null)
                          setSelectedTextTarget(null)
                          setMergeKey(null)
                        }}
                      >
                        <div className="page-thumb-shell">
                          <iframe
                            className="page-thumb-preview"
                            sandbox=""
                            srcDoc={srcDoc}
                          />
                        </div>
                        <span className="page-thumb-label">{index + 1}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : leftPanelMode === 'inspector' ? (
              inspectorContent
            ) : (
              agentPanelContent
            )}
          </div>
        </aside>

        <section className={isComparingCandidate ? 'stage is-comparing' : 'stage'}>
          <div className="panel-header stage-header">
            <div>
              <p className="eyebrow">画布</p>
              <h2>{activeSlide?.title ?? activeSlide?.id ?? '未选择页面'}</h2>
            </div>
            <div className="stage-header-actions">
              <span>{status}</span>
              {!isComparingCandidate ? (
                <>
                  <span className="canvas-meta">{previewMetricsLabel}</span>
                  {runtimeOverflowLabel ? <span className="canvas-meta canvas-diagnostic">{runtimeOverflowLabel}</span> : null}
                  <div className="fit-mode-toggle" role="group" aria-label="画布缩放模式">
                    <button
                      type="button"
                      className={fitMode === 'adaptive' ? 'secondary-action is-active' : 'secondary-action'}
                      aria-pressed={fitMode === 'adaptive'}
                      onClick={() => setFitMode('adaptive')}
                    >
                      自适应
                    </button>
                    <button
                      type="button"
                      className={fitMode === 'native' ? 'secondary-action is-active' : 'secondary-action'}
                      aria-pressed={fitMode === 'native'}
                      onClick={() => setFitMode('native')}
                    >
                      原尺寸
                    </button>
                  </div>
                </>
              ) : null}
              {isComparingCandidate ? (
                <button type="button" className="secondary-action" onClick={handleExitCompareMode}>
                  退出对比模式
                </button>
              ) : null}
            </div>
          </div>
          <div className={isComparingCandidate ? 'stage-body is-comparing' : 'stage-body'}>
            {shouldShowAgentProgress ? (
              <section
                className="agent-progress-overlay"
                data-phase={agentProgressPhase}
                data-testid="agent-progress-overlay"
                aria-live="polite"
              >
                <div className="agent-progress-header">
                  <span className="agent-progress-kicker">智能体</span>
                  <strong>{activeStatus ?? '智能体正在处理'}</strong>
                </div>
                <div className="agent-progress-track" aria-hidden="true">
                  <span style={{ width: `${resolveAgentPhaseProgress(agentProgressPhase)}%` }} />
                </div>
                <p>{agentProgressText}</p>
              </section>
            ) : null}
            <div
              ref={previewCanvasRef}
              className="slide-preview"
            >
              <div className="slide-preview-canvas" data-testid="slide-preview">
                <div className="slide-preview-frame" data-fit-mode={fitMode}>
                  <div className="slide-preview-viewport" style={previewLayout.viewportStyle}>
                    <div className="slide-preview-stage-shell" style={previewLayout.stageShellStyle}>
                      <iframe
                        key={`${activeSlide?.id ?? 'no-slide'}:${runtimePreviewHtml.length}`}
                        ref={previewIframeRef}
                        className="slide-preview-iframe"
                        data-testid="slide-preview-iframe"
                        title="当前演示预览"
                        srcDoc={runtimePreviewHtml}
                        sandbox="allow-scripts allow-same-origin"
                        style={previewLayout.iframeStyle}
                      />
                      {selectedFloatingObjectLayout && !isComparingCandidate ? (
                        <div
                          className="selected-image-canvas-layer"
                          style={{
                            width: `${canvasDimensions.width}px`,
                            height: `${canvasDimensions.height}px`,
                            transform: `scale(${previewLayout.previewScale})`,
                          }}
                        >
                          <div
                            className="selected-image-controls"
                            data-testid="selected-image-controls"
                            style={{
                              left: `${selectedFloatingObjectLayout.x}px`,
                              top: `${selectedFloatingObjectLayout.y}px`,
                              width: `${selectedFloatingObjectLayout.width}px`,
                              height: `${selectedFloatingObjectLayout.height}px`,
                            }}
                          >
                            <button
                              type="button"
                              className="selected-image-drag-surface"
                              data-testid="selected-image-drag-surface"
                              aria-label="拖动所选对象"
                              onPointerDown={(event) => beginObjectCanvasInteraction(event, 'drag')}
                            />
                            {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
                              <button
                                key={handle}
                                type="button"
                                className={`selected-image-resize-handle selected-image-resize-handle-${handle}`}
                                data-testid={`selected-image-resize-${handle}`}
                                aria-label={`缩放所选对象 ${handle}`}
                                onPointerDown={(event) => beginObjectCanvasInteraction(event, 'resize', handle)}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {isComparingCandidate && compareCandidate ? (
              <section className="candidate-compare-panel">
                <div className="panel-header compare-header">
                  <div>
                    <p className="eyebrow">候选</p>
                    <h2>{compareCandidate.previewMeta.title}</h2>
                  </div>
                  <span>{`${compareCandidate.previewMeta.slideCount} 页 HTML 演示`}</span>
                </div>
                <div className="html-candidate-preview-shell compare-preview-shell">
                  <iframe
                    className="html-candidate-preview"
                    data-testid="candidate-compare-preview"
                    title="HTML candidate compare preview"
                    srcDoc={compareCandidate.html}
                  />
                </div>
              </section>
            ) : null}
          </div>
        </section>

      </main>
      {smartExportPanel}
    </div>
  )
}

function loadInitialDeck(initialDeckHtml?: string): string {
  if (initialDeckHtml) {
    return normalizeDeckHtml(initialDeckHtml)
  }

  return normalizeDeckHtml(blankDeckHtml)
}

function normalizeDeckHtml(html: string): string {
  const document = createDeckDocument(html)
  try {
    parseControlledDeck(document)
    applyCanvasDimensions(document, resolveCanvasDimensions(document))
    return serializeDeck(document)
  } catch {
    const adapted = adaptImportedHtmlToDeck(html)
    const adaptedDocument = createDeckDocument(adapted)
    applyCanvasDimensions(adaptedDocument, resolveCanvasDimensions(adaptedDocument))
    return serializeDeck(adaptedDocument)
  }
}

function createExportReadinessMessage(document: Document): string {
  const imageCount = document.querySelectorAll('img[src]').length
  const waitForCount = document.querySelectorAll('[data-waitfor]').length
  const animationCount = document.querySelectorAll('[data-anim], .anim-stagger-list, .stagger, .path-draw, .bar-fill').length
  return `正在导出：等待字体、${imageCount} 个图片资源、${waitForCount} 个 data-waitfor 节点，并冻结 ${animationCount} 个动画节点…`
}

function buildRuntimePreviewLayout(previewLayout: {
  frameWidth: number
  frameHeight: number
  viewportWidth: number
  viewportHeight: number
  fitMode: FitMode
}): {
  viewportStyle: CSSProperties
  stageShellStyle: CSSProperties
  iframeStyle: CSSProperties
  previewScale: number
} {
  const adaptiveScale = calculatePreviewScale({
    frameWidth: previewLayout.frameWidth,
    frameHeight: previewLayout.frameHeight,
    viewportWidth: previewLayout.viewportWidth,
    viewportHeight: previewLayout.viewportHeight,
  })
  const previewScale = previewLayout.fitMode === 'adaptive' ? adaptiveScale : 1
  const iframeWidth = previewLayout.viewportWidth
  const iframeHeight = previewLayout.viewportHeight
  const scaledWidth = iframeWidth * previewScale
  const scaledHeight = iframeHeight * previewScale
  const viewportOverflow = previewLayout.fitMode === 'adaptive' ? 'hidden' : 'auto'
  const viewportAlignment = previewLayout.fitMode === 'adaptive' ? 'center' : 'flex-start'
  const iframeStyle: CSSProperties = {
    width: `${iframeWidth}px`,
    height: `${iframeHeight}px`,
  }

  if (previewLayout.fitMode === 'adaptive') {
    iframeStyle.transform = `scale(${previewScale})`
  }

  return {
    viewportStyle: {
      overflow: viewportOverflow,
      alignItems: viewportAlignment,
      justifyContent: viewportAlignment,
    },
    stageShellStyle: {
      width: `${scaledWidth}px`,
      height: `${scaledHeight}px`,
      flexShrink: 0,
    },
    iframeStyle,
    previewScale,
  }
}

function buildRuntimePreviewHtml(html: string, slideId: string | null): string {
  const document = createDeckDocument(html)
  const resolvedSlideId =
    slideId ??
    document.querySelector<HTMLElement>('section.slide[data-slide-id]')?.dataset.slideId ??
    document.querySelector<HTMLElement>('section.slide[id]')?.id ??
    null

  if (resolvedSlideId) {
    syncRuntimePreviewState(document, resolvedSlideId)
  }

  injectRuntimePreviewStyles(document)
  injectRuntimePreviewBridge(document, resolvedSlideId)
  return serializeDeck(document)
}

function buildPresenterWindowHtml(html: string, slideId: string | null): string {
  const document = createDeckDocument(html)
  const slides = Array.from(document.querySelectorAll<HTMLElement>('section.slide'))
  const startIndex = Math.max(
    slides.findIndex((slide) => (slide.dataset.slideId || slide.id) === slideId),
    0,
  )
  const notes = slides.map((slide) => readSpeakerNotes(slide))

  injectRuntimePreviewStyles(document)
  const script = document.createElement('script')
  script.setAttribute('data-html-slide-editor-presenter', 'true')
  script.textContent = `(() => {
  const notes = ${JSON.stringify(notes)};
  let index = ${startIndex};
  let mode = 'slides';
  const startedAt = Date.now();

  function slides() { return Array.from(document.querySelectorAll('section.slide')); }
  function setMode(nextMode) {
    mode = nextMode;
    document.documentElement.dataset.presenterMode = mode;
    renderOverview();
  }
  function show(nextIndex) {
    const list = slides();
    if (!list.length) return;
    index = Math.min(Math.max(nextIndex, 0), list.length - 1);
    list.forEach((slide, slideIndex) => {
      const active = slideIndex === index;
      slide.classList.toggle('is-active', active);
      slide.classList.toggle('visible', active);
    });
    document.querySelector('[data-presenter-current]').textContent = String(index + 1);
    document.querySelector('[data-presenter-total]').textContent = String(list.length);
    document.querySelector('[data-presenter-notes]').textContent = notes[index] || '无备注';
    document.querySelector('[data-presenter-next]').textContent = list[index + 1]?.dataset?.title || list[index + 1]?.querySelector('h1,h2,h3')?.textContent?.trim() || '结束';
  }
  function renderOverview() {
    const overview = document.querySelector('[data-presenter-overview]');
    if (!overview) return;
    overview.innerHTML = slides().map((slide, slideIndex) => '<button type="button" data-jump="' + slideIndex + '">' + (slide.dataset.title || slide.querySelector('h1,h2,h3')?.textContent?.trim() || ('第 ' + (slideIndex + 1) + ' 页')) + '</button>').join('');
    overview.querySelectorAll('[data-jump]').forEach((button) => button.addEventListener('click', () => {
      setMode('slides');
      show(Number(button.dataset.jump));
    }));
  }
  function tick() {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const seconds = String(elapsed % 60).padStart(2, '0');
    document.querySelector('[data-presenter-timer]').textContent = minutes + ':' + seconds;
    document.querySelector('[data-presenter-clock]').textContent = new Date().toLocaleTimeString();
  }
  window.addEventListener('keydown', (event) => {
    if (['ArrowRight', ' ', 'PageDown'].includes(event.key)) show(index + 1);
    if (['ArrowLeft', 'PageUp'].includes(event.key)) show(index - 1);
    if (event.key === 'Home') show(0);
    if (event.key === 'End') show(slides().length - 1);
    if (event.key.toLowerCase() === 'b') setMode(mode === 'blackout' ? 'slides' : 'blackout');
    if (event.key.toLowerCase() === 'w') setMode(mode === 'whiteout' ? 'slides' : 'whiteout');
    if (event.key.toLowerCase() === 'o') setMode(mode === 'overview' ? 'slides' : 'overview');
  });
  document.body.insertAdjacentHTML('beforeend', '<aside class="presenter-panel"><strong><span data-presenter-current></span>/<span data-presenter-total></span></strong><span data-presenter-timer></span><span data-presenter-clock></span><p>下一页：<span data-presenter-next></span></p><p data-presenter-notes></p><p>B 黑屏 · W 白屏 · O 概览 · 方向键翻页</p></aside><div class="presenter-overview" data-presenter-overview></div>');
  const style = document.createElement('style');
  style.textContent = '.presenter-panel{position:fixed;right:16px;top:16px;z-index:9999;width:280px;padding:14px;border:1px solid rgba(0,0,0,.16);border-radius:12px;background:rgba(255,250,241,.94);color:#201715;font:14px/1.45 sans-serif;box-shadow:0 18px 40px rgba(0,0,0,.16)}.presenter-panel strong{font-size:20px}.presenter-panel p{margin:.5em 0}.presenter-overview{display:none;position:fixed;inset:0;z-index:9998;padding:48px;background:#201715;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}.presenter-overview button{min-height:120px;border:1px solid rgba(255,255,255,.2);border-radius:12px;background:#fffaf1;color:#201715;font:inherit}html[data-presenter-mode="blackout"] body::after,html[data-presenter-mode="whiteout"] body::after{content:"";position:fixed;inset:0;z-index:9997;background:#000}html[data-presenter-mode="whiteout"] body::after{background:#fff}html[data-presenter-mode="overview"] .presenter-overview{display:grid}';
  document.head.appendChild(style);
  setMode('slides');
  show(index);
  tick();
  window.setInterval(tick, 1000);
})();`
  document.body.appendChild(script)
  return serializeDeck(document)
}

function readSpeakerNotes(slide: HTMLElement): string {
  const explicitNotes = slide.getAttribute('data-speaker-notes')?.trim()
  if (explicitNotes) {
    return explicitNotes
  }

  return Array.from(slide.querySelectorAll<HTMLElement>('.notes, [data-notes], [data-speaker-notes]'))
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
}

function buildCandidatePreviews(
  candidate: ReturnType<typeof useAgentSession>['candidate'],
): CandidatePreview[] {
  if (!candidate) {
    return []
  }

  const html = candidate.type === 'candidate_ready' ? candidate.compiledHtml : candidate.html
  const document = createDeckDocument(html)
  const slides = ensureCandidatePreviewSlideIds(Array.from(document.querySelectorAll<HTMLElement>('section.slide')))
  const previewHtml = serializeDeck(document)

  if (!slides.length) {
    return [
      {
        id: `${candidate.candidateId}:preview`,
        title: candidate.type === 'html_candidate_ready' ? candidate.previewMeta.title : candidate.summary,
        detail: '候选预览',
        srcDoc: buildRuntimePreviewHtml(previewHtml, null),
      },
    ]
  }

  return slides.slice(0, CANDIDATE_PREVIEW_LIMIT).map((slide, index) => {
    const slideId = slide.dataset.slideId || slide.id || null
    const fallbackTitle =
      candidate.type === 'candidate_ready'
        ? candidate.slideMeta[index]?.title
        : undefined
    const title =
      fallbackTitle ||
      slide.dataset.title ||
      slide.querySelector('h1, h2, h3')?.textContent?.trim() ||
      `第 ${index + 1} 页`

    return {
      id: `${candidate.candidateId}:${slideId ?? index}`,
      title,
      detail: `第 ${index + 1} 页`,
      srcDoc: buildRuntimePreviewHtml(previewHtml, slideId),
    }
  })
}

function ensureCandidatePreviewSlideIds(slides: HTMLElement[]): HTMLElement[] {
  slides.forEach((slide, index) => {
    const slideId = slide.dataset.slideId || slide.id || `candidate-preview-slide-${index + 1}`
    slide.dataset.slideId = slideId
    slide.id = slideId
  })

  return slides
}

function injectRuntimePreviewStyles(document: Document): void {
  document.documentElement.setAttribute('data-html-slide-editor-preview', 'true')
  const style = document.createElement('style')
  style.setAttribute('data-html-slide-editor-preview', 'true')
  style.textContent = `
html[data-html-slide-editor-preview="true"] section.slide:not(.is-active) {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

html[data-html-slide-editor-preview="true"] section.slide.is-active {
  visibility: visible !important;
}

html[data-html-slide-editor-preview="true"] [data-node-id] {
  cursor: default;
}

html[data-html-slide-editor-preview="true"] [data-node-id].is-editor-selected {
  outline: 2px solid #d95d39 !important;
  outline-offset: 4px !important;
}

html[data-html-slide-editor-preview="true"] .is-ai-pick-hover {
  outline: 2px dashed #2563eb !important;
  outline-offset: 4px !important;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16) !important;
  cursor: crosshair !important;
}
`
  document.head.appendChild(style)
}

function syncRuntimePreviewState(document: Document, slideId: string): void {
  const slides = Array.from(document.querySelectorAll<HTMLElement>('section.slide'))
  const activeSlide =
    slides.find((slide) => slide.dataset.slideId === slideId || slide.id === slideId) ??
    slides[0] ??
    null
  if (!activeSlide) {
    return
  }

  const activeSlideId = activeSlide.dataset.slideId || activeSlide.id || slideId
  slides.forEach((slide) => {
    const isActive = slide === activeSlide
    slide.classList.toggle('is-active', isActive)
    slide.classList.toggle('visible', isActive)
    if (isActive && !slide.dataset.slideId && activeSlideId) {
      slide.dataset.slideId = activeSlideId
    }
  })

  const activeIndex = Math.max(slides.indexOf(activeSlide), 0)
  const progress = slides.length > 0 ? ((activeIndex + 1) / slides.length) * 100 : 0
  document.querySelectorAll<HTMLElement>('.progress-bar span, .progress span').forEach((bar) => {
    bar.style.width = `${progress}%`
    bar.style.transform = `scaleX(${progress / 100})`
  })

  document.querySelectorAll<HTMLElement>('.nav-dot').forEach((dot, index) => {
    const dotSlideId = dot.dataset.slideId || dot.getAttribute('href')?.replace(/^#/, '')
    const isActive = dotSlideId ? dotSlideId === activeSlideId : index === activeIndex
    dot.classList.toggle('active', isActive)
    dot.classList.toggle('is-active', isActive)
    if (isActive) {
      dot.setAttribute('aria-current', 'true')
    } else {
      dot.removeAttribute('aria-current')
    }
  })
}

function injectRuntimePreviewBridge(document: Document, initialSlideId: string | null): void {
  const script = document.createElement('script')
  script.setAttribute('data-html-slide-editor-preview-bridge', 'true')
  script.textContent = `(() => {
  const parentSource = 'html-slide-editor';
  const previewSource = 'html-slide-editor-preview';
  const initialSlideId = ${JSON.stringify(initialSlideId)};
  let currentActiveSlide = null;
  let selectedNodeId = null;
  let elementPickMode = false;
  let elementPickHover = null;

  function getSlides() {
    return Array.from(document.querySelectorAll('section.slide'));
  }

  function getSlideId(slide) {
    return slide?.dataset?.slideId || slide?.id || '';
  }

  function findSlide(slideId) {
    const slides = getSlides();
    return slides.find((slide) => getSlideId(slide) === slideId) || slides[0] || null;
  }

  function setActiveSlide(slideId) {
    const slides = getSlides();
    const activeSlide = findSlide(slideId);
    if (!activeSlide) return;

    currentActiveSlide = activeSlide;
    const activeSlideId = getSlideId(activeSlide);
    const activeIndex = Math.max(slides.indexOf(activeSlide), 0);
    slides.forEach((slide) => {
      const active = slide === activeSlide;
      slide.classList.toggle('is-active', active);
      slide.classList.toggle('visible', active);
    });

    const progress = slides.length > 0 ? ((activeIndex + 1) / slides.length) * 100 : 0;
    document.querySelectorAll('.progress-bar span, .progress span').forEach((bar) => {
      bar.style.width = progress + '%';
      bar.style.transform = 'scaleX(' + progress / 100 + ')';
    });

    document.querySelectorAll('.nav-dot').forEach((dot, index) => {
      const dotSlideId = dot.dataset.slideId || (dot.getAttribute('href') || '').replace(/^#/, '');
      const active = dotSlideId ? dotSlideId === activeSlideId : index === activeIndex;
      dot.classList.toggle('active', active);
      dot.classList.toggle('is-active', active);
      if (active) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });

    const targetTop = activeSlide.offsetTop || 0;
    window.scrollTo({ top: targetTop, left: 0, behavior: 'auto' });
    activeSlide.scrollIntoView?.({ behavior: 'auto', block: 'start', inline: 'nearest' });
    window.parent?.postMessage({ source: previewSource, type: 'active-slide', slideId: activeSlideId }, '*');
    measureActiveSlide(activeSlide);
    requestAnimationFrame(() => measureActiveSlide(activeSlide));
    window.setTimeout(() => measureActiveSlide(activeSlide), 80);
  }

  function settleActiveSlide() {
    setActiveSlide(initialSlideId);
    requestAnimationFrame(() => setActiveSlide(initialSlideId));
    window.setTimeout(() => setActiveSlide(initialSlideId), 40);
    window.setTimeout(() => setActiveSlide(initialSlideId), 160);
  }

  function measureActiveSlide(activeSlide) {
    const rect = activeSlide.getBoundingClientRect();
    const width = Math.max(
      activeSlide.scrollWidth || 0,
      Math.ceil(rect.width),
      window.innerWidth || 0
    );
    const height = Math.max(
      activeSlide.scrollHeight || 0,
      Math.ceil(rect.height),
      window.innerHeight || 0
    );
    window.parent?.postMessage({ source: previewSource, type: 'content-size', slideId: getSlideId(activeSlide), width, height }, '*');
  }

  function setSelectedNode(nodeId) {
    selectedNodeId = nodeId || null;
    document.querySelectorAll('[data-node-id].is-editor-selected').forEach((node) => {
      node.classList.remove('is-editor-selected');
    });
    if (!selectedNodeId) return;
    const node = document.querySelector('[data-node-id="' + CSS.escape(selectedNodeId) + '"]');
    node?.classList.add('is-editor-selected');
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => '\\\\' + ch);
  }

  function attrEscape(value) {
    return String(value).replace(/"/g, '\\\\"');
  }

  function getElementSelector(element) {
    const slide = element.closest('section.slide[data-slide-id]');
    if (!slide) return null;
    const nodeId = element.getAttribute('data-node-id');
    if (nodeId) return '[data-node-id="' + attrEscape(nodeId) + '"]';
    const anchorId = element.getAttribute('data-ai-anchor-id');
    if (anchorId) return '[data-ai-anchor-id="' + attrEscape(anchorId) + '"]';
    const id = element.getAttribute('id');
    if (id) return '#' + cssEscape(id);
    const classes = Array.from(element.classList || []).filter((item) => item && item !== 'is-ai-pick-hover').slice(0, 2);
    if (classes.length) return element.tagName.toLowerCase() + '.' + classes.map(cssEscape).join('.');
    const parent = element.parentElement;
    if (!parent) return element.tagName.toLowerCase();
    const index = Array.prototype.indexOf.call(parent.children, element);
    return element.tagName.toLowerCase() + ':nth-child(' + (index + 1) + ')';
  }

  function clearPickHover() {
    if (elementPickHover) {
      elementPickHover.classList.remove('is-ai-pick-hover');
      elementPickHover = null;
    }
  }

  function pickElement(origin) {
    const element = origin?.closest?.('[data-node-id], [data-ai-anchor-id], h1, h2, h3, h4, p, li, span, img, figure, article, div');
    if (!element || !element.closest('section.slide[data-slide-id]')) return null;
    if (element.matches('html, body, section.slide, .deck')) return null;
    return element;
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (elementPickMode) {
      const element = pickElement(target);
      const slide = element?.closest?.('section.slide[data-slide-id]');
      const selector = element ? getElementSelector(element) : null;
      if (!element || !slide || !selector) return;
      event.preventDefault();
      event.stopPropagation();
      elementPickMode = false;
      clearPickHover();
      window.parent?.postMessage({
        source: previewSource,
        type: 'element-picked',
        slideId: getSlideId(slide),
        selector,
        elementTag: element.tagName.toLowerCase(),
        elementText: (element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
      }, '*');
      return;
    }
    const node = target?.closest?.('[data-node-id]');
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    const nodeId = node.dataset.nodeId;
    setSelectedNode(nodeId);
    window.parent?.postMessage({ source: previewSource, type: 'select-node', nodeId }, '*');
  }, true);

  document.addEventListener('mousemove', (event) => {
    if (!elementPickMode) return;
    const element = pickElement(event.target);
    if (elementPickHover === element) return;
    clearPickHover();
    elementPickHover = element;
    elementPickHover?.classList.add('is-ai-pick-hover');
  }, true);

  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.source === parentSource && data.type === 'go-to-slide' && data.slideId) {
      setActiveSlide(data.slideId);
    }
    if (data.source === parentSource && data.type === 'select-node') {
      setSelectedNode(data.nodeId);
    }
    if (data.source === parentSource && data.type === 'set-element-pick-mode') {
      elementPickMode = Boolean(data.enabled);
      document.body.style.cursor = elementPickMode ? 'crosshair' : '';
      if (!elementPickMode) clearPickHover();
    }
  });

  window.addEventListener('resize', () => {
    if (currentActiveSlide) {
      measureActiveSlide(currentActiveSlide);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', settleActiveSlide);
  } else {
    settleActiveSlide();
  }
})();`
  document.body.appendChild(script)
}
function resolveAgentPhaseProgress(phase: AgentPhase): number {
  if (phase === 'queued') {
    return 18
  }

  if (phase === 'searching') {
    return 42
  }

  if (phase === 'drafting') {
    return 68
  }

  return 88
}

function createNextImageId(deck: ParsedDeck): string {
  const existing = Object.keys(deck.nodes)
    .filter((nodeId) => nodeId.startsWith('image-'))
    .map((nodeId) => Number(nodeId.replace('image-', '')))
    .filter((value) => !Number.isNaN(value))

  return `image-${(existing.length ? Math.max(...existing) : 0) + 1}`
}

function getSlideButtonTitle(deck: ParsedDeck, slideId: string, index: number): string {
  if (deck.profile !== 'html-ppt') {
    return `第 ${index + 1} 页`
  }

  return deck.slides.find((slide) => slide.id === slideId)?.title ?? `第 ${index + 1} 页`
}


function getNodeButtonLabel(deck: ParsedDeck, document: Document, nodeId: string): string {
  const node = deck.nodes[nodeId]
  if (!node) {
    return nodeId
  }

  if (deck.profile !== 'html-ppt') {
    return nodeId
  }

  return getNodeInspectorTitle(deck, document, nodeId)
}

function getNodeInspectorTitle(deck: ParsedDeck, document: Document, nodeId: string): string {
  const node = deck.nodes[nodeId]
  if (!node) {
    return nodeId
  }

  if (deck.profile !== 'html-ppt') {
    return nodeId
  }

  if (node.kind === 'image') {
    return `图片：${truncateNodeLabel(node.image.alt || node.label || '未命名图片')}`
  }

  if (node.kind === 'component') {
    const firstSlot = Object.values(node.slots).find((value) => value.trim().length > 0)
    return `组件：${truncateNodeLabel(firstSlot || node.label || node.id)}`
  }

  return `${node.role || '文本'}：${truncateNodeLabel(readTextContent(document, nodeId) || node.label)}`
}

function readTextContent(document: Document, nodeId: string, slotKey?: string): string {
  const node = slotKey
    ? document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"] [data-slot-key="${slotKey}"]`)
    : document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`)
  if (!node) {
    return ''
  }

  const clone = node.cloneNode(true) as HTMLElement
  clone.querySelectorAll('br').forEach((breakNode) => {
    breakNode.replaceWith('\n')
  })

  return normalizeEditableText(clone.textContent ?? '')
}

function normalizeEditableText(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

async function* readPptxExportEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<PptxExportEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

    let lineBreakIndex = buffer.indexOf('\n')
    while (lineBreakIndex >= 0) {
      const rawLine = buffer.slice(0, lineBreakIndex).trim()
      buffer = buffer.slice(lineBreakIndex + 1)

      if (rawLine) {
        yield pptxExportEventSchema.parse(JSON.parse(rawLine))
      }

      lineBreakIndex = buffer.indexOf('\n')
    }

    if (done) {
      break
    }
  }

  const finalLine = buffer.trim()
  if (finalLine) {
    yield pptxExportEventSchema.parse(JSON.parse(finalLine))
  }
}

async function downloadArtifact(downloadUrl: string, fileName: string): Promise<void> {
  const response = await fetch(downloadUrl)
  if (!response.ok) {
    throw new Error('PPTX 文件下载失败')
  }

  const arrayBuffer = await response.arrayBuffer()
  const blob = new Blob([arrayBuffer], {
    type: response.headers.get('content-type') ?? 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })
  const objectUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = fileName || 'export.pptx'
    anchor.click()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function hashString(value: string): string {
  let hash = 5381
  for (const char of value) {
    hash = (hash * 33) ^ char.charCodeAt(0)
  }

  return `deck-${Math.abs(hash >>> 0).toString(16)}`
}

function createAltFromFilename(fileName: string): string {
  const normalized = fileName.replace(/\.[^.]+$/, '').trim()
  return normalized || '图片'
}

function isImageAssetFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : PLACEHOLDER_IMAGE)
    reader.readAsDataURL(file)
  })
}

function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      resolve({
        width: width || DEFAULT_IMAGE_WIDTH,
        height: height || DEFAULT_IMAGE_HEIGHT,
      })
    }
    image.onerror = () =>
      resolve({
        width: DEFAULT_IMAGE_WIDTH,
        height: DEFAULT_IMAGE_HEIGHT,
      })
    image.src = dataUrl
  })
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  const tagName = target.tagName
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}
