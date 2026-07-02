import { useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

import {
  agentTurnEventSchema,
  htmlPptAssetSchema,
  optimizePromptResponseSchema,
  sessionSnapshotSchema,
  type AgentTurnEvent,
  type AiTurnRequest,
  type HtmlPptAsset,
  type HtmlPptConfig,
  type InputReply,
  type PendingInput,
} from '../agent/protocol'
import { extractThemeFromPrompt } from '../agent/themeExtractor'

const SESSION_STORAGE_KEY = 'html-slide-editor:agent-session-id'
const TRANSCRIPT_STORAGE_KEY_PREFIX = 'html-slide-editor:agent-transcript:'
const DEFAULT_DOCUMENT_ID = 'local-document'
const FIXED_AGENT_SKILL_ID = 'html_ppt'

type TranscriptEntry = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

type CandidateEvent =
  | Extract<AgentTurnEvent, { type: 'candidate_ready' }>
  | Extract<AgentTurnEvent, { type: 'html_candidate_ready' }>

export type HtmlPptPreview = {
  id: string
  variantId: string
  name: string
  description: string
  html: string
}

export type PendingFormAnswer = {
  value: string
  text: string
}

export type HtmlPptBrief = HtmlPptConfig

type ActiveRequestState = {
  requestId: number
  controller: AbortController
  assistantEntryId: string
}

const INITIAL_AGENT_STATUS = '已向智能体发送当前 deck 与需求'

type ExplicitHtmlPptConfig = Partial<HtmlPptConfig>

type UseAgentSessionOptions = {
  initialComposerText?: string
  sessionId?: string
}

export function useAgentSession(options: UseAgentSessionOptions = {}) {
  const sessionId = useMemo(() => options.sessionId ?? getOrCreateSessionId(), [options.sessionId])
  const initialTranscript = useMemo(() => loadStoredTranscript(sessionId), [sessionId])
  const entryCounterRef = useRef(initialTranscript.length)
  const requestCounterRef = useRef(0)
  const activeRequestRef = useRef<ActiveRequestState | null>(null)
  const transcriptRef = useRef<TranscriptEntry[]>(initialTranscript)
  const shouldRestoreUploadedAssetsRef = useRef(true)
  const [composerText, setComposerText] = useState(() => options.initialComposerText ?? '')
  const [replyText, setReplyText] = useState('')
  const [pendingInput, setPendingInput] = useState<PendingInput | null>(null)
  const [pendingFormAnswers, setPendingFormAnswers] = useState<Record<string, PendingFormAnswer>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>(initialTranscript)
  const [candidate, setCandidate] = useState<CandidateEvent | null>(null)
  const [htmlPptConfig, setHtmlPptConfig] = useState<ExplicitHtmlPptConfig>({})
  const [uploadedAssets, setUploadedAssets] = useState<HtmlPptAsset[]>([])
  const [activeStatus, setActiveStatus] = useState<string | null>(null)
  const [activePhase, setActivePhase] = useState<Extract<AgentTurnEvent, { type: 'status' }>['phase'] | null>(null)
  const [streamingAssistantText, setStreamingAssistantText] = useState('')
  const [lastCandidateDisposition, setLastCandidateDisposition] = useState<
    AiTurnRequest['lastCandidateDisposition']
  >()
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizedPrompt, setOptimizedPrompt] = useState<string | null>(null)
  const [optimizationExplanation, setOptimizationExplanation] = useState<string | null>(null)
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState('')

  useEffect(
    () => () => {
      activeRequestRef.current?.controller.abort()
    },
    [],
  )

  useEffect(() => {
    const controller = new AbortController()

    async function restoreUploadedAssets() {
      try {
        const response = await fetch(`/api/agent/sessions/${encodeURIComponent(sessionId)}/snapshot`, {
          signal: controller.signal,
        })
        if (response.status === 404) {
          return
        }
        if (!response.ok) {
          throw new Error('snapshot restore failed')
        }

        const payload = await response.json() as {
          snapshot: unknown
        }
        const snapshot = sessionSnapshotSchema.nullable().parse(payload.snapshot)
        const restoredAssets = snapshot?.htmlPptState?.uploadedAssets ?? []
        if (!shouldRestoreUploadedAssetsRef.current) {
          return
        }
        setUploadedAssets((current) => current.length ? current : restoredAssets)
      } catch (error) {
        // Snapshot restore is best-effort; a missing or temporarily unavailable
        // server session should not interrupt local editing.
        void error
      }
    }

    void restoreUploadedAssets()

    return () => {
      controller.abort()
    }
  }, [sessionId])

  useEffect(() => {
    if (!options.initialComposerText) {
      return
    }

    setComposerText((current) => (current.trim().length > 0 ? current : options.initialComposerText ?? ''))
  }, [options.initialComposerText])

  function updateTranscript(updater: (current: TranscriptEntry[]) => TranscriptEntry[]): void {
    const nextTranscript = updater(transcriptRef.current)
    transcriptRef.current = nextTranscript
    setTranscript(nextTranscript)
  }

  async function submitTurn(
    currentDeckHtml: string,
    generationMode: AiTurnRequest['generationMode'],
    context?: {
      selectedElement?: AiTurnRequest['selectedElement']
      messageAssetIds?: string[]
    },
  ): Promise<void> {
    const message = pendingInput ? '' : composerText.trim()
    const inputReply = pendingInput
      ? buildInputReply(pendingInput, replyText, pendingFormAnswers)
      : undefined

    if (!message && !inputReply) {
      return
    }

    abortActiveRequest('已终止上一次生成')
    requestCounterRef.current += 1
    const requestId = requestCounterRef.current
    const controller = new AbortController()
    const assistantEntryId = createEntryId(entryCounterRef)
    activeRequestRef.current = {
      requestId,
      controller,
      assistantEntryId,
    }

    const isCurrentRequest = () => activeRequestRef.current?.requestId === requestId
    const userEntryText = pendingInput
      ? summarizeInputReply(pendingInput, inputReply)
      : message
    const nextLastSubmittedPrompt = pendingInput && lastSubmittedPrompt
      ? `${lastSubmittedPrompt}\n${userEntryText}`
      : userEntryText
    setLastSubmittedPrompt(nextLastSubmittedPrompt)
    let extractedConfig: ExplicitHtmlPptConfig = {}
    let shouldLetModelSelectStyle = false
    if (message && !pendingInput) {
      const extraction = extractThemeFromPrompt(message, buildThemeExtractionReferenceText(uploadedAssets))
      if (extraction.confidence > 0.5) {
        extractedConfig = {
          ...(extraction.explicitThemeName && extraction.themeName && { themeName: extraction.themeName }),
          ...(extraction.explicitFullDeckName && extraction.fullDeckName && { fullDeckName: extraction.fullDeckName }),
          ...(extraction.layoutNames?.length && { layoutNames: extraction.layoutNames }),
          ...(extraction.audience && { audience: extraction.audience }),
          ...(extraction.format && { format: extraction.format }),
        }
        shouldLetModelSelectStyle = !extraction.explicitThemeName && !extraction.explicitFullDeckName
      }
    }

    const shouldResetStyleForNewDeck = shouldLetModelSelectStyle && generationMode === 'from-scratch'
    const extractedHtmlPptConfig = shouldResetStyleForNewDeck
      ? {
          ...htmlPptConfig,
          themeName: undefined,
          fullDeckName: undefined,
          layoutNames: undefined,
          animationNames: undefined,
          ...extractedConfig,
        }
      : { ...htmlPptConfig, ...extractedConfig }
    const nextHtmlPptConfig = mergeHtmlPptConfigFromReply(extractedHtmlPptConfig, inputReply)

    const requestBody: AiTurnRequest = {
      sessionId,
      documentId: DEFAULT_DOCUMENT_ID,
      message,
      skillId: FIXED_AGENT_SKILL_ID,
      currentDeckHtml,
      currentDeckHash: hashString(currentDeckHtml),
      clientContext: {
        locale: typeof navigator === 'undefined' ? 'zh-CN' : navigator.language || 'zh-CN',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        surface: 'editor',
      },
      generationMode,
      lastCandidateDisposition,
      htmlPpt: buildHtmlPptRequestConfig(nextHtmlPptConfig),
      selectedElement: context?.selectedElement,
      messageAssetIds: context?.messageAssetIds,
      inputReply,
    }

    setIsSubmitting(true)
    setActiveStatus(INITIAL_AGENT_STATUS)
    setActivePhase('queued')
    setStreamingAssistantText('')
    setComposerText('')
    setReplyText('')
    setCandidate(null)
    setPendingInput(null)
    setPendingFormAnswers({})
    setHtmlPptConfig(nextHtmlPptConfig)
    updateTranscript((current) => [
      ...current,
      {
        id: createEntryId(entryCounterRef),
        role: 'user',
        text: userEntryText,
      },
      {
        id: assistantEntryId,
        role: 'assistant',
        text: INITIAL_AGENT_STATUS,
      },
    ])

    try {
      const response = await fetch('/api/ai/turns', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error('AI 服务暂时不可用')
      }

      let streamingAssistantEntryId: string | null = assistantEntryId
      let hasAssistantContent = false
      for await (const event of readAgentTurnEvents(response.body)) {
        if (!isCurrentRequest()) {
          break
        }

        if (event.type === 'status') {
          setActiveStatus(event.label)
          setActivePhase(event.phase)
          if (!hasAssistantContent && streamingAssistantEntryId) {
            updateTranscript((current) =>
              current.map((entry) =>
                entry.id === streamingAssistantEntryId ? { ...entry, text: event.label } : entry,
              ),
            )
          }
          continue
        }

        if (event.type === 'assistant_delta') {
          const shouldAppend = hasAssistantContent
          setStreamingAssistantText((current) => (shouldAppend ? `${current}${event.text}` : event.text))
          if (!streamingAssistantEntryId) {
            streamingAssistantEntryId = createEntryId(entryCounterRef)
            const nextEntryId = streamingAssistantEntryId
            updateTranscript((current) => [
              ...current,
              {
                id: nextEntryId,
                role: 'assistant',
                text: event.text,
              },
            ])
          } else {
            updateTranscript((current) =>
              current.map((entry) =>
                entry.id === streamingAssistantEntryId
                  ? { ...entry, text: shouldAppend ? `${entry.text}${event.text}` : event.text }
                  : entry,
              ),
            )
          }
          hasAssistantContent = true
          continue
        }

        if (event.type === 'assistant_done') {
          setStreamingAssistantText(event.text)
          if (streamingAssistantEntryId) {
            updateTranscript((current) =>
              current.map((entry) =>
                entry.id === streamingAssistantEntryId ? { ...entry, text: event.text } : entry,
              ),
            )
          } else {
            updateTranscript((current) => [
              ...current,
              {
                id: createEntryId(entryCounterRef),
                role: 'assistant',
                text: event.text,
              },
            ])
          }
          hasAssistantContent = true
          streamingAssistantEntryId = null
          continue
        }

        if (event.type === 'input_required') {
          const nextPendingInput = stripInputRequiredType(event)
          setPendingInput(nextPendingInput)
          setReplyText('')
          setPendingFormAnswers(createPendingFormAnswerDraft(nextPendingInput, htmlPptConfig))
          setActiveStatus('等待你的回答')
          setActivePhase(null)
          continue
        }

        if (event.type === 'candidate_ready' || event.type === 'html_candidate_ready') {
          setActiveStatus(event.runMeta.usedWebSearch ? '已完成搜索并生成候选' : '候选已生成')
          setActivePhase(null)
          setStreamingAssistantText('')
          setCandidate(event)
          continue
        }

        if (event.type === 'error') {
          setActiveStatus(event.message)
          setActivePhase(null)
          if (streamingAssistantEntryId) {
            updateTranscript((current) =>
              current.map((entry) =>
                entry.id === streamingAssistantEntryId ? { ...entry, text: event.message } : entry,
              ),
            )
          } else {
            updateTranscript((current) => [
              ...current,
              {
                id: createEntryId(entryCounterRef),
                role: 'assistant',
                text: event.message,
              },
            ])
          }
          hasAssistantContent = true
        }
      }

      if (isCurrentRequest()) {
        setLastCandidateDisposition(undefined)
      }
    } catch (error) {
      if (isAbortError(error)) {
        if (isCurrentRequest()) {
          setActiveStatus('已终止本次生成')
          setActivePhase(null)
          updateTranscript((current) =>
            current.map((entry) =>
              entry.id === assistantEntryId ? { ...entry, text: '已终止本次生成' } : entry,
            ),
          )
        }
        return
      }

      if (!isCurrentRequest()) {
        return
      }

      setActiveStatus(null)
      setActivePhase(null)
      updateTranscript((current) =>
        current.map((entry) =>
          entry.id === assistantEntryId
            ? { ...entry, text: error instanceof Error ? error.message : 'AI 请求失败' }
            : entry,
        ),
      )
    } finally {
      if (isCurrentRequest()) {
        activeRequestRef.current = null
        setIsSubmitting(false)
      }
    }
  }

  function abortActiveRequest(message: string): boolean {
    const activeRequest = activeRequestRef.current
    if (!activeRequest) {
      return false
    }

    activeRequestRef.current = null
    activeRequest.controller.abort()
    setIsSubmitting(false)
    setActiveStatus(message)
    setActivePhase(null)
    updateTranscript((current) =>
      current.map((entry) =>
        entry.id === activeRequest.assistantEntryId ? { ...entry, text: message } : entry,
      ),
    )
    return true
  }

  function abortTurn(): void {
    abortActiveRequest('已终止本次生成')
  }

  async function clearConversation(options?: {
    preserveUploadedAssets?: boolean
  }): Promise<void> {
    abortActiveRequest('已终止本次生成')
    transcriptRef.current = []
    setTranscript([])
    removeStoredTranscript(sessionId)
    setCandidate(null)
    setPendingInput(null)
    setPendingFormAnswers({})
    setReplyText('')
    setLastCandidateDisposition(undefined)
    setActiveStatus(null)
    setActivePhase(null)
    setStreamingAssistantText('')
    setComposerText('')
    setOptimizedPrompt(null)
    setOptimizationExplanation(null)
    if (options?.preserveUploadedAssets === false) {
      shouldRestoreUploadedAssetsRef.current = false
      setUploadedAssets([])
    }

    try {
      const response = await fetch(`/api/agent/sessions/${encodeURIComponent(sessionId)}/reset`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          preserveUploadedAssets: options?.preserveUploadedAssets ?? true,
        }),
      })
      if (!response.ok) {
        throw new Error('reset failed')
      }
    } catch {
      setActiveStatus('本地记录已清空，服务端上下文重置失败')
    }
  }

  function markCandidateDisposition(status: 'applied' | 'discarded'): void {
    if (!candidate) {
      return
    }

    setLastCandidateDisposition({
      candidateId: candidate.candidateId,
      status,
    })
    setCandidate(null)
    setActivePhase(null)
    setStreamingAssistantText('')
  }

  function updatePendingFormAnswer(questionId: string, value: PendingFormAnswer): void {
    setPendingFormAnswers((current) => ({
      ...current,
      [questionId]: value,
    }))
  }

  async function uploadHtmlPptAsset(file: File): Promise<HtmlPptAsset | null> {
    setActiveStatus('正在上传参考资料')

    try {
      const response = await fetch(`/api/agent/uploads?sessionId=${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        headers: {
          'content-type': file.type || 'application/octet-stream',
          'x-file-name': encodeURIComponent(file.name),
        },
        body: await file.arrayBuffer(),
      })

      if (!response.ok) {
        throw new Error('上传参考素材失败')
      }

      const payload = await response.json() as {
        asset: HtmlPptAsset
      }
      const asset = htmlPptAssetSchema.parse(payload.asset)

      setUploadedAssets((current) => {
        const next = current.filter((item) => item.assetId !== asset.assetId)
        next.push(asset)
        return next
      })
      setActiveStatus(`已上传参考资料：${asset.fileName}`)
      return asset
    } catch (error) {
      setActiveStatus(`参考资料上传失败：${error instanceof Error ? error.message : '未知错误'}`)
      return null
    }
  }

  async function optimizePrompt(generationMode?: 'from-scratch' | 'from-current'): Promise<void> {
    const message = composerText.trim()
    if (!message) {
      return
    }

    setIsOptimizing(true)
    try {
      const response = await fetch('/api/ai/optimize-prompt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: message,
          context: {
            generationMode,
            hasUploadedAssets: uploadedAssets.length > 0,
          },
        }),
      })
      if (!response.ok) {
        throw new Error('优化请求失败')
      }
      const data = optimizePromptResponseSchema.parse(await response.json())
      setOptimizedPrompt(data.optimizedPrompt)
      setOptimizationExplanation(data.explanation)
    } catch (error) {
      setActiveStatus(error instanceof Error ? error.message : '提示词优化失败')
    } finally {
      setIsOptimizing(false)
    }
  }

  function applyOptimizedPrompt(): void {
    if (optimizedPrompt) {
      setComposerText(optimizedPrompt)
      setOptimizedPrompt(null)
      setOptimizationExplanation(null)
    }
  }

  function dismissOptimization(): void {
    setOptimizedPrompt(null)
    setOptimizationExplanation(null)
  }

  useEffect(() => {
    storeTranscript(sessionId, transcript)
  }, [sessionId, transcript])

  return {
    sessionId,
    candidate,
    composerText,
    replyText,
    pendingInput,
    pendingFormAnswers,
    activeStatus,
    activePhase,
    streamingAssistantText,
    uploadedAssets,
    isSubmitting,
    transcript,
    isOptimizing,
    optimizedPrompt,
    optimizationExplanation,
    lastSubmittedPrompt,
    setComposerText,
    setReplyText,
    updatePendingFormAnswer,
    uploadHtmlPptAsset,
    abortTurn,
    clearConversation,
    submitTurn,
    markCandidateDisposition,
    setOptimizedPrompt,
    optimizePrompt,
    applyOptimizedPrompt,
    dismissOptimization,
  }
}

async function* readAgentTurnEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<AgentTurnEvent> {
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
        const parsed = agentTurnEventSchema.parse(JSON.parse(rawLine))
        yield parsed
      }

      lineBreakIndex = buffer.indexOf('\n')
    }

    if (done) {
      break
    }
  }

  const finalLine = buffer.trim()
  if (finalLine) {
    yield agentTurnEventSchema.parse(JSON.parse(finalLine))
  }
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') {
    return 'server-session'
  }

  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (existing) {
    return existing
  }

  const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `session-${Date.now()}`
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, next)
  return next
}

function createEntryId(counterRef: MutableRefObject<number>): string {
  counterRef.current += 1
  return `agent-entry-${counterRef.current}`
}

function loadStoredTranscript(sessionId: string): TranscriptEntry[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.sessionStorage.getItem(`${TRANSCRIPT_STORAGE_KEY_PREFIX}${sessionId}`)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as TranscriptEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function storeTranscript(sessionId: string, transcript: TranscriptEntry[]): void {
  if (typeof window === 'undefined') {
    return
  }

  if (!transcript.length) {
    removeStoredTranscript(sessionId)
    return
  }

  window.sessionStorage.setItem(`${TRANSCRIPT_STORAGE_KEY_PREFIX}${sessionId}`, JSON.stringify(transcript))
}

function removeStoredTranscript(sessionId: string): void {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(`${TRANSCRIPT_STORAGE_KEY_PREFIX}${sessionId}`)
}

function hashString(value: string): string {
  let hash = 5381
  for (const char of value) {
    hash = (hash * 33) ^ char.charCodeAt(0)
  }

  return `deck-${Math.abs(hash >>> 0).toString(16)}`
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function buildInputReply(
  pendingInput: PendingInput,
  replyText: string,
  pendingFormAnswers: Record<string, PendingFormAnswer>,
): InputReply | undefined {
  if (pendingInput.kind === 'text') {
    const trimmed = replyText.trim()
    if (!trimmed) {
      return undefined
    }

    return {
      inputId: pendingInput.inputId,
      answers: [
        {
          questionId: 'reply',
          value: trimmed,
          text: trimmed,
        },
      ],
    }
  }

  const answers = pendingInput.questions.flatMap((question) => {
    const answer = pendingFormAnswers[question.id]
    if (!answer?.value) {
      return []
    }

    if (question.allowFreeText && answer.value === 'other' && !answer.text.trim()) {
      return []
    }

    return [
      {
        questionId: question.id,
        value: answer.value,
        text: answer.text.trim() || undefined,
      },
    ]
  })

  return answers.length
    ? {
        inputId: pendingInput.inputId,
        answers,
      }
    : undefined
}

function summarizeInputReply(pendingInput: PendingInput, inputReply: InputReply | undefined): string {
  if (!inputReply) {
    return ''
  }

  if (pendingInput.kind === 'text') {
    return inputReply.answers[0]?.text ?? inputReply.answers[0]?.value ?? ''
  }

  return inputReply.answers
    .map((answer) => {
      const question = pendingInput.questions.find((item) => item.id === answer.questionId)
      const optionLabel = question?.options.find((item) => item.value === answer.value)?.label ?? answer.value
      return answer.text ? `${question?.header ?? answer.questionId}: ${optionLabel} (${answer.text})` : `${question?.header ?? answer.questionId}: ${optionLabel}`
    })
    .join('；')
}

function stripInputRequiredType(
  event: Extract<AgentTurnEvent, { type: 'input_required' }>,
): PendingInput {
  const { type: _type, ...pendingInput } = event
  return pendingInput
}

function createPendingFormAnswerDraft(
  pendingInput: PendingInput,
  htmlPptConfig: ExplicitHtmlPptConfig,
): Record<string, PendingFormAnswer> {
  if (pendingInput.kind !== 'form') {
    return {}
  }

  const defaults = new Map<string, string>([
    ['audience', htmlPptConfig.audience ?? ''],
    ['format', htmlPptConfig.format ?? ''],
    ['themeName', htmlPptConfig.themeName ?? ''],
    ['fullDeckName', htmlPptConfig.fullDeckName ?? ''],
  ])

  return Object.fromEntries(
    pendingInput.questions.map((question) => [
      question.id,
      {
        value: defaults.get(question.id) ?? '',
        text: '',
      },
    ]),
  )
}

function mergeHtmlPptConfigFromReply(
  current: ExplicitHtmlPptConfig,
  inputReply: InputReply | undefined,
): ExplicitHtmlPptConfig {
  if (!inputReply) {
    return current
  }

  let next = current
  for (const answer of inputReply.answers) {
    if (answer.questionId === 'audience' && isAudience(answer.value)) {
      next = { ...next, audience: answer.value }
    }
    if (answer.questionId === 'format' && isFormat(answer.value)) {
      next = { ...next, format: answer.value }
    }
    if (answer.questionId === 'themeName' && answer.value) {
      next = { ...next, themeName: answer.value }
    }
    if (answer.questionId === 'fullDeckName' && answer.value) {
      next = { ...next, fullDeckName: answer.value }
    }
    if (answer.questionId === 'slideCountHint') {
      const parsed = Number(answer.text?.trim() || answer.value)
      if (Number.isFinite(parsed) && parsed > 0) {
        next = { ...next, slideCountHint: parsed }
      }
    }
  }

  return next
}

function buildHtmlPptRequestConfig(
  htmlPptConfig: ExplicitHtmlPptConfig,
): HtmlPptConfig | undefined {
  const hasAnyConfig = Boolean(
    htmlPptConfig.audience
    || htmlPptConfig.format
    || htmlPptConfig.themeName
    || htmlPptConfig.fullDeckName
    || htmlPptConfig.slideCountHint
    || htmlPptConfig.layoutNames?.length
    || htmlPptConfig.animationNames?.length,
  )

  if (!hasAnyConfig) {
    return undefined
  }

  return {
    ...htmlPptConfig,
    includeNotes: htmlPptConfig.includeNotes ?? true,
    preserveRuntime: htmlPptConfig.preserveRuntime ?? true,
  } as HtmlPptConfig
}

function buildThemeExtractionReferenceText(assets: HtmlPptAsset[]): string {
  return assets
    .map((asset) => asset.referenceText?.excerpt)
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n')
}

function isAudience(value: string): value is NonNullable<HtmlPptConfig['audience']> {
  return value === 'engineers'
    || value === 'executives'
    || value === 'students'
    || value === 'consumers'
    || value === 'general'
}

function isFormat(value: string): value is NonNullable<HtmlPptConfig['format']> {
  return value === 'live' || value === 'pdf' || value === 'xhs' || value === 'standalone'
}
