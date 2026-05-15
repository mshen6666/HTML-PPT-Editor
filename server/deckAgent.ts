import { compileDeckDraftToHtml, type DeckDraft } from '../src/agent/deckDraft'
import type { AgentTurnEvent } from '../src/agent/protocol'
import type { DeckAgent, DeckAgentTurnRequest } from './createAiServer'
import { agentRuntimeConfig } from './agentRuntimeConfig'
import { FileSystemArtifactStore, type ArtifactStore } from './artifactStore'
import {
  createHtmlPptFallbackHtml,
  extractHtmlPreviewMeta,
} from './frontendSlides'
import { getAgentSkill, resolveSearchMode, shouldUseWebSearch } from './skillRegistry'
import { FileSystemSandboxManager, type SandboxManager } from './sandboxManager'
import { createSandboxedClaudeCodeDeckAgent } from './claudeCodeHtmlPptAgent'
import { createSandboxJanitor } from './sandboxJanitor'
import { FileSystemUploadStore, type UploadStore } from './uploadStore'
import { createWorkerRuntimeConfig, type WorkerRuntimeConfig } from './workerRuntimeConfig'

const DEFAULT_MODEL = agentRuntimeConfig.model
const startedSandboxJanitorRoots = new Set<string>()

type ConfiguredDeckAgentFactoryOptions = {
  runtimeConfig: WorkerRuntimeConfig
  sandboxManager: SandboxManager
  artifactStore: ArtifactStore
  uploadStore: UploadStore
}

type ConfiguredDeckAgentOptions = {
  deckAgentFactory?: (options: ConfiguredDeckAgentFactoryOptions) => DeckAgent
  startSandboxJanitor?: boolean
}

export function createConfiguredDeckAgent(options: ConfiguredDeckAgentOptions = {}): DeckAgent {
  const runtimeConfig = createWorkerRuntimeConfig()
  const sandboxManager = new FileSystemSandboxManager({
    rootDir: runtimeConfig.sandboxRoot,
    skillBundlePath: runtimeConfig.skillBundlePath,
  })

  if (options.startSandboxJanitor !== false && !startedSandboxJanitorRoots.has(runtimeConfig.sandboxRoot)) {
    createSandboxJanitor({
      rootDir: runtimeConfig.sandboxRoot,
      intervalMs: runtimeConfig.sandboxJanitorIntervalMs,
      staleAfterMs: runtimeConfig.sandboxStaleAfterMs,
      isActiveSandbox: (sandboxPath) => sandboxManager.isActiveSandbox(sandboxPath),
    }).start()
    startedSandboxJanitorRoots.add(runtimeConfig.sandboxRoot)
  }

  const factoryOptions = {
    runtimeConfig,
    sandboxManager,
    artifactStore: new FileSystemArtifactStore({
      rootDir: runtimeConfig.artifactRoot,
    }),
    uploadStore: new FileSystemUploadStore({
      rootDir: runtimeConfig.uploadRoot,
    }),
  }

  return (options.deckAgentFactory ?? ((factoryArgs) => createSandboxedClaudeCodeDeckAgent({
    ...factoryArgs,
    fallbackAgent: createMockDeckAgent(),
  })))(factoryOptions)
}

class AgentTurnAbortedError extends Error {
  constructor() {
    super('Agent turn aborted')
  }
}

function throwIfTurnAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AgentTurnAbortedError()
  }
}

async function* abortableAgentEvents<T>(
  iterable: AsyncIterable<T>,
  signal: AbortSignal | undefined,
): AsyncIterable<T> {
  const iterator = iterable[Symbol.asyncIterator]()

  try {
    while (true) {
      const next = await waitForAbortableNext(iterator.next(), signal)
      if (next.done) {
        return
      }

      yield next.value
    }
  } finally {
    await iterator.return?.()
  }
}

function waitForAbortableNext<T>(
  nextPromise: Promise<IteratorResult<T>>,
  signal: AbortSignal | undefined,
): Promise<IteratorResult<T>> {
  if (!signal) {
    return nextPromise
  }

  if (signal.aborted) {
    return Promise.reject(new AgentTurnAbortedError())
  }

  return new Promise<IteratorResult<T>>((resolve, reject) => {
    const handleAbort = () => {
      reject(new AgentTurnAbortedError())
    }

    signal.addEventListener('abort', handleAbort, { once: true })
    nextPromise.then(
      (value) => {
        signal.removeEventListener('abort', handleAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', handleAbort)
        reject(error)
      },
    )
  })
}

async function destroySandboxSafely(
  sandboxManager: SandboxManager,
  sandbox: {
    rootDir: string
    sandboxId: string
  },
): Promise<void> {
  try {
    await sandboxManager.destroy(sandbox)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY') {
      console.warn('[deck-agent] sandbox cleanup deferred', {
        sandboxId: sandbox.sandboxId,
        rootDir: sandbox.rootDir,
        code,
      })
      return
    }

    throw error
  }
}

export function createMockDeckAgent(): DeckAgent {
  return {
    async *runTurn(request: DeckAgentTurnRequest): AsyncIterable<AgentTurnEvent> {
      const searchMode = resolveSearchMode(request)
      const skill = getAgentSkill(request.skillId)

      yield {
        type: 'status',
        phase: 'drafting',
        label: '正在分析需求',
      }

      if (skill.workflow === 'html_agent') {
        const targetSlideCount = resolveFrontendSlidesTargetSlideCount(request)
        const currentSlideCount = request.currentSlideCount ?? countSlidesInHtml(request.currentDeckHtml)
        if (!request.inputReply) {
          if (request.htmlAgentOperation === 'extend_remaining' && currentSlideCount < targetSlideCount) {
            yield {
              type: 'assistant_done',
              text: `我会基于当前 ${currentSlideCount} 页内容继续补齐到 ${targetSlideCount} 页。`,
            }
            yield {
              type: 'status',
              phase: 'finalizing',
              label: '正在生成 HTML 候选',
            }

            const fallback = createHtmlPptFallbackHtml(
              request.message || summarizeReplyValue(request),
              request.htmlPpt,
              {
                targetSlideCount,
                existingHtml: request.currentDeckHtml,
                state: request.sessionSnapshot?.htmlPptState,
              },
            )
            yield {
              type: 'html_candidate_ready',
              candidateId: `candidate-${Date.now()}`,
              summary: '已生成一份 html-ppt 风格的 HTML 候选。',
              html: fallback.html,
              previewMeta: createHtmlPptPreviewMeta(fallback.html, targetSlideCount, true),
              sources: [],
              runMeta: {
                skillId: skill.id,
                model: `mock:${DEFAULT_MODEL}`,
                usedWebSearch: false,
                searchMode,
                isFallback: true,
              },
            }
            return
          }

          yield {
            type: 'assistant_done',
            text: '我先收集演示背景，再继续生成 HTML。',
          }
          yield {
            type: 'input_required',
            kind: 'form',
            inputId: 'mock-html-ppt-input',
            responseId: 'mock-html-ppt-response',
            title: 'Presentation Context',
            submitLabel: '继续生成',
            questions: createMockFrontendSlidesQuestions(),
          }
          return
        }

        const fallback = createHtmlPptFallbackHtml(
          request.message || summarizeReplyValue(request),
          request.htmlPpt,
          {
            targetSlideCount,
            existingHtml: request.currentDeckHtml,
            state: request.sessionSnapshot?.htmlPptState,
          },
        )
        yield {
          type: 'assistant_done',
          text: '我已经根据你的回答整理好叙事和结构，下面给出 HTML 候选。',
        }
        yield {
          type: 'status',
          phase: 'finalizing',
          label: '正在生成 HTML 候选',
        }
        yield {
          type: 'html_candidate_ready',
          candidateId: `candidate-${Date.now()}`,
          summary: '已生成一份 html-ppt 风格的 HTML 候选。',
          html: fallback.html,
          previewMeta: createHtmlPptPreviewMeta(fallback.html, targetSlideCount),
          sources: [],
          runMeta: {
            skillId: skill.id,
            model: `mock:${DEFAULT_MODEL}`,
            usedWebSearch: false,
            searchMode,
            isFallback: true,
          },
        }
        return
      }

      const draft = createFallbackDraft(request)
      const compiledHtml = compileDeckDraftToHtml(draft)

      yield {
        type: 'assistant_done',
        text: '我先整理了改写方向，下面给出可编辑候选草稿。',
      }
      yield {
        type: 'status',
        phase: 'finalizing',
        label: shouldUseWebSearch(request) ? '正在生成搜索候选' : '正在生成候选',
      }
      yield {
        type: 'candidate_ready',
        candidateId: `candidate-${Date.now()}`,
        summary: '根据你的需求生成了一版本地候选草稿。',
        deckDraft: draft,
        compiledHtml,
        slideMeta: extractSlideMetaFromHtml(compiledHtml),
        sources: [],
        runMeta: {
          skillId: skill.id,
          model: `mock:${DEFAULT_MODEL}`,
          usedWebSearch: false,
          searchMode,
        },
      }
    },
  }
}

export function extractSlideMetaFromHtml(html: string): Array<{
  slideId: string
  title: string
  nodeCount: number
}> {
  const matches = html.matchAll(/<section\b[^>]*data-slide-id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)

  return Array.from(matches, ([, slideId, sectionHtml]) => {
    const titleMatch = sectionHtml.match(/data-node-id="[^"]*-title"[^>]*>([\s\S]*?)<\/[^>]+>/)
    const nodeCount = Array.from(sectionHtml.matchAll(/data-node-id="/g)).length

    return {
      slideId,
      title: decodeHtml(stripTags(titleMatch?.[1] ?? slideId)).trim() || slideId,
      nodeCount,
    }
  })
}

function createFallbackDraft(request: DeckAgentTurnRequest): DeckDraft {
  const fallbackTitle = (request.message || summarizeReplyValue(request)).trim().slice(0, 18) || '新的草稿'
  const currentText =
    request.generationMode === 'from-scratch' ? '' : extractLeadingText(request.currentDeckHtml)

  return {
    title: 'Local candidate deck',
    theme: {
      accent: '#d95d39',
      background: '#f6efe6',
      text: '#201715',
      muted: '#715f59',
    },
    slides: [
      {
        template: 'title-body',
        title: fallbackTitle,
        eyebrow: 'Local draft',
        body: [
          currentText || (request.generationMode === 'from-scratch'
            ? '已根据你的需求生成一版全新候选。'
            : '已基于当前 deck 生成一版可编辑候选。'),
          '确认后会导入编辑器并进入当前撤销历史。',
        ],
      },
    ],
  }
}

function resolveFrontendSlidesTargetSlideCount(request: DeckAgentTurnRequest): number {
  if (request.targetSlideCount) {
    return request.targetSlideCount
  }

  const explicitCount = extractRequestedSlideCount(request.message || summarizeReplyValue(request))
  if (explicitCount) {
    return explicitCount
  }

  if (request.htmlPpt?.slideCountHint) {
    return request.htmlPpt.slideCountHint
  }

  return 10
}

function extractRequestedSlideCount(text: string): number | null {
  const match = text.match(/(\d+)\s*(页|slides?)/i)
  if (!match) {
    return null
  }

  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : null
}

function countSlidesInHtml(html: string): number {
  const matches = Array.from(html.matchAll(/<section\b[^>]*class="[^"]*\bslide\b[^"]*"[^>]*>/g))
  return matches.length || 1
}

function createHtmlPptPreviewMeta(html: string, targetSlideCount: number, isPartialOverride?: boolean): {
  title: string
  slideCount: number
  generatedSlideCount: number
  targetSlideCount: number
  isPartial: boolean
} {
  const previewMeta = extractHtmlPreviewMeta(html)
  return {
    ...previewMeta,
    generatedSlideCount: previewMeta.slideCount,
    targetSlideCount,
    isPartial: isPartialOverride ?? previewMeta.slideCount < targetSlideCount,
  }
}

function createMockFrontendSlidesQuestions(): Array<{
  id: string
  header: string
  question: string
  options: Array<{ value: string; label: string; description: string; requiresFreeText?: boolean }>
  allowFreeText?: boolean
  freeTextLabel?: string
}> {
  return [
    {
      id: 'audience',
      header: 'Audience',
      question: 'Who is the primary audience for this deck?',
      options: [
        {
          value: 'engineers',
          label: 'Engineers',
          description: 'Technical audience that values structure, depth, and concrete systems.',
        },
        {
          value: 'executives',
          label: 'Executives',
          description: 'Decision-makers who need concise takeaways and business framing.',
        },
        {
          value: 'students',
          label: 'Students',
          description: 'Learners who benefit from guided structure and progressive explanation.',
        },
        {
          value: 'consumers',
          label: 'Consumers',
          description: 'Broader audience that responds to lighter storytelling and visuals.',
        },
        {
          value: 'general',
          label: 'General audience',
          description: 'A mixed room that needs clarity more than specialization.',
        },
      ],
    },
    {
      id: 'themeName',
      header: 'Theme',
      question: 'Which html-ppt theme should anchor the visual direction?',
      options: [
        {
          value: 'tokyo-night',
          label: 'tokyo-night',
          description: 'Default choice for technical sharing and engineering-heavy decks.',
        },
        {
          value: 'corporate-clean',
          label: 'corporate-clean',
          description: 'Formal business framing for reviews, reports, and leadership updates.',
        },
        {
          value: 'editorial-serif',
          label: 'editorial-serif',
          description: 'Editorial, calmer storytelling with strong reading rhythm.',
        },
        {
          value: 'xiaohongshu-white',
          label: 'xiaohongshu-white',
          description: 'Light creator-style theme suited for social and lifestyle content.',
        },
      ],
    },
    {
      id: 'fullDeckName',
      header: 'Template',
      question: 'Which full-deck template should be the starting point?',
      options: [
        {
          value: 'tech-sharing',
          label: 'tech-sharing',
          description: 'Structured engineering narrative with agenda, deep dives, and Q&A.',
        },
        {
          value: 'pitch-deck',
          label: 'pitch-deck',
          description: 'Business pitch arc for problem, solution, traction, and ask.',
        },
        {
          value: 'product-launch',
          label: 'product-launch',
          description: 'Launch-style reveal sequence with stronger presentation moments.',
        },
        {
          value: 'course-module',
          label: 'course-module',
          description: 'Teaching-oriented scaffold for explanation and guided exercises.',
        },
      ],
    },
    {
      id: 'format',
      header: 'Format',
      question: 'How will this deck be consumed?',
      options: [
        {
          value: 'live',
          label: 'Live presentation',
          description: 'Speaker notes and keyboard runtime should stay enabled.',
        },
        {
          value: 'pdf',
          label: 'PDF export',
          description: 'Prioritize printable structure while keeping the deck static-friendly.',
        },
        {
          value: 'xhs',
          label: '小红书图文',
          description: 'Optimize for social post reading and compact vertical storytelling.',
        },
        {
          value: 'standalone',
          label: 'Standalone HTML',
          description: 'Ship a self-contained deck for browser playback and handoff.',
        },
      ],
    },
  ]
}

function summarizeReplyValue(request: DeckAgentTurnRequest): string {
  return request.inputReply?.answers.map((answer) => answer.text ?? answer.value).join(' ') ?? ''
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ')
}

function decodeHtml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
}

function extractLeadingText(html: string): string {
  const text = stripTags(html).replace(/\s+/g, ' ').trim()
  return truncate(text, 120)
}
