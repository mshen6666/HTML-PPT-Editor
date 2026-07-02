import { randomUUID } from 'node:crypto'
import { cp, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { query } from '@anthropic-ai/claude-agent-sdk'

import type { HtmlPptAsset, PptxExportEvent } from '../src/agent/protocol'
import { FileSystemArtifactStore, type ArtifactStore } from './artifactStore'
import type { PptxExportAgent, PptxExportAgentRequest } from './createAiServer'
import { isContentReferenceAsset } from './referenceExtraction'
import type { SandboxManager } from './sandboxManager'
import { FileSystemUploadStore, type UploadedAssetRef, type UploadStore } from './uploadStore'
import { createWorkerRuntimeConfig, type WorkerRuntimeConfig } from './workerRuntimeConfig'
import { FileSystemSandboxManager } from './sandboxManager'
import { buildClaudeCodeEnv as buildBaseClaudeCodeEnv } from './agentAuthConfig'

const require = createRequire(import.meta.url)
const serverDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(serverDir, '..')
const projectNodeModulesPath = path.join(projectRoot, 'node_modules')

const CLAUDE_CODE_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']
const DEFAULT_CLAUDE_MODEL = 'MiniMax-M2.7'
const PPTX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const PREINSTALLED_PPTX_EXPORT_TOOLS = [
  'node',
  'pptxgenjs',
  'jsdom',
  'jszip',
  'sharp',
  'react',
  'react-dom',
  'react-icons',
  'python3',
  'Pillow',
  'defusedxml',
  'lxml',
  'markitdown[pptx]',
  'LibreOffice/soffice',
  'Poppler/pdftoppm',
].join(', ')

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

export type PptxExportQueryFactory = (args: {
  prompt: string
  options: ClaudeCodeQueryOptions
}) => AsyncIterable<ClaudeCodeMessage>

type SandboxedClaudeCodePptxExportAgentOptions = {
  runtimeConfig: WorkerRuntimeConfig
  sandboxManager: SandboxManager
  artifactStore: ArtifactStore
  uploadStore: UploadStore
  queryFactory?: PptxExportQueryFactory
}

export function createSandboxedClaudeCodePptxExportAgent(
  options: SandboxedClaudeCodePptxExportAgentOptions,
): PptxExportAgent {
  const queryFactory = options.queryFactory ?? ((args) => query(args) as AsyncIterable<ClaudeCodeMessage>)

  return {
    async *runExport(request: PptxExportAgentRequest): AsyncIterable<PptxExportEvent> {
      const sessionOwner = request.sessionOwner
      const jobId = randomUUID()
      const uploadedAssets = toUploadedAssetRefs(request.sessionSnapshot?.htmlPptState?.uploadedAssets)
      const promptReferenceAssets = buildPromptReferenceAssets(request.sessionSnapshot?.htmlPptState?.uploadedAssets)

      yield {
        type: 'status',
        phase: 'queued',
        label: '正在准备 PPTX 导出沙箱',
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
          label: '正在调用 agent 生成可编辑 PPTX',
        }

        const pptxOutputPath = path.join(sandbox.rootDir, 'export.pptx')
        const summaryPath = path.join(sandbox.rootDir, 'export-summary.json')
        const embeddedSkillDir = await materializeEmbeddedPptxSkill(sandbox.rootDir)
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
          console.warn('[sandboxed-claude-code-pptx-export-agent] job timeout reached; aborting Claude Code process', {
            timeoutMs: options.runtimeConfig.jobLimits.timeoutMs,
            jobId,
            sandboxId: sandbox.sandboxId,
          })
          abortController.abort()
        }, options.runtimeConfig.jobLimits.timeoutMs)
        timeout.unref?.()

        let lastAssistantText = ''

        try {
          if (clientAborted) {
            throw new Error('PPTX export aborted')
          }

          const stream = queryFactory({
            prompt: await buildClaudeCodePptxPrompt({
              request,
              currentDeckPath: sandbox.currentDeckPath,
              pptxOutputPath,
              summaryPath,
              embeddedSkillDir,
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
              maxTurns: 100,
              model: resolveClaudeCodeModel(),
              pathToClaudeCodeExecutable: resolveClaudeCodeExecutable(),
              debug: process.env.PPT_CLAUDE_CODE_DEBUG === '1',
              stderr: (data) => {
                const text = data.trim()
                if (text) {
                  console.warn('[sandboxed-claude-code-pptx-export-agent] stderr', text)
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
              if (message.subtype !== 'success') {
                throw new Error(extractResultError(message))
              }
            }
          }
        } catch (error) {
          if (clientAborted && isAbortErrorMessage(error)) {
            throw new Error('PPTX export aborted')
          }
          if (timedOut && isAbortErrorMessage(error)) {
            throw new Error(`PPTX export timed out after ${options.runtimeConfig.jobLimits.timeoutMs}ms`)
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
          label: '正在保存 PPTX 导出文件',
        }

        const buffer = await readGeneratedPptx(pptxOutputPath)
        const artifact = await options.artifactStore.save({
          tenantId: sessionOwner.tenantId,
          userId: sessionOwner.userId,
          sessionId: sessionOwner.sessionId,
          jobId,
          fileName: 'export.pptx',
          contentType: PPTX_CONTENT_TYPE,
          buffer,
        })
        const summary = await readExportSummary(summaryPath) || lastAssistantText || '已生成可编辑 PPTX。'

        yield {
          type: 'pptx_export_ready',
          summary,
          artifactRef: {
            artifactId: artifact.artifactId,
            fileName: artifact.fileName,
            contentType: artifact.contentType,
            sizeBytes: artifact.sizeBytes,
          },
          downloadUrl: `/api/agent/sessions/${encodeURIComponent(sessionOwner.sessionId)}/artifacts/${encodeURIComponent(artifact.artifactId)}/download`,
        }
      } finally {
        await destroySandboxSafely(options.sandboxManager, sandbox)
      }
    },
  }
}

export function createConfiguredClaudeCodePptxExportAgent(): PptxExportAgent {
  const runtimeConfig = createWorkerRuntimeConfig()
  const sandboxManager = new FileSystemSandboxManager({
    rootDir: runtimeConfig.sandboxRoot,
    skillBundlePath: runtimeConfig.skillBundlePath,
  })

  return createSandboxedClaudeCodePptxExportAgent({
    runtimeConfig,
    sandboxManager,
    artifactStore: new FileSystemArtifactStore({
      rootDir: runtimeConfig.artifactRoot,
    }),
    uploadStore: new FileSystemUploadStore({
      rootDir: runtimeConfig.uploadRoot,
    }),
  })
}

async function buildClaudeCodePptxPrompt(args: {
  request: PptxExportAgentRequest
  currentDeckPath: string
  pptxOutputPath: string
  summaryPath: string
  embeddedSkillDir: string
  referenceAssets: Array<{
    assetId?: string
    fileName: string
    contentType?: string
    role: 'visual' | 'content' | 'reference'
    referenceText?: HtmlPptAsset['referenceText']
  }>
}): Promise<string> {
  const [skillMarkdown, contract] = await Promise.all([
    loadEmbeddedPptxSkillMarkdown(),
    loadEmbeddedPptxExportContract(),
  ])

  return [
    'Use the embedded PPTX skill directory and project export contract below as the authoritative conversion instructions.',
    'Do not rely on a locally installed skill.',
    'Do not invoke the Skill tool or attempt to load any locally installed skill.',
    'Do not read skill files from user/global directories such as ~/.claude or ~/.agents.',
    'Interact with the user in Chinese.',
    'All user-facing status text, summaries, and assistant messages must be in Chinese.',
    'Do not print the generated PPTX or large base64 blobs in chat.',
    'Do not install packages during this export job.',
    'Do not run npm install, npm add, pnpm install, yarn add, pip install, apt-get, apt, apk, brew, or curl-based installer commands.',
    'Use only the runtime packages and system tools already provided by the project/container.',
    'If a required runtime tool is missing, stop and report the missing tool clearly in Chinese instead of attempting installation.',
    `Preinstalled runtime tools available to you: ${PREINSTALLED_PPTX_EXPORT_TOOLS}.`,
    `Embedded PPTX skill directory: ${args.embeddedSkillDir}`,
    `Embedded PPTX skill entrypoint: ${path.join(args.embeddedSkillDir, 'SKILL.md')}`,
    'Read SKILL.md first, then read pptxgenjs.md because this export creates a deck from HTML.',
    'Use editing.md and scripts/ only if you need template-style OOXML inspection or validation.',
    `Read the current deck HTML from: ${args.currentDeckPath}`,
    `Write the final PPTX to: ${args.pptxOutputPath}`,
    `Write the export summary JSON to: ${args.summaryPath}`,
    `Document id: ${args.request.documentId}`,
    `Current deck hash: ${args.request.currentDeckHash}`,
    summarizeReferenceAssets(args.referenceAssets),
    'Use pptxgenjs from the project dependencies. Prefer an editable-first conversion using native text, shapes, images, tables, and charts before any raster fallback.',
    'This is an HTML-to-PPTX export, so keep the current HTML deck as source of truth and follow the project contract for animation and raster fallback decisions.',
    '### PPTX Skill Entry Summary',
    skillMarkdown,
    '### Embedded Contract',
    contract,
  ].filter(Boolean).join('\n\n')
}

async function materializeEmbeddedPptxSkill(sandboxRootDir: string): Promise<string> {
  const sourceDir = path.join(serverDir, 'embedded-skills', 'pptx-export')
  const targetDir = path.join(sandboxRootDir, 'skills', 'pptx')
  await cp(sourceDir, targetDir, {
    recursive: true,
    force: true,
  })
  return targetDir
}

async function loadEmbeddedPptxSkillMarkdown(): Promise<string> {
  return readFile(path.join(serverDir, 'embedded-skills', 'pptx-export', 'SKILL.md'), 'utf8')
}

async function loadEmbeddedPptxExportContract(): Promise<string> {
  return readFile(path.join(serverDir, 'embedded-skills', 'pptx-export', 'EXPORT_CONTRACT.md'), 'utf8')
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

  return `PPTX export failed: ${message.subtype}`
}

function isAbortErrorMessage(error: unknown): boolean {
  return error instanceof Error && /aborted/i.test(error.message)
}

async function readGeneratedPptx(outputPath: string): Promise<Buffer> {
  const buffer = await readFile(outputPath)
  if (buffer.byteLength === 0) {
    throw new Error('Agent completed without writing export.pptx')
  }
  return buffer
}

async function readExportSummary(summaryPath: string): Promise<string> {
  try {
    const raw = await readFile(summaryPath, 'utf8')
    const parsed = JSON.parse(raw) as { summary?: unknown }
    return typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : ''
  } catch {
    return ''
  }
}

function toUserFacingAgentCopy(text: string): string {
  return text.replace(/\bClaude[\s-]+Code\b/gi, 'agent')
}

function resolveClaudeCodeModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL
}

function buildClaudeCodeEnv(): Record<string, string | undefined> {
  const env = buildBaseClaudeCodeEnv()
  env.NODE_PATH = appendPathList(env.NODE_PATH, projectNodeModulesPath)
  env.PPTX_EXPORT_PREINSTALLED_TOOLS = PREINSTALLED_PPTX_EXPORT_TOOLS

  return env
}

function appendPathList(currentValue: string | undefined, value: string): string {
  const currentEntries = (currentValue ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (currentEntries.includes(value)) {
    return currentEntries.join(path.delimiter)
  }

  return [...currentEntries, value].join(path.delimiter)
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
}> {
  return (assets ?? []).map((asset) => ({
    assetId: asset.assetId,
    fileName: asset.fileName,
    contentType: asset.contentType,
    role: getReferenceAssetRole(asset),
    referenceText: asset.referenceText,
  }))
}

function toUploadedAssetRefs(assets: HtmlPptAsset[] | undefined): UploadedAssetRef[] {
  return (assets ?? [])
    .filter((asset): asset is HtmlPptAsset & { assetId: string; path: string } => Boolean(asset.assetId && asset.path))
    .map((asset) => ({
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
    }))
}

function summarizeReferenceAssets(
  assets: Array<{
    fileName: string
    contentType?: string
    role: 'visual' | 'content' | 'reference'
    referenceText?: HtmlPptAsset['referenceText']
  }>,
): string {
  if (!assets.length) {
    return 'Reference assets: none supplied.'
  }

  return [
    'Reference assets are available in ./assets for this export.',
    ...assets.map((asset) => {
      const purpose = asset.role === 'visual'
        ? 'visual reference'
        : asset.role === 'content'
          ? 'content reference'
          : 'reference file'
      const lines = [`- assets/${asset.fileName} (${asset.contentType ?? 'application/octet-stream'}) -> ${purpose}`]
      if (asset.referenceText?.status === 'extracted' && asset.referenceText.excerpt.trim()) {
        lines.push(`  Extracted reference text (${asset.referenceText.charCount} chars${asset.referenceText.truncated ? ', truncated' : ''}):`)
        lines.push(indentReferenceText(asset.referenceText.excerpt))
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
      console.warn('[sandboxed-claude-code-pptx-export-agent] sandbox cleanup deferred', {
        sandboxId: sandbox.sandboxId,
        rootDir: sandbox.rootDir,
        code,
      })
      return
    }

    throw error
  }
}
