import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

import { query } from '@anthropic-ai/claude-agent-sdk'

import type { AgentTurnEvent, HtmlPptAsset } from '../src/agent/protocol'
import type { DeckAgent, DeckAgentTurnRequest } from './createAiServer'
import { FileSystemArtifactStore, type ArtifactStore } from './artifactStore'
import {
  extractHtmlPreviewMeta,
  loadEmbeddedHtmlPptSkill,
} from './frontendSlides'
import { isContentReferenceAsset } from './referenceExtraction'
import type { SandboxManager } from './sandboxManager'
import { FileSystemUploadStore, type UploadedAssetRef, type UploadStore } from './uploadStore'
import type { WorkerRuntimeConfig } from './workerRuntimeConfig'

const require = createRequire(import.meta.url)

const CLAUDE_CODE_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']
const DEFAULT_CLAUDE_MODEL = 'MiniMax-M2.7'
const PROMPT_REFERENCE_PREVIEW_LIMIT = 2000

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

        try {
          if (clientAborted) {
            throw new Error('Agent turn aborted')
          }

          const stream = queryFactory({
            prompt: await buildClaudeCodePrompt({
              request: {
                ...request,
                htmlPpt: frontendSlides,
              },
              currentDeckPath: sandbox.currentDeckPath,
              outputPath: sandbox.outputHtmlPath,
              referenceAssets: promptReferenceAssets,
            }),
            options: {
              cwd: sandbox.rootDir,
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
              abortController,
              env: buildClaudeCodeEnv(),
              systemPrompt: {
                type: 'preset',
                preset: 'claude_code',
                append: [
                  'You are running in an isolated per-request workspace.',
                  'Do not ask interactive questions or wait for permissions.',
                  'Use shell commands only inside the isolated request workspace.',
                ].join('\n'),
              },
            },
          })

          for await (const message of stream) {
            if (message.type === 'assistant') {
              const text = toUserFacingAgentCopy(extractAssistantText(message))
              if (text) {
                lastAssistantText = text
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

        yield {
          type: 'status',
          phase: 'finalizing',
          label: '正在生成 HTML 候选',
        }

        const rawHtml = await readGeneratedHtml(sandbox.outputHtmlPath)
        const html = await inlineMaterializedImageAssets(rawHtml, sandbox.assetsDir)
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
          summary: lastAssistantText || 'agent 已生成 HTML 候选。',
          html,
          previewMeta: {
            ...previewMeta,
            generatedSlideCount: previewMeta.slideCount,
            targetSlideCount: previewMeta.slideCount,
            isPartial: false,
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
    'Interact with the user in Chinese.',
    'All user-facing questions, status text, summaries, and assistant messages must be in Chinese.',
    'Do not print the final HTML in chat.',
    `Write the final standalone presentation HTML to: ${args.outputPath}`,
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
      ? `Presentation brief: ${JSON.stringify(args.request.htmlPpt)}`
      : null,
    summarizeReferenceAssets(args.referenceAssets),
    summarizeSelectedElement(args.request.selectedElement),
    summarizeMessageAssets(args.request.messageAssetIds, args.referenceAssets),
    `User request: ${args.request.message || summarizeInputReply(args.request.inputReply)}`,
    '### HTML PPT Skill',
    skillMarkdown,
    '### Style Presets Reference',
    stylePresetsMarkdown,
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

async function readGeneratedHtml(outputPath: string): Promise<string> {
  const html = await readFile(outputPath, 'utf8')
  if (!html.trim()) {
    throw new Error('Agent completed without writing presentation.html')
  }
  return html
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

function resolveClaudeCodeModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL
}

function buildClaudeCodeEnv(): Record<string, string | undefined> {
  const env = {
    ...process.env,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:
      process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ?? '1',
  }

  // Claude Code native CLI reads ANTHROPIC_API_KEY in more environments than
  // ANTHROPIC_AUTH_TOKEN. Keep both populated for Anthropic-compatible gateways.
  if (!env.ANTHROPIC_API_KEY && env.ANTHROPIC_AUTH_TOKEN) {
    env.ANTHROPIC_API_KEY = env.ANTHROPIC_AUTH_TOKEN
  }

  return env
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
