import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import express from 'express'

import {
  agentTurnEventSchema,
  aiTurnRequestSchema,
  optimizePromptRequestSchema,
  pptxExportEventSchema,
  pptxExportRequestSchema,
  type AgentSessionSnapshot,
  type AgentTurnEvent,
  type AiTurnRequest,
  type HtmlPptState,
  type PptxExportEvent,
  type PptxExportRequest,
} from '../src/agent/protocol'
import { extractReferenceText, extractDocxFullText, extractDocxImages } from './referenceExtraction'
import type { ExtractedAsset } from '../src/agent/protocol'
import { createSessionStore, type SessionStore } from './sessionStore'
import { createHtmlPptStylePreviews } from './frontendSlides'
import { optimizePrompt } from './promptOptimizer'
import { listAgentSkills } from './skillRegistry'
import { createSessionOwner, type SessionOwner } from './sessionIdentity'
import { FileSystemUploadStore, type UploadStore } from './uploadStore'
import { createWorkerRuntimeConfig, type WorkerRuntimeConfig } from './workerRuntimeConfig'
import { FileSystemArtifactStore, type ArtifactStore } from './artifactStore'
import type { InviteGate } from './inviteGate'
import { loadBeautifulTemplatePreviewMap } from './beautifulHtmlTemplates'

export type DeckAgentTurnRequest = AiTurnRequest & {
  conversationId: string | null
  sessionSnapshot: AgentSessionSnapshot | null
  sessionOwner?: SessionOwner
  abortSignal?: AbortSignal
}

export interface DeckAgent {
  runTurn(request: DeckAgentTurnRequest): AsyncIterable<AgentTurnEvent>
}

export type PptxExportAgentRequest = PptxExportRequest & {
  sessionSnapshot: AgentSessionSnapshot | null
  sessionOwner: SessionOwner
  abortSignal?: AbortSignal
}

export interface PptxExportAgent {
  runExport(request: PptxExportAgentRequest): AsyncIterable<PptxExportEvent>
}

type CreateAiServerOptions = {
  agent: DeckAgent
  pptxExportAgent?: PptxExportAgent
  store?: SessionStore
  artifactStore?: ArtifactStore
  uploadStore?: UploadStore
  runtimeConfig?: WorkerRuntimeConfig
  inviteGate?: InviteGate
}

export function createAiServer(options: CreateAiServerOptions) {
  const app = express()
  const store = options.store ?? createSessionStore()
  const runtimeConfig = options.runtimeConfig ?? createWorkerRuntimeConfig()
  const uploadStore = options.uploadStore ?? new FileSystemUploadStore({
    rootDir: runtimeConfig.uploadRoot,
  })
  const artifactStore = options.artifactStore ?? new FileSystemArtifactStore({
    rootDir: runtimeConfig.artifactRoot,
  })
  const server = createServer(app)

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: false }))

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
    })
  })

  if (options.inviteGate) {
    app.post('/api/invite/session', options.inviteGate.handleInviteSession)
    app.use('/api', options.inviteGate.requireApiAuth)
  }

  app.get('/api/agent/skills', (_request, response) => {
    response.json({
      skills: listAgentSkills(),
    })
  })

  app.post('/api/agent/html-ppt/style-previews', (request, response) => {
    const body = request.body as {
      message?: string
      htmlPpt?: AiTurnRequest['htmlPpt']
    }

    response.json({
      previews: createHtmlPptStylePreviews(body.message ?? '', body.htmlPpt),
    })
  })

  app.get('/api/agent/html-ppt/css/all-themes', async (_request, response) => {
    const serverDir = path.dirname(fileURLToPath(import.meta.url))
    const skillDir = path.join(serverDir, 'embedded-skills', 'html-ppt')
    const themesDir = path.join(skillDir, 'assets', 'themes')

    try {
      const [baseCSS, fontsCSS, themeFiles] = await Promise.all([
        fs.readFile(path.join(skillDir, 'assets', 'base.css'), 'utf-8'),
        fs.readFile(path.join(skillDir, 'assets', 'fonts.css'), 'utf-8'),
        fs.readdir(themesDir),
      ])

      const cssMap: Record<string, { base: string; fonts: string; theme: string }> = {}

      await Promise.all(
        themeFiles
          .filter((f) => f.endsWith('.css'))
          .map(async (file) => {
            const themeName = file.replace(/\.css$/, '')
            const themeCSS = await fs.readFile(path.join(themesDir, file), 'utf-8')
            cssMap[themeName] = { base: baseCSS, fonts: fontsCSS, theme: themeCSS }
          }),
      )

      response.json({ cssMap })
    } catch (error) {
      response.status(500).json({
        error: 'failed_to_load_theme_css',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  app.get('/api/agent/html-ppt/template-previews', async (_request, response) => {
    const serverDir = path.dirname(fileURLToPath(import.meta.url))
    const skillDir = path.join(serverDir, 'embedded-skills', 'html-ppt')
    const templatesDir = path.join(skillDir, 'templates', 'full-decks')
    const beautifulTemplatesDir = path.join(skillDir, 'templates', 'beautiful-html-templates')

    try {
      const [baseCSS, fontsCSS, templateDirs, beautifulPreviewMap] = await Promise.all([
        fs.readFile(path.join(skillDir, 'assets', 'base.css'), 'utf-8'),
        fs.readFile(path.join(skillDir, 'assets', 'fonts.css'), 'utf-8'),
        fs.readdir(templatesDir),
        loadBeautifulTemplatePreviewMap(beautifulTemplatesDir).catch(() => ({})),
      ])

      const previewMap: Record<string, string> = { ...beautifulPreviewMap }

      await Promise.all(
        templateDirs.map(async (dir) => {
          const indexPath = path.join(templatesDir, dir, 'index.html')
          const stylePath = path.join(templatesDir, dir, 'style.css')

          try {
            const [html, styleCSS] = await Promise.all([
              fs.readFile(indexPath, 'utf-8'),
              fs.readFile(stylePath, 'utf-8').catch(() => ''),
            ])

            const bodyClassMatch = html.match(/<body\s+class="([^"]*)"/)
            const bodyClass = bodyClassMatch ? bodyClassMatch[1] : ''

            const firstSlideMatch = html.match(/<section\s+class="slide[^"]*"[^>]*>[\s\S]*?<\/section>/)
            const firstSlide = firstSlideMatch ? firstSlideMatch[0] : ''

            if (!firstSlide) return

            const previewHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${dir} Preview</title>
<style>${fontsCSS}</style>
<style>${baseCSS}</style>
<style>${styleCSS}</style>
<style>
body.single .slide{padding:clamp(24px,5vw,72px) clamp(32px,6vw,96px)}
.deck-header,.deck-footer,.progress-bar{display:none!important}
</style>
</head>
<body class="single ${bodyClass}">
<div class="deck">
${firstSlide}
</div>
</body>
</html>`

            previewMap[dir] = previewHtml
          } catch {
            // skip templates that fail to load
          }
        }),
      )

      response.json({ previewMap })
    } catch (error) {
      response.status(500).json({
        error: 'failed_to_load_template_previews',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  app.get('/api/agent/html-ppt/layout-previews', async (_request, response) => {
    const serverDir = path.dirname(fileURLToPath(import.meta.url))
    const skillDir = path.join(serverDir, 'embedded-skills', 'html-ppt')
    const layoutsDir = path.join(skillDir, 'templates', 'single-page')

    try {
      const [baseCSS, fontsCSS, animationsCSS, files] = await Promise.all([
        fs.readFile(path.join(skillDir, 'assets', 'base.css'), 'utf-8'),
        fs.readFile(path.join(skillDir, 'assets', 'fonts.css'), 'utf-8'),
        fs.readFile(path.join(skillDir, 'assets', 'animations', 'animations.css'), 'utf-8'),
        fs.readdir(layoutsDir),
      ])

      const previewMap: Record<string, string> = {}

      await Promise.all(
        files
          .filter((f) => f.endsWith('.html'))
          .map(async (file) => {
            const name = file.replace(/\.html$/, '')
            try {
              const html = await fs.readFile(path.join(layoutsDir, file), 'utf-8')
              const themeMatch = html.match(/id="theme-link"\s+href="[^"]*\/([^/]+)\.css"/)
              const themeName = themeMatch ? themeMatch[1] : 'minimal-white'
              let themeCSS = ''
              try {
                themeCSS = await fs.readFile(path.join(skillDir, 'assets', 'themes', `${themeName}.css`), 'utf-8')
              } catch { /* fallback: no theme */ }

              const slideMatch = html.match(/<section\s+class="slide[^"]*"[^>]*>[\s\S]*?<\/section>/)
              const slide = slideMatch ? slideMatch[0] : ''
              if (!slide) return

              const previewHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name} Layout Preview</title>
<style>${fontsCSS}</style>
<style>${baseCSS}</style>
<style>${themeCSS}</style>
<style>${animationsCSS}</style>
<style>
body.single .slide{padding:clamp(24px,5vw,72px) clamp(32px,6vw,96px)}
.deck-header,.deck-footer,.progress-bar,.notes{display:none!important}
</style>
</head>
<body class="single">
<div class="deck">
${slide}
</div>
</body>
</html>`

              previewMap[name] = previewHtml
            } catch {
              // skip
            }
          }),
      )

      response.json({ previewMap })
    } catch (error) {
      response.status(500).json({
        error: 'failed_to_load_layout_previews',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  app.get('/api/agent/html-ppt/animation-previews', async (_request, response) => {
    const serverDir = path.dirname(fileURLToPath(import.meta.url))
    const skillDir = path.join(serverDir, 'embedded-skills', 'html-ppt')

    try {
      const [baseCSS, fontsCSS, animationsCSS] = await Promise.all([
        fs.readFile(path.join(skillDir, 'assets', 'base.css'), 'utf-8'),
        fs.readFile(path.join(skillDir, 'assets', 'fonts.css'), 'utf-8'),
        fs.readFile(path.join(skillDir, 'assets', 'animations', 'animations.css'), 'utf-8'),
      ])

      response.json({ baseCSS, fontsCSS, animationsCSS })
    } catch (error) {
      response.status(500).json({
        error: 'failed_to_load_animation_css',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  app.post('/api/agent/html-ppt/assets/scan', (_request, response) => {
    response.status(410).json({
      error: 'host_path_scanning_disabled',
    })
  })

  app.post('/api/agent/pptx-export', async (request, response) => {
    const parsed = pptxExportRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        error: 'invalid_request',
      })
      return
    }

    if (!options.pptxExportAgent) {
      response.status(501).json({
        error: 'pptx_export_unavailable',
      })
      return
    }

    const body = parsed.data
    const owner = createSessionOwner(request, body.sessionId)
    const session = await store.get(owner)
    const abortController = new AbortController()
    const abortTurn = () => {
      if (!abortController.signal.aborted) {
        abortController.abort()
      }
    }
    request.on('aborted', abortTurn)
    response.on('close', () => {
      if (!response.writableEnded) {
        abortTurn()
      }
    })

    response.status(200)
    response.setHeader('content-type', 'application/x-ndjson; charset=utf-8')
    response.setHeader('cache-control', 'no-store')

    let encounteredError = false
    try {
      for await (const event of options.pptxExportAgent.runExport({
        ...body,
        sessionSnapshot: session?.snapshot ?? null,
        sessionOwner: owner,
        abortSignal: abortController.signal,
      })) {
        if (abortController.signal.aborted) {
          break
        }
        writePptxExportEvent(response, event)
      }
    } catch (error) {
      encounteredError = true
      if (!abortController.signal.aborted) {
        writePptxExportEvent(response, {
          type: 'error',
          message: error instanceof Error ? error.message : 'PPTX export failed',
        })
      }
    }

    if (!encounteredError && !abortController.signal.aborted) {
      writePptxExportEvent(response, {
        type: 'done',
      })
      response.end()
    }
  })

  app.get('/api/agent/sessions/:sessionId/artifacts/:artifactId/download', async (request, response) => {
    const findById = artifactStore.findById?.bind(artifactStore)
    const readBuffer = artifactStore.readBuffer?.bind(artifactStore)
    if (!findById || !readBuffer) {
      response.status(404).json({
        error: 'artifact_not_found',
      })
      return
    }

    const owner = createSessionOwner(request, request.params.sessionId)
    const artifact = await findById({
      tenantId: owner.tenantId,
      userId: owner.userId,
      sessionId: owner.sessionId,
      artifactId: request.params.artifactId,
    })
    if (!artifact) {
      response.status(404).json({
        error: 'artifact_not_found',
      })
      return
    }

    const buffer = await readBuffer(artifact)
    response.setHeader('content-type', artifact.contentType)
    response.setHeader('content-length', String(buffer.byteLength))
    response.setHeader('content-disposition', `attachment; filename="${encodeURIComponent(artifact.fileName)}"`)
    response.send(buffer)
  })

  app.post('/api/ai/turns', async (request, response) => {
    const parsed = aiTurnRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        error: 'invalid_request',
      })
      return
    }

    const body = parsed.data
    const owner = createSessionOwner(request, body.sessionId)
    const session = await store.get(owner)
    const conversationId = session?.conversationId ?? null
    const sessionSnapshot = session?.snapshot ?? null
    const abortController = new AbortController()
    const abortTurn = () => {
      if (!abortController.signal.aborted) {
        abortController.abort()
      }
    }
    request.on('aborted', abortTurn)
    response.on('close', () => {
      if (!response.writableEnded) {
        abortTurn()
      }
    })

    response.status(200)
    response.setHeader('content-type', 'application/x-ndjson; charset=utf-8')
    response.setHeader('cache-control', 'no-store')

    let encounteredError = false
    let nextConversationId = conversationId
    let lastAssistantText: string | undefined
    let pendingInput: Extract<AgentTurnEvent, { type: 'input_required' }> | undefined
    let lastCandidate:
      | Extract<AgentTurnEvent, { type: 'candidate_ready' }>
      | Extract<AgentTurnEvent, { type: 'html_candidate_ready' }>
      | undefined

    try {
      for await (const event of options.agent.runTurn({
        ...body,
        conversationId,
        sessionSnapshot,
        sessionOwner: owner,
        abortSignal: abortController.signal,
      })) {
        if (abortController.signal.aborted) {
          break
        }
        if (event.type === 'assistant_done') {
          lastAssistantText = event.text
        }
        if (event.type === 'input_required') {
          nextConversationId = event.responseId
          pendingInput = event
          lastCandidate = undefined
        }
        if (event.type === 'candidate_ready' || event.type === 'html_candidate_ready') {
          nextConversationId = typeof (event.runMeta as Record<string, unknown> | undefined)?.conversationId === 'string'
            ? String((event.runMeta as Record<string, unknown>).conversationId)
            : event.candidateId
          lastCandidate = event
          pendingInput = undefined
        }
        writeEvent(response, event)
      }
    } catch (error) {
      encounteredError = true
      if (!abortController.signal.aborted) {
        writeEvent(response, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Agent turn failed',
        })
      }
    }

    if (!encounteredError && !abortController.signal.aborted) {
      const nextHtmlPptState = buildHtmlPptState(
        sessionSnapshot?.htmlPptState,
        body,
        lastCandidate,
      )

      await store.set(owner, {
        conversationId: nextConversationId ?? `conversation-${randomUUID()}`,
        updatedAt: Date.now(),
        snapshot: {
          lastAssistantText,
          candidate: lastCandidate
            ? lastCandidate.type === 'candidate_ready'
              ? {
                  candidateId: lastCandidate.candidateId,
                  summary: lastCandidate.summary,
                  deckDraft: lastCandidate.deckDraft,
                  compiledHtml: lastCandidate.compiledHtml,
                  slideMeta: lastCandidate.slideMeta,
                  sources: lastCandidate.sources,
                  artifactRefs: lastCandidate.artifactRefs,
                  runMeta: lastCandidate.runMeta,
                }
              : {
                  candidateId: lastCandidate.candidateId,
                  summary: lastCandidate.summary,
                  html: lastCandidate.html,
                  previewMeta: lastCandidate.previewMeta,
                  sources: lastCandidate.sources,
                  artifactRefs: lastCandidate.artifactRefs,
                  runMeta: lastCandidate.runMeta,
                }
            : undefined,
          pendingInput: pendingInput
            ? (() => {
                const { type: _type, ...snapshotPendingInput } = pendingInput
                return snapshotPendingInput
              })()
            : undefined,
          htmlPptState: nextHtmlPptState,
        },
      })
    }

    if (!abortController.signal.aborted) {
      writeEvent(response, {
        type: 'done',
      })
      response.end()
    }
  })

  app.post('/api/ai/optimize-prompt', async (request, response) => {
    const parsed = optimizePromptRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        error: 'invalid_request',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      })
      return
    }

    try {
      const result = await optimizePrompt(parsed.data.prompt, parsed.data.context)
      response.json(result)
    } catch (error) {
      response.status(500).json({
        error: 'optimization_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  app.get('/api/agent/sessions/:sessionId/snapshot', async (request, response) => {
    const session = await store.get(createSessionOwner(request, request.params.sessionId))
    if (!session) {
      response.status(404).json({
        error: 'session_not_found',
      })
      return
    }

    response.json({
      sessionId: request.params.sessionId,
      snapshot: session.snapshot ?? null,
    })
  })

  app.post('/api/agent/sessions/:sessionId/reset', async (request, response) => {
    const owner = createSessionOwner(request, request.params.sessionId)
    const existingSession = await store.get(owner)
    const preserveUploadedAssets = (request.body as { preserveUploadedAssets?: boolean } | undefined)?.preserveUploadedAssets !== false
    const uploadedAssets = preserveUploadedAssets ? existingSession?.snapshot?.htmlPptState?.uploadedAssets ?? [] : []

    await store.set(owner, {
      conversationId: null,
      updatedAt: Date.now(),
      snapshot: uploadedAssets.length
        ? {
            htmlPptState: {
              uploadedAssets,
            },
          }
        : undefined,
    })

    response.json({
      ok: true,
    })
  })

  app.post(
    '/api/agent/uploads',
    express.raw({
      type: '*/*',
      limit: `${Math.ceil(runtimeConfig.jobLimits.maxUploadBytes / (1024 * 1024)) + 1}mb`,
    }),
    async (request, response) => {
      const sessionId = typeof request.query.sessionId === 'string' ? request.query.sessionId.trim() : ''
      const rawFileName = request.header('x-file-name')?.trim() ?? ''
      const contentType = request.header('content-type')?.trim() ?? 'application/octet-stream'
      const fileName = decodeUploadFileName(rawFileName)

      if (!sessionId) {
        response.status(400).json({
          error: 'sessionId is required',
        })
        return
      }

      if (!fileName) {
        response.status(400).json({
          error: 'x-file-name header is required',
        })
        return
      }

      const buffer = Buffer.isBuffer(request.body)
        ? request.body
        : request.body instanceof Uint8Array
          ? Buffer.from(request.body)
          : Buffer.alloc(0)

      const owner = createSessionOwner(request, sessionId)
      const savedAsset = await uploadStore.save({
        tenantId: owner.tenantId,
        userId: owner.userId,
        sessionId: owner.sessionId,
        fileName,
        contentType,
        buffer,
      })
      const assetExt = path.extname(savedAsset.fileName).toLowerCase() || '.bin'
      const referenceText = await extractReferenceText({
        buffer,
        contentType: savedAsset.contentType,
        ext: assetExt,
      })

      const extractedAssets: ExtractedAsset[] = []
      if (assetExt === '.docx') {
        const fullText = await extractDocxFullText(buffer)
        if (fullText.length > 0) {
          const textBuffer = Buffer.from(fullText, 'utf-8')
          const txtFileName = savedAsset.fileName.replace(/\.docx$/i, '') + '.extracted.txt'
          const savedText = await uploadStore.saveCompanion({
            parentAsset: savedAsset,
            fileName: txtFileName,
            contentType: 'text/plain; charset=utf-8',
            buffer: textBuffer,
          })
          extractedAssets.push({
            fileName: savedText.fileName,
            contentType: 'text/plain; charset=utf-8',
            sizeBytes: textBuffer.byteLength,
            kind: 'full-text',
            path: savedText.absolutePath,
          })
        }

        const images = await extractDocxImages(buffer)
        for (const image of images) {
          const savedImage = await uploadStore.saveCompanion({
            parentAsset: savedAsset,
            fileName: image.fileName,
            contentType: image.contentType,
            buffer: image.buffer,
          })
          extractedAssets.push({
            fileName: savedImage.fileName,
            contentType: image.contentType,
            sizeBytes: image.buffer.byteLength,
            kind: 'image',
            path: savedImage.absolutePath,
          })
        }
      }

      const assetSnapshot = {
        assetId: savedAsset.uploadId,
        fileName: savedAsset.fileName,
        path: savedAsset.absolutePath,
        contentType: savedAsset.contentType,
        ext: assetExt,
        sizeBytes: savedAsset.sizeBytes,
        usability: 'usable' as const,
        reason: 'Uploaded asset ready for sandbox materialization.',
        referenceText,
        extractedAssets: extractedAssets.length > 0 ? extractedAssets : undefined,
      }
      const existingSession = await store.get(owner)
      const existingState = existingSession?.snapshot?.htmlPptState

      await store.set(owner, {
        conversationId: existingSession?.conversationId ?? `conversation-${randomUUID()}`,
        updatedAt: Date.now(),
        snapshot: {
          ...existingSession?.snapshot,
          htmlPptState: {
            ...existingState,
            uploadedAssets: [
              ...(existingState?.uploadedAssets ?? []).filter((asset) => asset.assetId !== assetSnapshot.assetId),
              assetSnapshot,
            ],
          },
        },
      })

      response.status(201).json({
        asset: assetSnapshot,
      })
    },
  )

  return {
    app,
    async listen(port: number): Promise<string> {
      await new Promise<void>((resolve) => {
        server.listen(port, resolve)
      })

      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Server did not bind to an expected address')
      }

      return `http://127.0.0.1:${address.port}`
    },
    async close(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    },
  }
}

function decodeUploadFileName(value: string): string {
  if (!value) {
    return ''
  }

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function writeEvent(response: express.Response, event: AgentTurnEvent): void {
  if (response.destroyed || response.writableEnded) {
    return
  }

  const validatedEvent = agentTurnEventSchema.parse(event)
  response.write(`${JSON.stringify(validatedEvent)}\n`)
}

function writePptxExportEvent(response: express.Response, event: PptxExportEvent): void {
  if (response.destroyed || response.writableEnded) {
    return
  }

  const validatedEvent = pptxExportEventSchema.parse(event)
  response.write(`${JSON.stringify(validatedEvent)}\n`)
}

function buildHtmlPptState(
  previousState: HtmlPptState | undefined,
  request: AiTurnRequest,
  lastCandidate:
    | Extract<AgentTurnEvent, { type: 'candidate_ready' }>
    | Extract<AgentTurnEvent, { type: 'html_candidate_ready' }>
    | undefined,
): HtmlPptState | undefined {
  if (request.skillId !== 'html_ppt' && !previousState) {
    return undefined
  }

  const targetSlideCount =
    lastCandidate?.type === 'html_candidate_ready'
      ? lastCandidate.previewMeta.targetSlideCount ?? request.targetSlideCount ?? previousState?.targetSlideCount
      : request.targetSlideCount ?? previousState?.targetSlideCount

  return {
    initialMessage: previousState?.initialMessage ?? (request.message.trim() || undefined),
    htmlPpt: request.htmlPpt ?? previousState?.htmlPpt,
    targetSlideCount,
    lastInputReply: request.inputReply ?? previousState?.lastInputReply,
    imageFolderPath: extractImageFolderPath(request.inputReply) ?? previousState?.imageFolderPath,
    scannedAssets: previousState?.scannedAssets,
    uploadedAssets: previousState?.uploadedAssets,
  }
}

function extractImageFolderPath(inputReply: AiTurnRequest['inputReply']): string | undefined {
  return inputReply?.answers
    .map((answer) => answer.text?.trim())
    .find((value) => value && /[\\/]/.test(value))
}
