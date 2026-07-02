import { randomUUID } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { query } from '@anthropic-ai/claude-agent-sdk'

import type { AgentTurnEvent, HtmlPptAsset, KnowledgeReference } from '../src/agent/protocol'
import type { DeckAgent, DeckAgentTurnRequest } from './createAiServer'
import { FileSystemArtifactStore, type ArtifactStore } from './artifactStore'
import {
  extractHtmlPreviewMeta,
  loadEmbeddedHtmlPptSkill,
} from './frontendSlides'
import { inlineEmbeddedHtmlPptAssets } from '../src/html-ppt/embeddedAssets'
import {
  auditHtmlPptLayout,
  normalizeHtmlPptLayoutContract,
} from './htmlPptLayoutAudit'
import { isContentReferenceAsset } from './referenceExtraction'
import type { SandboxManager } from './sandboxManager'
import { FileSystemUploadStore, type UploadedAssetRef, type UploadStore } from './uploadStore'
import type { WorkerRuntimeConfig } from './workerRuntimeConfig'
import { buildClaudeCodeEnv as buildBaseClaudeCodeEnv } from './agentAuthConfig'

const require = createRequire(import.meta.url)
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const EMBEDDED_HTML_PPT_SKILL_DIR = path.join(SERVER_DIR, 'embedded-skills', 'html-ppt')

const CLAUDE_CODE_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']
const DEFAULT_CLAUDE_MODEL = 'MiniMax-M2.7'
const PROMPT_REFERENCE_PREVIEW_LIMIT = 2000
const KNOWLEDGE_REFERENCE_PREVIEW_LIMIT = 2400
const HTML_WRITE_RETRY_LIMIT = 1
const HTML_VISUAL_REWRITE_LIMIT = 1
const HTML_AGENT_SYSTEM_PROMPT = [
  'You are a controlled HTML presentation generation worker running in an isolated per-request workspace.',
  'Only use the embedded html-ppt skill content supplied in the user prompt.',
  'Never invoke or simulate a Skill tool, never search for local/global skill directories, and never read skill files from user/global directories such as ~/.claude, ~/.codex, or ~/.agents.',
  'Use shell commands only inside the isolated request workspace.',
  'Do not ask interactive questions or wait for permissions.',
  'You must use Write, Edit, or Bash when asked to create or modify files.',
  'Do not claim that a file was created until you have read it back and verified it is non-empty.',
]
const WHITE_LIGHT_THEME_NAMES = [
  'minimal-white',
  'corporate-clean',
  'academic-paper',
  'engineering-whiteprint',
  'arctic-cool',
  'swiss-grid',
  'xiaohongshu-white',
  'japanese-minimal',
  'catppuccin-latte',
  'solarized-light',
]
const USER_EXPLICIT_LIGHT_STYLE_PATTERN = /白底|纯白|极简|简约白|浅色|淡色|留白|干净商务|清爽|clean\s+corporate|minimal|minimal-white|corporate-clean|academic-paper|engineering-whiteprint|arctic-cool|swiss-grid|xiaohongshu-white|light\s+background|white\s+background/i
const HTML_PPT_AUTO_STYLE_SELECTION_PROMPT = [
  'Auto style selection policy for short user prompts:',
  '- User-specified resources always take precedence. If the user explicitly names a theme, full-deck template, layout, animation, visual style, or any resource rule, strictly follow the user-specified resource choices and do not override them with automatic selection.',
  '- Only use automatic style/template/layout selection when the user has not specified those resource requirements.',
  '- If the user only says to generate a PPT from uploaded documents or gives a very short generic request, do not default to a plain white/minimal deck.',
  '- First infer the content genre, audience, and tone from both the user request and uploaded/reference text, then select a fitting theme, full-deck template, page layouts, and 1-2 restrained animations from the embedded html-ppt resources.',
  '- For generic prompts with uploaded content, treat style selection as part of your generation task: compare the document topic against the resource catalog in the embedded skill, choose the closest resources, then generate with those resources. Do not blindly reuse examples like tokyo-night + tech-sharing unless the content is truly an engineering/tech talk.',
  '- Sports events, World Cup/FIFA/football topics, festival campaigns, competitions, and celebration decks should look energetic and event-like: use saturated stadium/night gradients, grass green, trophy gold, FIFA blue, national/team accent colors, diagonal motion graphics, score-board or broadcast-card rhythm, and large editorial headlines. Do not use plain white corporate cards for these topics unless the user explicitly asks for a white/minimal style.',
  '- Legal code, law, regulation, policy interpretation, compliance, supervision, governance, ecological environment, government affairs, and institutional documents are formal policy/governance decks, not tech-sharing decks. Prefer a formal designed report system such as the blueprint theme with a non-white blue/red-blue government-report visual direction.',
  '- For formal internal reports, department duties, quality management, engineering, construction, bidding, technical governance, state-owned enterprise, Party/government, Xinjiang Bingtuan, design institute, or institute-level reporting, prefer a visibly designed blue/red-blue engineering or government-report visual system. Use blueprint as the theme direction, then choose a non-white scaffold or build blueprint-styled slides with layouts like cover, toc, three-column, kpi-grid, flow-diagram, process-steps, timeline, roadmap, comparison, table, and thanks.',
  '- Do not default formal report decks to knowledge-arch-blueprint: that full-deck is a cream/light knowledge-architecture style and can look like a mostly white deck. Use it only when the user asks for knowledge architecture, paper-like structure diagrams, or a cream editorial report.',
  '- Do not choose corporate-clean, engineering-whiteprint, arctic-cool, swiss-grid, xiaohongshu-white, minimal-white, or other white/light themes for formal report decks unless the user explicitly asks for white, minimal, paper-like, or light-background styling.',
  '- When choosing a full-deck template, use it as the structural starting scaffold: preserve/adapt its tpl-* class family, page rhythm, title system, footer/header pattern, cards, callouts, background texture, and layout vocabulary, then replace the content. Do not merely link a theme CSS file or write generic slides from scratch.',
  '- If a light theme is explicitly requested, still avoid empty document-like pages: add full-width header bands, background texture, accent blocks, section rhythm, and clear content zones.',
  '- Use minimal-white only when the user explicitly asks for pure minimalist white, academic text-first, or no visual background. Otherwise include a tasteful theme background, card surfaces, grids/lines, accent blocks, and section rhythm.',
  '- Many single-page layout examples in the catalog use minimal-white only as a neutral demonstration base. When reusing those layouts for a real deck, replace their minimal-white base with the selected topic-matched visual system unless the user explicitly requested a white/light deck.',
  '- If you choose layouts whose sample files reference minimal-white.css, treat only the layout structure as reusable. Do not inherit the sample white background, pale cards, or low-contrast token values.',
  '- Keep the deck professional: content must remain accurate to the uploaded document, but the visual system should be visibly designed rather than a plain document transcription.',
].join('\n')
const HTML_PPT_FINAL_STYLE_GUARD_PROMPT = [
  'Final visual direction guard:',
  '- The embedded skill catalog may contain white/light report examples, but for this request you must follow the user request and the auto style policy above as the final authority.',
  '- Unless the user explicitly asks for white, minimal, paper-like, clean corporate, or light-background styling, do not use a plain white/minimal visual system.',
  '- Do not let --bg, --surface, and most slide backgrounds all remain #ffffff or near-white. Use visible topic-matched backgrounds, full-bleed color blocks, gradient/texture layers, strong header bands, or dark/colored section panels across the deck.',
  '- The selected theme/full-deck must materially affect the generated HTML: keep or recreate its scaffold rhythm, background language, title system, card shapes, accent palette, and slide-to-slide variation. Do not only mention a theme name or add a few accent lines.',
  '- At least most slides should look designed at first glance, not like white document pages. No more than two consecutive slides may be mostly plain white/light unless explicitly requested by the user.',
  '- A deck is still considered visually weak if body, html, .deck, or most .slide rules use #ffffff, #f7f7f8, #f8fafc, #f5f5f5, #f2f2f4, white, or pale low-saturation gradients as the main background.',
  '- If you reuse a layout example that links minimal-white.css, remove that light sample skin in the final standalone HTML and replace it with the chosen topic-matched theme tokens and slide backgrounds.',
  '- Formal reports should use a visible blue/red-blue engineering, government, Party/state-owned-enterprise, or institute-report visual system with non-white bands/panels and structured content zones.',
  '- Sports, events, campaigns, and celebration topics should use energetic saturated palettes, scene backgrounds, motion diagonals, broadcast cards, and event-like typography instead of corporate white cards.',
  '- If you intentionally choose a light theme, compensate with full-width color areas, background texture, accent panels, image/shape layers, and clear hierarchy so the result is not visually monotonous.',
].join('\n')

type ClaudeCodeQueryOptions = {
  cwd?: string
  tools?: string[] | { type: 'preset'; preset: 'claude_code' }
  allowedTools?: string[]
  permissionMode?: string
  allowDangerouslySkipPermissions?: boolean
  persistSession?: boolean
  settingSources?: string[]
  maxTurns?: number
  model?: string
  env?: Record<string, string | undefined>
  pathToClaudeCodeExecutable?: string
  debug?: boolean
  stderr?: (data: string) => void
  abortController?: AbortController
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string; excludeDynamicSections?: boolean }
}

type ClaudeCodeMessage =
  | {
      type: 'assistant'
      message?: {
        content?: Array<{ type?: string; text?: string }>
      }
    }
  | {
      type: 'result'
      subtype: 'success'
      session_id?: string
      result?: string
    }
  | {
      type: 'result'
      subtype: string
      session_id?: string
      errors?: string[]
      result?: string
    }
  | {
      type: string
      [key: string]: unknown
    }

export type ClaudeCodeQueryFactory = (args: {
  prompt: string
  options: ClaudeCodeQueryOptions
}) => AsyncIterable<ClaudeCodeMessage>

type SandboxedClaudeCodeDeckAgentOptions = {
  runtimeConfig: WorkerRuntimeConfig
  sandboxManager: SandboxManager
  artifactStore: ArtifactStore
  uploadStore: UploadStore
  queryFactory?: ClaudeCodeQueryFactory
  fallbackAgent?: DeckAgent
}

export function createSandboxedClaudeCodeDeckAgent(options: SandboxedClaudeCodeDeckAgentOptions): DeckAgent {
  const queryFactory = options.queryFactory ?? ((args) => query(args) as AsyncIterable<ClaudeCodeMessage>)
  const fallbackAgent = options.fallbackAgent ?? createUnsupportedFallbackAgent()

  return {
    async *runTurn(request: DeckAgentTurnRequest): AsyncIterable<AgentTurnEvent> {
      if (request.skillId !== 'html_ppt') {
        yield* fallbackAgent.runTurn(request)
        return
      }

      const frontendSlides = request.htmlPpt
        ?? request.sessionSnapshot?.htmlPptState?.htmlPpt
      const uploadedAssets = toUploadedAssetRefs(request.sessionSnapshot?.htmlPptState?.uploadedAssets)
      const promptReferenceAssets = buildPromptReferenceAssets(request.sessionSnapshot?.htmlPptState?.uploadedAssets)
      const sessionOwner = request.sessionOwner ?? {
        tenantId: 'local-tenant',
        userId: 'local-user',
        sessionId: request.sessionId,
      }
      const jobId = randomUUID()

      yield {
        type: 'status',
        phase: 'queued',
        label: '正在准备隔离沙箱',
      }

      const sandbox = await options.sandboxManager.create({
        tenantId: sessionOwner.tenantId,
        userId: sessionOwner.userId,
        sessionId: sessionOwner.sessionId,
        jobId,
        currentDeckHtml: request.currentDeckHtml,
      })

      try {
        await options.uploadStore.materialize(uploadedAssets, sandbox.assetsDir)

        yield {
          type: 'status',
          phase: 'drafting',
          label: '正在调用 agent 生成 HTML',
        }

        const abortController = new AbortController()
        let timedOut = false
        let clientAborted = false
        const handleClientAbort = () => {
          clientAborted = true
          abortController.abort()
        }
        request.abortSignal?.addEventListener('abort', handleClientAbort, { once: true })
        if (request.abortSignal?.aborted) {
          handleClientAbort()
        }
        const timeout = setTimeout(() => {
          timedOut = true
          console.warn('[sandboxed-claude-code-agent] job timeout reached; aborting Claude Code process', {
            timeoutMs: options.runtimeConfig.jobLimits.timeoutMs,
            jobId,
            sandboxId: sandbox.sandboxId,
          })
          abortController.abort()
        }, options.runtimeConfig.jobLimits.timeoutMs)
        timeout.unref?.()

        let lastAssistantText = ''
        let resultSessionId: string | undefined

        let rawHtml = ''

        try {
          const basePrompt = await buildClaudeCodePrompt({
            request: {
              ...request,
              htmlPpt: frontendSlides,
            },
            currentDeckPath: sandbox.currentDeckPath,
            outputPath: sandbox.outputHtmlPath,
            referenceAssets: promptReferenceAssets,
          })

          for (let attemptIndex = 0; attemptIndex <= HTML_WRITE_RETRY_LIMIT; attemptIndex += 1) {
            if (clientAborted) {
              throw new Error('Agent turn aborted')
            }

            if (attemptIndex > 0) {
              yield {
                type: 'status',
                phase: 'drafting',
                label: '正在重试生成 HTML 文件',
              }
            }

            const prompt = attemptIndex === 0
              ? basePrompt
              : buildMissingHtmlRetryPrompt({
                  outputPath: sandbox.outputHtmlPath,
                  currentDeckPath: sandbox.currentDeckPath,
                  lastAssistantText,
                })
            const attempt = runClaudeCodeAttempt({
              prompt,
              queryFactory,
              cwd: sandbox.rootDir,
              abortController,
            })

            let attemptResult: { lastAssistantText: string; resultSessionId?: string } | undefined
            while (true) {
              const next = await attempt.next()
              if (next.done) {
                attemptResult = next.value
                break
              }
              yield next.value
            }

            if (attemptResult?.lastAssistantText) {
              lastAssistantText = attemptResult.lastAssistantText
            }
            if (attemptResult?.resultSessionId) {
              resultSessionId = attemptResult.resultSessionId
            }

            yield {
              type: 'status',
              phase: 'finalizing',
              label: '正在生成 HTML 候选',
            }

            rawHtml = await readGeneratedHtmlIfPresent(sandbox.outputHtmlPath)
            if (rawHtml) {
              break
            }

            const diagnostic = await describeSandboxOutput(sandbox.rootDir)
            console.warn('[sandboxed-claude-code-agent] completed without writing presentation.html', {
              attempt: attemptIndex + 1,
              sandboxId: sandbox.sandboxId,
              outputPath: sandbox.outputHtmlPath,
              lastAssistantText: lastAssistantText.slice(0, 1000),
              files: diagnostic,
            })

            if (attemptIndex === HTML_WRITE_RETRY_LIMIT) {
              throw new Error(
                [
                  'Agent completed without writing presentation.html after retry.',
                  `outputPath=${sandbox.outputHtmlPath}`,
                  `sandboxId=${sandbox.sandboxId}`,
                  `files=${diagnostic || 'none'}`,
                  lastAssistantText ? `lastAssistantText=${lastAssistantText.slice(0, 500)}` : null,
                ].filter(Boolean).join(' '),
              )
            }
          }

          for (let rewriteIndex = 0; rewriteIndex < HTML_VISUAL_REWRITE_LIMIT; rewriteIndex += 1) {
            const diagnosis = diagnoseHtmlVisualStrength(rawHtml, request)
            if (!diagnosis.needsRewrite) {
              break
            }

            yield {
              type: 'status',
              phase: 'drafting',
              label: '正在增强 HTML 候选的主题背景与视觉层次',
            }

            const rewriteAttempt = runClaudeCodeAttempt({
              prompt: buildWeakVisualRewritePrompt({
                outputPath: sandbox.outputHtmlPath,
                currentDeckPath: sandbox.currentDeckPath,
                generatedHtmlPath: sandbox.outputHtmlPath,
                diagnosis,
                request: {
                  ...request,
                  htmlPpt: frontendSlides,
                },
              }),
              queryFactory,
              cwd: sandbox.rootDir,
              abortController,
            })

            let rewriteResult: { lastAssistantText: string; resultSessionId?: string } | undefined
            while (true) {
              const next = await rewriteAttempt.next()
              if (next.done) {
                rewriteResult = next.value
                break
              }
              yield next.value
            }

            if (rewriteResult?.lastAssistantText) {
              lastAssistantText = rewriteResult.lastAssistantText
            }
            if (rewriteResult?.resultSessionId) {
              resultSessionId = rewriteResult.resultSessionId
            }

            const rewrittenHtml = await readGeneratedHtmlIfPresent(sandbox.outputHtmlPath)
            if (rewrittenHtml) {
              rawHtml = rewrittenHtml
            }
          }
        } catch (error) {
          if (clientAborted && isAbortErrorMessage(error)) {
            throw new Error('Agent turn aborted')
          }
          if (timedOut && isAbortErrorMessage(error)) {
            throw new Error(`Agent generation timed out after ${options.runtimeConfig.jobLimits.timeoutMs}ms`)
          }
          if (error instanceof Error) {
            const message = toUserFacingAgentCopy(error.message)
            if (message !== error.message) {
              throw new Error(message)
            }
          }
          throw error
        } finally {
          clearTimeout(timeout)
          request.abortSignal?.removeEventListener('abort', handleClientAbort)
        }

        const htmlWithImages = await inlineMaterializedImageAssets(rawHtml, sandbox.assetsDir)
        const inlinedHtml = await inlineEmbeddedHtmlPptAssets(htmlWithImages, loadEmbeddedHtmlPptAsset)
        const layoutWarnings = auditHtmlPptLayout(inlinedHtml)
        const html = normalizeHtmlPptLayoutContract(inlinedHtml)
        const previewMeta = extractHtmlPreviewMeta(html)
        const artifact = await options.artifactStore.save({
          tenantId: sessionOwner.tenantId,
          userId: sessionOwner.userId,
          sessionId: sessionOwner.sessionId,
          jobId,
          fileName: 'presentation.html',
          contentType: 'text/html; charset=utf-8',
          buffer: Buffer.from(html, 'utf8'),
        })

        yield {
          type: 'html_candidate_ready',
          candidateId: resultSessionId ?? jobId,
          summary: summarizeGeneratedCandidate(lastAssistantText, layoutWarnings.length),
          html,
          previewMeta: {
            ...previewMeta,
            generatedSlideCount: previewMeta.slideCount,
            targetSlideCount: previewMeta.slideCount,
            isPartial: false,
            layoutWarnings: layoutWarnings.length ? layoutWarnings : undefined,
          },
          sources: [],
          artifactRefs: {
            html: {
              artifactId: artifact.artifactId,
              fileName: artifact.fileName,
              contentType: artifact.contentType,
              sizeBytes: artifact.sizeBytes,
            },
          },
          runMeta: {
            skillId: 'html_ppt',
            model: `claude-code:${resolveClaudeCodeModel()}`,
            usedWebSearch: false,
            searchMode: 'off',
            isFallback: false,
            conversationId: resultSessionId,
            jobId,
            sandboxId: sandbox.sandboxId,
          },
        } as AgentTurnEvent
      } finally {
        await destroySandboxSafely(options.sandboxManager, sandbox)
      }
    },
  }
}

export function createConfiguredClaudeCodeDeckAgent(args: {
  runtimeConfig: WorkerRuntimeConfig
  sandboxManager: SandboxManager
  fallbackAgent?: DeckAgent
}): DeckAgent {
  return createSandboxedClaudeCodeDeckAgent({
    runtimeConfig: args.runtimeConfig,
    sandboxManager: args.sandboxManager,
    artifactStore: new FileSystemArtifactStore({
      rootDir: args.runtimeConfig.artifactRoot,
    }),
    uploadStore: new FileSystemUploadStore({
      rootDir: args.runtimeConfig.uploadRoot,
    }),
    fallbackAgent: args.fallbackAgent,
  })
}

async function buildClaudeCodePrompt(args: {
  request: DeckAgentTurnRequest
  currentDeckPath: string
  outputPath: string
  referenceAssets: Array<{
    assetId?: string
    fileName: string
    contentType?: string
    role: 'visual' | 'content' | 'reference'
    referenceText?: HtmlPptAsset['referenceText']
  }>
}): Promise<string> {
  const { skillMarkdown, stylePresetsMarkdown } = await loadEmbeddedHtmlPptSkill()

  return [
    'Use the embedded html-ppt skill instructions below as the authoritative generation contract.',
    'First load, read, and apply the embedded HTML PPT Skill section in this prompt before planning or writing content.',
    'Do not rely on a locally installed skill.',
    'Do not invoke the Skill tool or attempt to load any locally installed skill.',
    'Do not read skill files from user/global directories such as ~/.claude or ~/.agents.',
    'When the user mentions a theme, layout, animation, or full-deck template name, resolve it inside the embedded html-ppt references and templates. Do not treat resource names as standalone skill names.',
    'Examples such as course-module, tech-sharing, pitch-deck, xhs-post, tokyo-night, and editorial-serif are html-ppt resources, not separate skills.',
    'beautiful-html-templates resources are embedded under templates/beautiful-html-templates/<slug>/template.html.',
    'When using beautiful-html-templates, preserve the chosen template visual system but output editor-compatible section.slide pages.',
    'When using oh-my-ppt reference styles, recreate the visual direction inside the editor contract.',
    'Use the editor canvas contract: standard decks are fixed 16:9 at 1280x720.',
    'Set data-fs-canvas-width="1280" and data-fs-canvas-height="720" on <html> for standard live/pdf/standalone decks.',
    'Only use the 810x1080 portrait canvas when the presentation brief format is xhs.',
    'Keep audience-facing content inside a safe content budget of roughly 1120x600 pixels.',
    'Avoid scrollable slide content, overlong bullet lists, dense tables, and fixed 1920px/1080px layout values.',
    'Interact with the user in Chinese.',
    'All user-facing questions, status text, summaries, and assistant messages must be in Chinese.',
    'Do not ask the user for preferences before generating.',
    'If theme, template, layout, animation, audience, format, or slide count details are missing, choose reasonable defaults from the embedded html-ppt resources and continue.',
    HTML_PPT_AUTO_STYLE_SELECTION_PROMPT,
    'Never end the turn with a message asking the user to provide preferences, choose options, grant permissions, or confirm before you start.',
    'Do not print the final HTML in chat.',
    `Write the final standalone presentation HTML to: ${args.outputPath}`,
    'You must use Write, Edit, or Bash to write the final HTML file to the exact output path.',
    'After writing, read the output file back and verify it is not empty before ending the turn.',
    'Do not say the task is complete unless presentation.html exists at the exact output path and contains the complete standalone HTML.',
    args.request.generationMode === 'from-current'
      ? `Use this existing deck as source material: ${args.currentDeckPath}`
      : 'Start from scratch with a fresh deck.',
    args.request.htmlAgentOperation === 'extend_remaining'
      ? `Extend the presentation to ${args.request.targetSlideCount ?? 'the requested'} slides while preserving the established style.`
      : null,
    args.request.currentSlideCount
      ? `Current slide count: ${args.request.currentSlideCount}`
      : null,
    args.request.htmlPpt
      ? [
          `Presentation brief: ${JSON.stringify(args.request.htmlPpt)}`,
          !args.request.htmlPpt.themeName || !args.request.htmlPpt.fullDeckName
            ? 'The brief is only partially preselected. Missing themeName or fullDeckName means the user did not lock the complete visual system; you must still choose or build a topic-matched non-white theme + full-deck scaffold from the embedded catalog instead of inheriting sample layout skins.'
            : null,
          args.request.htmlPpt.themeName && !args.request.htmlPpt.fullDeckName
            ? `The brief intentionally anchors the visual theme to "${args.request.htmlPpt.themeName}" but leaves fullDeckName open. Choose or build a matching non-conflicting full-deck scaffold yourself; do not ignore the theme anchor.`
            : null,
        ].filter((value): value is string => Boolean(value)).join('\n')
      : 'Presentation brief: not preselected. You must choose theme, full-deck template, layouts, and animations from the embedded html-ppt resource catalog based on the user request and uploaded/reference text before writing the deck.',
    summarizeReferenceAssets(args.referenceAssets),
    summarizeKnowledgeReferences(args.request.knowledgeReferences),
    summarizeSelectedElement(args.request.selectedElement),
    summarizeMessageAssets(args.request.messageAssetIds, args.referenceAssets),
    `User request: ${args.request.message || summarizeInputReply(args.request.inputReply)}`,
    '### HTML PPT Skill',
    skillMarkdown,
    '### Style Presets Reference',
    stylePresetsMarkdown,
    HTML_PPT_FINAL_STYLE_GUARD_PROMPT,
  ].filter((value): value is string => Boolean(value)).join('\n\n')
}

function buildMissingHtmlRetryPrompt(args: {
  outputPath: string
  currentDeckPath: string
  lastAssistantText: string
}): string {
  return [
    'The previous agent run completed without writing presentation.html.',
    'This is a hard failure unless you write the file now.',
    `Write the complete standalone HTML to this exact path: ${args.outputPath}`,
    `If you need source context, read this existing deck first: ${args.currentDeckPath}`,
    'Do not ask follow-up questions; choose reasonable defaults for missing theme, template, layout, animation, audience, format, or slide count preferences.',
    'Use Write, Edit, or Bash to create or replace the file.',
    'After writing, read the file back and verify it is non-empty.',
    'Do not print the final HTML in chat.',
    args.lastAssistantText
      ? `Previous assistant message for context:\n${args.lastAssistantText.slice(0, 2000)}`
      : null,
  ].filter((value): value is string => Boolean(value)).join('\n\n')
}

function buildWeakVisualRewritePrompt(args: {
  outputPath: string
  currentDeckPath: string
  generatedHtmlPath: string
  diagnosis: HtmlVisualStrengthDiagnosis
  request: DeckAgentTurnRequest
}): string {
  return [
    'The generated presentation HTML exists, but its visual system is too close to a plain white/light fallback style.',
    'Rewrite the same presentation in place with a stronger topic-matched visual system.',
    `Read the current generated HTML first: ${args.generatedHtmlPath}`,
    `Then overwrite the complete standalone HTML at exactly: ${args.outputPath}`,
    `Use the existing deck only as source context if needed: ${args.currentDeckPath}`,
    `Visual diagnosis: ${args.diagnosis.reasons.join('; ')}`,
    'Keep the same topic, slide count, slide order, text meaning, editable HTML PPT structure, notes/runtime behavior, and data-fs-editable-deck contract.',
    'Do not change the requested content into a different deck. Only redesign the visual system.',
    'Unless the user explicitly requested white/minimal/light styling, remove plain white as the dominant deck background.',
    'The global design tokens must also be rewritten: --bg, --surface, and --surface-2 must not remain #ffffff, #f7f7f8, #f2f2f4, or other near-white values unless the user explicitly requested a light deck.',
    'Also rewrite direct background rules on html, body, .deck, .slide, and major wrapper/card selectors when they use white, near-white, pale gray, or low-saturation light gradients as the dominant background.',
    'Use topic-matched full-bleed backgrounds, strong header bands, colored panels, gradient or texture layers, visible section rhythm, and varied slide compositions.',
    'For formal reports, use a visible blue/red-blue engineering/government/institute-report direction with non-white bands and panels.',
    'For sports/events/campaigns, use saturated event-like colors, motion diagonals, scene backgrounds, and broadcast-card rhythm.',
    'Avoid these as dominant systems unless explicitly requested: minimal-white, corporate-clean, academic-paper, engineering-whiteprint, arctic-cool, swiss-grid, xiaohongshu-white.',
    HTML_PPT_FINAL_STYLE_GUARD_PROMPT,
    `User request: ${args.request.message || summarizeInputReply(args.request.inputReply)}`,
  ].filter((value): value is string => Boolean(value)).join('\n\n')
}

function summarizeSelectedElement(selectedElement: DeckAgentTurnRequest['selectedElement']): string {
  if (!selectedElement) {
    return ''
  }

  return [
    'Selected element context:',
    `- slideId: ${selectedElement.slideId}`,
    `- selector: ${selectedElement.selector}`,
    selectedElement.elementTag ? `- elementTag: ${selectedElement.elementTag}` : null,
    selectedElement.elementText ? `- elementText: ${selectedElement.elementText}` : null,
    '优先只修改该 selector 对应的元素或其最小必要上下文，避免整页重写。',
  ].filter((value): value is string => Boolean(value)).join('\n')
}

function summarizeMessageAssets(
  messageAssetIds: string[] | undefined,
  assets: Array<{
    fileName: string
    contentType?: string
    role: 'visual' | 'content' | 'reference'
    referenceText?: HtmlPptAsset['referenceText']
    assetId?: string
  }>,
): string {
  if (!messageAssetIds?.length) {
    return ''
  }

  const requested = assets.filter((asset) => asset.assetId && messageAssetIds.includes(asset.assetId))
  if (!requested.length) {
    return ''
  }

  return [
    '本次消息指定图片素材：',
    ...requested.map((asset) => `- assets/${asset.fileName} (${asset.contentType ?? 'application/octet-stream'})`),
    '如需使用图片，只引用上述 assets/<fileName> 相对路径。',
  ].join('\n')
}

function summarizeKnowledgeReferences(
  knowledgeReferences: KnowledgeReference[] | undefined,
): string {
  if (!knowledgeReferences?.length) {
    return ''
  }

  const lines = ['### 私有知识库参考']
  knowledgeReferences.forEach((item, index) => {
    const content = truncatePromptText(item.content || item.summary || '', KNOWLEDGE_REFERENCE_PREVIEW_LIMIT)
    lines.push(
      [
        `${index + 1}. 标题：${item.title}`,
        `来源：${item.sourceType === 'dataset' ? '系统知识库' : '文档知识库'}`,
        `路径：${item.categoryPath.join(' / ')}`,
        item.datasets?.length ? `datasets：${item.datasets.join(' | ')}` : null,
        item.aiId ? `aiId：${item.aiId}` : null,
        item.summary ? `摘要：${truncatePromptText(item.summary, 320)}` : null,
        content ? `内容：${content}` : null,
      ].filter((value): value is string => Boolean(value)).join('\n'),
    )
  })
  lines.push('生成时请优先参考以上私有知识库内容，但不要逐字照抄，需整理成适合演示文稿的表达。')
  return lines.join('\n\n')
}

function truncatePromptText(text: string, limit: number): string {
  const normalized = text.trim()
  if (!normalized) {
    return ''
  }
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...`
}

function extractAssistantText(message: ClaudeCodeMessage): string {
  if (message.type !== 'assistant') {
    return ''
  }

  return (message.message?.content ?? [])
    .map((block) => block.type === 'text' ? block.text?.trim() : '')
    .filter((value): value is string => Boolean(value))
    .join('\n')
}

function extractResultError(message: Extract<ClaudeCodeMessage, { type: 'result' }>): string {
  if (Array.isArray(message.errors) && message.errors.length) {
    return toUserFacingAgentCopy(message.errors.join('\n'))
  }

  if (typeof message.result === 'string' && message.result.trim()) {
    return toUserFacingAgentCopy(message.result.trim())
  }

  return `Agent turn failed: ${message.subtype}`
}

function isAbortErrorMessage(error: unknown): boolean {
  return error instanceof Error && /aborted/i.test(error.message)
}

function summarizeGeneratedCandidate(lastAssistantText: string, layoutWarningCount: number): string {
  const baseSummary = toHtmlCandidateSummary(lastAssistantText)
  if (!layoutWarningCount) {
    return baseSummary
  }

  return `${baseSummary} 检测到 ${layoutWarningCount} 个布局风险，可能有页面溢出。`
}

async function readGeneratedHtmlIfPresent(outputPath: string): Promise<string> {
  try {
    const html = await readFile(outputPath, 'utf8')
    return html.trim() ? html : ''
  } catch {
    return ''
  }
}

type HtmlVisualStrengthDiagnosis = {
  needsRewrite: boolean
  reasons: string[]
}

function diagnoseHtmlVisualStrength(html: string, request: DeckAgentTurnRequest): HtmlVisualStrengthDiagnosis {
  const reasons: string[] = []
  const userRequest = [
    request.message,
    summarizeInputReply(request.inputReply),
    request.htmlPpt?.themeName,
    request.htmlPpt?.fullDeckName,
  ].filter(Boolean).join('\n')

  if (USER_EXPLICIT_LIGHT_STYLE_PATTERN.test(userRequest)) {
    return {
      needsRewrite: false,
      reasons: ['User explicitly requested or selected a light/minimal visual direction.'],
    }
  }

  const lowerHtml = html.toLowerCase()
  const rootBlock = html.match(/:root\s*\{([\s\S]*?)\}/i)?.[1] ?? ''
  const rootBg = rootBlock.match(/--bg\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase() ?? ''
  const rootSurface = rootBlock.match(/--surface\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase() ?? ''
  const rootSurface2 = rootBlock.match(/--surface-2\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase() ?? ''
  const slideCount = Math.max(Array.from(html.matchAll(/<section\b[^>]*class=["'][^"']*\bslide\b/gi)).length, 1)
  const whiteHits = Array.from(html.matchAll(/#fff\b|#ffffff\b|white\b|rgba\(\s*255\s*,\s*255\s*,\s*255/gi)).length
  const gradientHits = Array.from(html.matchAll(/linear-gradient|radial-gradient|conic-gradient/gi)).length
  const darkColorHits = Array.from(html.matchAll(/#[0-2][0-9a-f][0-3][0-9a-f][0-4][0-9a-f]\b/gi)).length
  const lightThemeHits = WHITE_LIGHT_THEME_NAMES.filter((name) => lowerHtml.includes(name))
  const dominantLightBackgrounds = extractDominantLightBackgroundSelectors(html)
  const hasWhiteRootSystem = isWhiteLikeCssValue(rootBg)
    && isWhiteLikeCssValue(rootSurface)
    && (!rootSurface2 || isWhiteLikeCssValue(rootSurface2))
  const hasLightDominantBackground = dominantLightBackgrounds.length > 0

  if (isWhiteLikeCssValue(rootBg) && isWhiteLikeCssValue(rootSurface)) {
    reasons.push(`Root background and surface are white-like (${rootBg || 'missing'}, ${rootSurface || 'missing'}).`)
  }
  if (isWhiteLikeCssValue(rootBg) && isWhiteLikeCssValue(rootSurface2)) {
    reasons.push(`Root background and secondary surface are white-like (${rootBg || 'missing'}, ${rootSurface2 || 'missing'}).`)
  }
  if (lightThemeHits.length) {
    reasons.push(`Generated HTML references light/minimal theme names: ${lightThemeHits.join(', ')}.`)
  }
  if (dominantLightBackgrounds.length) {
    reasons.push(`Dominant HTML/slide backgrounds are light-like (${dominantLightBackgrounds.slice(0, 5).join(', ')}).`)
  }
  if (whiteHits >= Math.max(14, slideCount)) {
    reasons.push(`White/light tokens are dominant (${whiteHits} hits across ${slideCount} slides).`)
  }
  if (gradientHits < Math.max(3, Math.ceil(slideCount / 3)) && darkColorHits < Math.max(3, Math.ceil(slideCount / 3))) {
    reasons.push(`Visual contrast signals are weak (${gradientHits} gradients, ${darkColorHits} dark color tokens).`)
  }

  return {
    needsRewrite: hasWhiteRootSystem || hasLightDominantBackground || reasons.length >= 2,
    reasons,
  }
}

function extractDominantLightBackgroundSelectors(html: string): string[] {
  const selectors: string[] = []
  const styleBlocks = Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi), (match) => match[1])
  const cssVariables = extractCssVariables(styleBlocks.join('\n'))
  for (const css of styleBlocks) {
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].trim()
      const body = match[2]
      if (!isDominantLayoutSelector(selector)) {
        continue
      }
      const backgroundValue = resolveCssVariables(extractCssBackgroundValue(body), cssVariables)
      if (backgroundValue && isLightDominantBackgroundValue(backgroundValue)) {
        selectors.push(selector.replace(/\s+/g, ' '))
      }
    }
  }
  return Array.from(new Set(selectors))
}

function extractCssVariables(css: string): Map<string, string> {
  const variables = new Map<string, string>()
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/gi)) {
    variables.set(match[1].toLowerCase(), match[2].trim().toLowerCase())
  }
  return variables
}

function resolveCssVariables(value: string, variables: ReadonlyMap<string, string>, depth = 0): string {
  if (!value || depth > 4) {
    return value
  }
  return value.replace(/var\(\s*(--[\w-]+)(?:\s*,\s*([^)]+))?\)/gi, (_match, rawName: string, fallback?: string) => {
    const replacement = variables.get(rawName.toLowerCase()) || fallback || ''
    return resolveCssVariables(replacement.trim(), variables, depth + 1)
  })
}

function isDominantLayoutSelector(selector: string): boolean {
  return selector
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .some((part) => [
      'html',
      'body',
      'html body',
      '.deck',
      '.slides',
      '.presentation',
      '.slide',
      'section.slide',
      '.slide-wrapper',
      '.slide-inner',
      '.page',
      '.canvas',
      '.stage',
    ].includes(part) || /^\.slide(?:\b|[:.#\[])/.test(part) || /^section\.slide(?:\b|[:.#\[])/.test(part))
}

function extractCssBackgroundValue(ruleBody: string): string {
  const background = Array.from(ruleBody.matchAll(/background(?:-color)?\s*:\s*([^;]+);?/gi)).pop()
  return background?.[1]?.trim().toLowerCase() ?? ''
}

function isLightDominantBackgroundValue(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return false
  }
  if (isWhiteLikeCssValue(normalized)) {
    return true
  }
  const colors = extractCssColorTokens(normalized)
  if (!colors.length) {
    return false
  }
  const lightColors = colors.filter(isLightRgbColor)
  return lightColors.length === colors.length || (lightColors.length >= 2 && lightColors.length / colors.length >= 0.75)
}

function extractCssColorTokens(value: string): Array<{ red: number; green: number; blue: number }> {
  const colors: Array<{ red: number; green: number; blue: number }> = []

  for (const match of value.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)) {
    const hex = match[1].length === 3
      ? match[1].split('').map((char) => char + char).join('')
      : match[1]
    colors.push({
      red: Number.parseInt(hex.slice(0, 2), 16),
      green: Number.parseInt(hex.slice(2, 4), 16),
      blue: Number.parseInt(hex.slice(4, 6), 16),
    })
  }

  for (const match of value.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi)) {
    colors.push({
      red: Number(match[1]),
      green: Number(match[2]),
      blue: Number(match[3]),
    })
  }

  return colors
}

function isLightRgbColor(color: { red: number; green: number; blue: number }): boolean {
  const max = Math.max(color.red, color.green, color.blue)
  const min = Math.min(color.red, color.green, color.blue)
  const luminance = (0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue) / 255
  const saturationApprox = max === 0 ? 0 : (max - min) / max
  return luminance >= 0.86 || (luminance >= 0.78 && saturationApprox <= 0.18)
}

function isWhiteLikeCssValue(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  if (/#fff(?:fff)?\b|white\b|rgba\(\s*255\s*,\s*255\s*,\s*255/i.test(normalized)) return true

  const hex = normalized.match(/#([0-9a-f]{6})\b/i)?.[1]
  if (!hex) return false

  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  return red >= 238 && green >= 238 && blue >= 238
}

async function describeSandboxOutput(rootDir: string): Promise<string> {
  try {
    const rows = await listSandboxFiles(rootDir)
    return rows.length ? rows.join(', ') : ''
  } catch (error) {
    return `diagnostic_failed:${error instanceof Error ? error.message : String(error)}`
  }
}

async function listSandboxFiles(rootDir: string, relativeDir = '', rows: string[] = []): Promise<string[]> {
  if (rows.length >= 20) {
    return rows
  }

  const currentDir = path.join(rootDir, relativeDir)
  const entries = await readdir(currentDir, { withFileTypes: true })
  for (const entry of entries) {
    if (rows.length >= 20) {
      break
    }

    const relativePath = path.join(relativeDir, entry.name)
    const absolutePath = path.join(rootDir, relativePath)
    if (entry.isDirectory()) {
      await listSandboxFiles(rootDir, relativePath, rows)
      continue
    }

    const fileStat = await stat(absolutePath)
    rows.push(`${relativePath.replaceAll(path.sep, '/')}:${fileStat.size}B`)
  }

  return rows
}

async function inlineMaterializedImageAssets(html: string, assetsDir: string): Promise<string> {
  const assetReferences = Array.from(html.matchAll(/(src|href)=["'](?:\.\/)?assets\/([^"'?#]+)([^"']*)["']/gi))
  let nextHtml = html
  for (const match of assetReferences) {
    const [raw, attribute, fileName, suffix] = match
    const safeFileName = path.basename(fileName)
    if (safeFileName !== fileName) {
      continue
    }
    const mimeType = imageMimeTypeForFileName(safeFileName)
    if (!mimeType) {
      continue
    }
    try {
      const buffer = await readFile(path.join(assetsDir, safeFileName))
      const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`
      nextHtml = nextHtml.replaceAll(raw, `${attribute}="${dataUrl}${suffix}"`)
    } catch {
      // Keep the relative asset reference if the generated HTML points at a
      // file that was not materialized for this request.
    }
  }
  return nextHtml
}

function imageMimeTypeForFileName(fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.svg') return 'image/svg+xml'
  return null
}

function toUserFacingAgentCopy(text: string): string {
  return text.replace(/\bClaude[\s-]+Code\b/gi, 'agent')
}

function toHtmlCandidateSummary(text: string): string {
  return isInteractivePreferenceRequest(text) ? 'agent 已生成 HTML 候选。' : text || 'agent 已生成 HTML 候选。'
}

function isInteractivePreferenceRequest(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) {
    return false
  }

  return [
    /请.*告诉我.*偏好/,
    /告诉我.*就可以.*开始/,
    /请.*提供.*(主题|模板|页数|受众|风格|偏好)/,
    /需要.*(主题|模板|页数|受众|风格|偏好).*再.*(开始|制作|生成)/,
    /确认.*后.*(开始|制作|生成)/,
  ].some((pattern) => pattern.test(normalized))
}

async function loadEmbeddedHtmlPptAsset(assetPath: string): Promise<string | null> {
  try {
    return await readFile(path.join(EMBEDDED_HTML_PPT_SKILL_DIR, assetPath), 'utf8')
  } catch {
    return null
  }
}

async function* runClaudeCodeAttempt(args: {
  prompt: string
  queryFactory: ClaudeCodeQueryFactory
  cwd: string
  abortController: AbortController
}): AsyncGenerator<AgentTurnEvent, { lastAssistantText: string; resultSessionId?: string }, void> {
  let lastAssistantText = ''
  let resultSessionId: string | undefined

  const stream = args.queryFactory({
    prompt: args.prompt,
    options: {
      cwd: args.cwd,
      tools: CLAUDE_CODE_TOOLS,
      allowedTools: CLAUDE_CODE_TOOLS,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      persistSession: false,
      settingSources: [],
      maxTurns: 12,
      model: resolveClaudeCodeModel(),
      pathToClaudeCodeExecutable: resolveClaudeCodeExecutable(),
      debug: process.env.PPT_CLAUDE_CODE_DEBUG === '1',
      stderr: (data) => {
        const text = data.trim()
        if (text) {
          console.warn('[sandboxed-claude-code-agent] stderr', text)
        }
      },
      abortController: args.abortController,
      env: buildClaudeCodeEnv(),
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: HTML_AGENT_SYSTEM_PROMPT.join('\n'),
      },
    },
  })

  for await (const message of stream) {
    if (message.type === 'assistant') {
      const text = toUserFacingAgentCopy(extractAssistantText(message))
      if (text) {
        lastAssistantText = text
        if (isInteractivePreferenceRequest(text)) {
          continue
        }
        yield {
          type: 'assistant_done',
          text,
        }
      }
      continue
    }

    if (message.type === 'result') {
      resultSessionId = typeof message.session_id === 'string' ? message.session_id : undefined
      if (message.subtype !== 'success') {
        throw new Error(extractResultError(message))
      }
    }
  }

  return { lastAssistantText, resultSessionId }
}

function resolveClaudeCodeModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL
}

function buildClaudeCodeEnv(): Record<string, string | undefined> {
  return buildBaseClaudeCodeEnv()
}

function resolveClaudeCodeExecutable(): string | undefined {
  const configuredPath = process.env.PPT_CLAUDE_CODE_EXECUTABLE?.trim()
  if (configuredPath) {
    return configuredPath
  }

  const packageName = getPreferredClaudeCodeNativePackage()
  if (!packageName) {
    return undefined
  }

  try {
    return require.resolve(`${packageName}/${process.platform === 'win32' ? 'claude.exe' : 'claude'}`)
  } catch {
    return undefined
  }
}

function getPreferredClaudeCodeNativePackage(): string | undefined {
  const arch = process.arch
  if (arch !== 'x64' && arch !== 'arm64') {
    return undefined
  }

  if (process.platform === 'linux') {
    const libcSuffix = isGlibcRuntime() ? '' : '-musl'
    return `@anthropic-ai/claude-agent-sdk-linux-${arch}${libcSuffix}`
  }

  if (process.platform === 'darwin' || process.platform === 'win32') {
    return `@anthropic-ai/claude-agent-sdk-${process.platform}-${arch}`
  }

  return undefined
}

function isGlibcRuntime(): boolean {
  return Boolean(process.report?.getReport().header.glibcVersionRuntime)
}

function buildPromptReferenceAssets(assets: HtmlPptAsset[] | undefined): Array<{
  assetId?: string
  fileName: string
  contentType?: string
  role: 'visual' | 'content' | 'reference'
  referenceText?: HtmlPptAsset['referenceText']
  extractedAssets?: HtmlPptAsset['extractedAssets']
}> {
  return (assets ?? []).map((asset) => ({
    assetId: asset.assetId,
    fileName: asset.fileName,
    contentType: asset.contentType,
    role: getReferenceAssetRole(asset),
    referenceText: asset.referenceText,
    extractedAssets: asset.extractedAssets,
  }))
}

function toUploadedAssetRefs(assets: HtmlPptAsset[] | undefined): UploadedAssetRef[] {
  const refs: UploadedAssetRef[] = []

  for (const asset of (assets ?? [])) {
    if (!(asset.assetId && asset.path)) continue

    refs.push({
      uploadId: asset.assetId,
      tenantId: 'local-tenant',
      userId: 'local-user',
      sessionId: 'session-uploaded',
      fileName: asset.fileName,
      contentType: asset.contentType ?? 'application/octet-stream',
      sizeBytes: asset.sizeBytes ?? 0,
      relativePath: asset.path,
      absolutePath: asset.path,
      createdAt: Date.now(),
    })

    for (const ea of (asset.extractedAssets ?? [])) {
      refs.push({
        uploadId: asset.assetId,
        tenantId: 'local-tenant',
        userId: 'local-user',
        sessionId: 'session-uploaded',
        fileName: ea.fileName,
        contentType: ea.contentType,
        sizeBytes: ea.sizeBytes,
        relativePath: ea.path,
        absolutePath: ea.path,
        createdAt: Date.now(),
      })
    }
  }

  return refs
}

function summarizeReferenceAssets(
  assets: Array<{
    fileName: string
    contentType?: string
    role: 'visual' | 'content' | 'reference'
    referenceText?: HtmlPptAsset['referenceText']
    extractedAssets?: HtmlPptAsset['extractedAssets']
  }>,
): string {
  if (!assets.length) {
    return 'Reference assets: none supplied.'
  }

  return [
    'Reference assets are available in ./assets for this run.',
    'For uploaded .docx files, the original file has been pre-processed: full text is extracted to a companion .txt file, and embedded images are extracted as individual image files -- all placed alongside the original in ./assets.',
    'Always read the extracted .txt companion file for the complete document text instead of relying on the short preview below.',
    ...assets.map((asset) => {
      const purpose = asset.role === 'visual'
        ? 'visual reference'
        : asset.role === 'content'
          ? 'content reference'
          : 'reference file'
      const lines = [`- assets/${asset.fileName} (${asset.contentType ?? 'application/octet-stream'}) -> ${purpose}`]

      if (asset.referenceText?.status === 'extracted' && asset.referenceText.excerpt.trim()) {
        const preview = asset.referenceText.excerpt.slice(0, PROMPT_REFERENCE_PREVIEW_LIMIT)
        const truncatedNote = asset.referenceText.excerpt.length > PROMPT_REFERENCE_PREVIEW_LIMIT
          ? ` (前${PROMPT_REFERENCE_PREVIEW_LIMIT}字预览，共${asset.referenceText.charCount}字)`
          : ''
        lines.push(`  文字预览${truncatedNote}:`)
        lines.push(indentReferenceText(preview))
      } else if (asset.referenceText?.status && asset.referenceText.status !== 'extracted') {
        lines.push(`  Text extraction: ${asset.referenceText.status}${asset.referenceText.reason ? ` (${asset.referenceText.reason})` : ''}`)
      }

      if (asset.extractedAssets?.length) {
        const fullTextAssets = asset.extractedAssets.filter((ea) => ea.kind === 'full-text')
        const imageAssets = asset.extractedAssets.filter((ea) => ea.kind === 'image')

        for (const txt of fullTextAssets) {
          lines.push(`  提取的完整文本: assets/${txt.fileName} (${formatBytes(txt.sizeBytes)}) -- 请读取此文件获取完整文档内容，上面仅为简短预览`)
        }

        if (imageAssets.length > 0) {
          lines.push(`  提取的图片 (共${imageAssets.length}张)，可用于幻灯片中:`)
          for (const img of imageAssets) {
            lines.push(`    - assets/${img.fileName} (${img.contentType}, ${formatBytes(img.sizeBytes)})`)
          }
          lines.push('  在 HTML 中使用 src="assets/<filename>" 引用这些图片。')
        }
      }

      return lines.join('\n')
    }),
  ].join('\n')
}

function indentReferenceText(text: string): string {
  return text
    .split('\n')
    .map((line) => `  > ${line}`)
    .join('\n')
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function summarizeInputReply(inputReply: DeckAgentTurnRequest['inputReply']): string {
  if (!inputReply) {
    return ''
  }

  return inputReply.answers
    .map((answer) => answer.text?.trim() || answer.value.trim())
    .filter(Boolean)
    .join(' ')
}

function getReferenceAssetRole(asset: HtmlPptAsset): 'visual' | 'content' | 'reference' {
  const type = asset.contentType?.toLowerCase() ?? ''
  const fileName = asset.fileName.toLowerCase()
  const ext = path.extname(fileName)
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(fileName)) {
    return 'visual'
  }
  if (isContentReferenceAsset({ contentType: type, ext })) {
    return 'content'
  }
  return 'reference'
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
      console.warn('[sandboxed-claude-code-agent] sandbox cleanup deferred', {
        sandboxId: sandbox.sandboxId,
        rootDir: sandbox.rootDir,
        code,
      })
      return
    }

    throw error
  }
}

function createUnsupportedFallbackAgent(): DeckAgent {
  return {
    async *runTurn(): AsyncIterable<AgentTurnEvent> {
      throw new Error('Agent runtime only supports html-ppt generation in this deployment.')
    },
  }
}
