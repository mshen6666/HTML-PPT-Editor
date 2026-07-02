// @vitest-environment node

import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { blankDeckHtml } from '../src/blankDeck'
import type { PptxExportEvent } from '../src/agent/protocol'
import { createSandboxedClaudeCodePptxExportAgent, type PptxExportQueryFactory } from './claudeCodePptxExportAgent'

const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY
const originalAnthropicAuthToken = process.env.ANTHROPIC_AUTH_TOKEN

beforeEach(() => {
  process.env.ANTHROPIC_AUTH_TOKEN = 'test-auth-token'
})

afterEach(() => {
  if (originalAnthropicApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey
  }
  if (originalAnthropicAuthToken === undefined) {
    delete process.env.ANTHROPIC_AUTH_TOKEN
  } else {
    process.env.ANTHROPIC_AUTH_TOKEN = originalAnthropicAuthToken
  }
})

describe('createSandboxedClaudeCodePptxExportAgent', () => {
  it('runs Claude Code with embedded PPTX export instructions and returns a pptx artifact', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ppt-pptx-export-agent-'))
    const artifactSaves: Array<{ buffer: Buffer; fileName: string; contentType: string }> = []
    let capturedPrompt = ''
    let capturedOptions: Parameters<PptxExportQueryFactory>[0]['options'] | undefined

    const queryFactory: PptxExportQueryFactory = ({ prompt, options }) => {
      capturedPrompt = prompt
      capturedOptions = options

      return (async function* () {
        await writeFile(path.join(tempDir, 'export.pptx'), Buffer.from('pptx bytes'))
        await writeFile(
          path.join(tempDir, 'export-summary.json'),
          JSON.stringify({ summary: '已生成可编辑 PPTX。' }),
          'utf8',
        )
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: '已完成 PPTX 导出。' }],
          },
        }
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'pptx-export-session',
          result: 'ok',
        }
      })()
    }

    const agent = createSandboxedClaudeCodePptxExportAgent({
      runtimeConfig: createRuntimeConfigFixture(),
      sandboxManager: {
        async create() {
          await mkdir(path.join(tempDir, 'assets'), { recursive: true })
          await writeFile(path.join(tempDir, 'current-deck.html'), blankDeckHtml, 'utf8')
          return createSandboxHandleFixture(tempDir)
        },
        async destroy() {},
      },
      artifactStore: {
        async save(args) {
          artifactSaves.push({
            buffer: args.buffer,
            fileName: args.fileName,
            contentType: args.contentType,
          })
          return {
            artifactId: 'artifact-pptx',
            tenantId: args.tenantId,
            userId: args.userId,
            sessionId: args.sessionId,
            jobId: args.jobId,
            fileName: args.fileName,
            contentType: args.contentType,
            sizeBytes: args.buffer.byteLength,
            relativePath: 'artifacts/export.pptx',
            absolutePath: path.join(tempDir, 'artifact.pptx'),
            createdAt: Date.now(),
          }
        },
        async readText() {
          throw new Error('not used')
        },
      },
      uploadStore: {
        async save() {
          throw new Error('not used')
        },
        async materialize() {
          return []
        },
      },
      queryFactory,
    })

    try {
      const events: PptxExportEvent[] = []
      for await (const event of agent.runExport({
        sessionId: 'session-a',
        documentId: 'document-1',
        currentDeckHtml: blankDeckHtml,
        currentDeckHash: 'hash-1',
        clientContext: {
          locale: 'zh-CN',
          timezone: 'Asia/Shanghai',
          surface: 'editor',
        },
        sessionSnapshot: null,
        sessionOwner: {
          tenantId: 'tenant-a',
          userId: 'user-a',
          sessionId: 'session-a',
        },
      })) {
        events.push(event)
      }

      expect(capturedOptions).toEqual(expect.objectContaining({
        cwd: tempDir,
        tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        persistSession: false,
        settingSources: [],
        maxTurns: 100,
        env: expect.objectContaining({
          NODE_PATH: expect.stringContaining('node_modules'),
          PPTX_EXPORT_PREINSTALLED_TOOLS: expect.stringContaining('pptxgenjs'),
        }),
      }))
      expect(capturedPrompt).toContain('Project PPTX Export Contract')
      expect(capturedPrompt).toContain('Embedded PPTX skill directory:')
      expect(capturedPrompt).toContain(path.join(tempDir, 'skills', 'pptx', 'SKILL.md'))
      expect(capturedPrompt).toContain('Read SKILL.md first, then read pptxgenjs.md because this export creates a deck from HTML.')
      expect(capturedPrompt).toContain('Do not install packages during this export job.')
      expect(capturedPrompt).toContain('Preinstalled runtime tools available to you:')
      expect(capturedPrompt).toContain('pptxgenjs')
      expect(capturedPrompt).toContain(`Read the current deck HTML from: ${path.join(tempDir, 'current-deck.html')}`)
      expect(capturedPrompt).toContain(`Write the final PPTX to: ${path.join(tempDir, 'export.pptx')}`)
      expect(capturedPrompt).toContain('editable-first')
      await expect(stat(path.join(tempDir, 'skills', 'pptx', 'SKILL.md'))).resolves.toEqual(expect.objectContaining({
        size: expect.any(Number),
      }))
      await expect(stat(path.join(tempDir, 'skills', 'pptx', 'pptxgenjs.md'))).resolves.toEqual(expect.objectContaining({
        size: expect.any(Number),
      }))
      await expect(readdir(path.join(tempDir, 'skills', 'pptx', 'scripts'))).resolves.toEqual(expect.arrayContaining([
        'thumbnail.py',
      ]))
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'pptx_export_ready',
          summary: '已生成可编辑 PPTX。',
          artifactRef: expect.objectContaining({
            artifactId: 'artifact-pptx',
            fileName: 'export.pptx',
            contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          }),
        }),
      ]))
      expect(artifactSaves).toEqual([
        expect.objectContaining({
          fileName: 'export.pptx',
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          buffer: Buffer.from('pptx bytes'),
        }),
      ])
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})

function createRuntimeConfigFixture() {
  return {
    redisUrl: '',
    sandboxRoot: 'D:/workspace/ppt/.runtime/sandboxes',
    artifactRoot: 'D:/workspace/ppt/.runtime/artifacts',
    uploadRoot: 'D:/workspace/ppt/.runtime/uploads',
    skillBundlePath: 'D:/workspace/ppt/server/embedded-skills/html-ppt',
    workerCommand: undefined,
    workerCloseTimeoutMs: 3_000,
    sandboxJanitorIntervalMs: 120_000,
    sandboxStaleAfterMs: 60 * 60 * 1000,
    jobLimits: {
      timeoutMs: 90_000,
      maxArtifactBytes: 2_000_000,
      maxUploadBytes: 10_000_000,
      maxUploadCount: 12,
      maxConcurrentJobsPerUser: 2,
      maxConcurrentJobsPerTenant: 12,
    },
  }
}

function createSandboxHandleFixture(rootDir: string) {
  return {
    sandboxId: 'sandbox-pptx-export-id',
    rootDir,
    currentDeckPath: path.join(rootDir, 'current-deck.html'),
    outputHtmlPath: path.join(rootDir, 'presentation.html'),
    assetsDir: path.join(rootDir, 'assets'),
    skillBundlePath: 'D:/workspace/ppt/server/embedded-skills/html-ppt',
  }
}
