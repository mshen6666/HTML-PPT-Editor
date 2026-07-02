// @vitest-environment node

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { blankDeckHtml } from '../src/blankDeck'
import { createAiServer } from './createAiServer'
import { createSandboxedClaudeCodeDeckAgent, type ClaudeCodeQueryFactory } from './claudeCodeHtmlPptAgent'

const defaultHtmlPptBrief = {
  audience: 'engineers',
  format: 'live',
  themeName: 'tokyo-night',
  fullDeckName: 'tech-sharing',
  includeNotes: true,
  preserveRuntime: true,
  slideCountHint: 5,
} as const

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

describe('createSandboxedClaudeCodeDeckAgent', () => {
  it('runs Claude Code with html-ppt context and returns the generated presentation artifact', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ppt-claude-agent-'))
    const artifactSaves: Array<{ buffer: Buffer; fileName: string }> = []
    let capturedPrompt = ''
    let capturedOptions: Parameters<ClaudeCodeQueryFactory>[0]['options'] | undefined
    const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY
    const originalAnthropicAuthToken = process.env.ANTHROPIC_AUTH_TOKEN
    delete process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_AUTH_TOKEN = 'test-auth-token'

    const queryFactory: ClaudeCodeQueryFactory = ({ prompt, options }) => {
      capturedPrompt = prompt
      capturedOptions = options

      return (async function* () {
        await writeFile(
          path.join(tempDir, 'presentation.html'),
          '<!doctype html><html><head><title>Claude Deck</title></head><body><section class="slide"><h1>Claude Deck</h1></section></body></html>',
          'utf8',
        )
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'HTML 已写入 presentation.html。' }],
          },
        }
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'claude-session-1',
          result: 'ok',
        }
      })()
    }

    const agent = createSandboxedClaudeCodeDeckAgent({
      runtimeConfig: createRuntimeConfigFixture(),
      sandboxManager: {
        async create() {
          await writeFile(path.join(tempDir, 'current-deck.html'), blankDeckHtml, 'utf8')
          await writeFile(path.join(tempDir, 'presentation.html'), '', 'utf8')
          return createSandboxHandleFixture(tempDir)
        },
        async destroy() {},
      },
      artifactStore: {
        async save(args) {
          artifactSaves.push({
            buffer: args.buffer,
            fileName: args.fileName,
          })
          return {
            artifactId: 'artifact-claude',
            tenantId: args.tenantId,
            userId: args.userId,
            sessionId: args.sessionId,
            jobId: args.jobId,
            fileName: args.fileName,
            contentType: args.contentType,
            sizeBytes: args.buffer.byteLength,
            relativePath: 'artifacts/presentation.html',
            absolutePath: path.join(tempDir, 'artifact.html'),
            createdAt: Date.now(),
          }
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

    const events = []
    try {
      for await (const event of agent.runTurn({
        ...createSandboxedTurnRequest(),
        sessionSnapshot: {
          htmlPptState: {
            uploadedAssets: [
              {
                assetId: 'asset-brief',
                fileName: 'brief.md',
                path: path.join(tempDir, 'brief.md'),
                contentType: 'text/markdown',
                ext: '.md',
                sizeBytes: 61,
                usability: 'usable',
                referenceText: {
                  status: 'extracted',
                  excerpt: 'Use the Safety AI positioning and cite the 42% pilot lift.',
                  charCount: 58,
                  truncated: false,
                },
              },
            ],
          },
        },
      })) {
        events.push(event)
      }
    } finally {
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
    }

    expect(capturedOptions).toEqual(expect.objectContaining({
      cwd: tempDir,
      tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
      allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
      pathToClaudeCodeExecutable: expect.stringContaining('claude-agent-sdk-'),
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      persistSession: false,
      settingSources: [],
    }))
    expect(capturedOptions?.env).toEqual(expect.objectContaining({
      ANTHROPIC_API_KEY: 'test-auth-token',
      ANTHROPIC_AUTH_TOKEN: 'test-auth-token',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    }))
    expect(capturedPrompt).toContain('### HTML PPT Skill')
    expect(capturedPrompt).toContain('### Style Presets Reference')
    expect(capturedPrompt).toContain('Do not invoke the Skill tool or attempt to load any locally installed skill.')
    expect(capturedPrompt).toContain('When the user mentions a theme, layout, animation, or full-deck template name, resolve it inside the embedded html-ppt references and templates.')
    expect(capturedPrompt).toContain('Examples such as course-module, tech-sharing, pitch-deck, xhs-post, tokyo-night, and editorial-serif are html-ppt resources, not separate skills.')
    expect(capturedPrompt).toContain('beautiful-html-templates')
    expect(capturedPrompt).toContain('When using beautiful-html-templates, preserve the chosen template visual system but output editor-compatible section.slide pages.')
    expect(capturedPrompt).toContain('Auto style selection policy for short user prompts:')
    expect(capturedPrompt).toContain('If the user only says to generate a PPT from uploaded documents or gives a very short generic request, do not default to a plain white/minimal deck.')
    expect(capturedPrompt).toContain('Formal reports should use a visible blue/red-blue engineering, government, Party/state-owned-enterprise, or institute-report visual system')
    expect(capturedPrompt).toContain('When using oh-my-ppt reference styles, recreate the visual direction inside the editor contract.')
    expect(capturedPrompt).toContain('Do not ask the user for preferences before generating.')
    expect(capturedPrompt).toContain('If theme, template, layout, animation, audience, format, or slide count details are missing, choose reasonable defaults from the embedded html-ppt resources and continue.')
    expect(capturedPrompt).toContain('You must use Write, Edit, or Bash to write the final HTML file to the exact output path.')
    expect(capturedPrompt).toContain('After writing, read the output file back and verify it is not empty before ending the turn.')
    expect(capturedPrompt).toContain('Final visual direction guard:')
    expect(capturedPrompt).toContain('No more than two consecutive slides may be mostly plain white/light unless explicitly requested by the user.')
    expect(capturedPrompt).toContain('Use the editor canvas contract: standard decks are fixed 16:9 at 1280x720.')
    expect(capturedPrompt).toContain('Keep audience-facing content inside a safe content budget of roughly 1120x600 pixels.')
    expect(capturedPrompt).toContain('Interact with the user in Chinese.')
    expect(capturedPrompt).toContain(`Write the final standalone presentation HTML to: ${path.join(tempDir, 'presentation.html')}`)
    expect(capturedPrompt).toContain('For uploaded .docx files, the original file has been pre-processed')
    expect(capturedPrompt).toContain('Always read the extracted .txt companion file')
    expect(capturedPrompt).toContain('Use the Safety AI positioning and cite the 42% pilot lift.')
    expect(capturedPrompt).toContain('### 私有知识库参考')
    expect(capturedPrompt).toContain('标题：测试规范')
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'html_candidate_ready',
        summary: 'HTML 已写入 presentation.html。',
        previewMeta: expect.objectContaining({
          title: 'Claude Deck',
        }),
        artifactRefs: expect.objectContaining({
          html: expect.objectContaining({
            artifactId: 'artifact-claude',
            fileName: 'presentation.html',
          }),
        }),
        runMeta: expect.objectContaining({
          model: expect.stringContaining('claude-code:'),
          conversationId: 'claude-session-1',
          isFallback: false,
        }),
      }),
    ]))
    expect(artifactSaves).toHaveLength(1)
    expect(artifactSaves[0].fileName).toBe('presentation.html')
    expect(artifactSaves[0].buffer.toString('utf8')).toContain('data-fs-canvas-width="1280"')
    expect(artifactSaves[0].buffer.toString('utf8')).toContain('data-fs-canvas-height="720"')
    expect(await readFile(path.join(tempDir, 'presentation.html'), 'utf8')).toContain('Claude Deck')

    await rm(tempDir, { recursive: true, force: true })
  })

  it('returns normalized html with layout warnings when generated pages risk overflow', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ppt-claude-agent-layout-'))
    const longList = Array.from({ length: 11 }, (_, index) => `<li>Item ${index + 1}</li>`).join('')

    const queryFactory: ClaudeCodeQueryFactory = () => {
      return (async function* () {
        await writeFile(
          path.join(tempDir, 'presentation.html'),
          `<!doctype html><html data-fs-canvas-width="1920" data-fs-canvas-height="1080"><head><title>Risk Deck</title><style>.slide{width:1920px;height:1080px}</style></head><body><section class="slide"><h1>Risk Deck</h1><ul>${longList}</ul></section></body></html>`,
          'utf8',
        )
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'agent 已生成 HTML 候选。' }],
          },
        }
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'claude-session-layout',
          result: 'ok',
        }
      })()
    }

    const agent = createSandboxedClaudeCodeDeckAgent({
      runtimeConfig: createRuntimeConfigFixture(),
      sandboxManager: {
        async create() {
          await writeFile(path.join(tempDir, 'current-deck.html'), blankDeckHtml, 'utf8')
          await writeFile(path.join(tempDir, 'presentation.html'), '', 'utf8')
          return createSandboxHandleFixture(tempDir)
        },
        async destroy() {},
      },
      artifactStore: {
        async save(args) {
          return {
            artifactId: 'artifact-layout',
            tenantId: args.tenantId,
            userId: args.userId,
            sessionId: args.sessionId,
            jobId: args.jobId,
            fileName: args.fileName,
            contentType: args.contentType,
            sizeBytes: args.buffer.byteLength,
            relativePath: 'artifacts/presentation.html',
            absolutePath: path.join(tempDir, 'artifact.html'),
            createdAt: Date.now(),
          }
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

    const events = []
    for await (const event of agent.runTurn(createSandboxedTurnRequest())) {
      events.push(event)
    }

    const candidate = events.find((event) => event.type === 'html_candidate_ready')
    expect(candidate).toEqual(expect.objectContaining({
      type: 'html_candidate_ready',
      html: expect.stringContaining('data-fs-canvas-width="1280"'),
      summary: expect.stringContaining('可能有页面溢出'),
      previewMeta: expect.objectContaining({
        layoutWarnings: expect.arrayContaining([
          expect.objectContaining({ code: 'canvas-size-mismatch' }),
          expect.objectContaining({ code: 'legacy-fixed-canvas' }),
          expect.objectContaining({ code: 'long-list', slideId: 'slide-1', slideIndex: 1 }),
        ]),
      }),
    }))

    await rm(tempDir, { recursive: true, force: true })
  })

  it('passes selected elements and message image assets to Claude Code and inlines generated asset references', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ppt-claude-agent-assets-'))
    let capturedPrompt = ''

    const queryFactory: ClaudeCodeQueryFactory = ({ prompt }) => {
      capturedPrompt = prompt

      return (async function* () {
        await writeFile(
          path.join(tempDir, 'presentation.html'),
          '<!doctype html><html><head><title>Asset Deck</title></head><body><section class="slide"><img src="assets/logo.png" alt="Logo"></section></body></html>',
          'utf8',
        )
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: '已基于选中元素和图片完成修改。' }],
          },
        }
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'claude-session-assets',
          result: 'ok',
        }
      })()
    }

    const agent = createSandboxedClaudeCodeDeckAgent({
      runtimeConfig: createRuntimeConfigFixture(),
      sandboxManager: {
        async create() {
          await mkdir(path.join(tempDir, 'assets'), { recursive: true })
          await writeFile(path.join(tempDir, 'current-deck.html'), blankDeckHtml, 'utf8')
          await writeFile(path.join(tempDir, 'presentation.html'), '', 'utf8')
          return createSandboxHandleFixture(tempDir)
        },
        async destroy() {},
      },
      artifactStore: {
        async save(args) {
          return {
            artifactId: 'artifact-assets',
            tenantId: args.tenantId,
            userId: args.userId,
            sessionId: args.sessionId,
            jobId: args.jobId,
            fileName: args.fileName,
            contentType: args.contentType,
            sizeBytes: args.buffer.byteLength,
            relativePath: 'artifacts/presentation.html',
            absolutePath: path.join(tempDir, 'artifact.html'),
            createdAt: Date.now(),
          }
        },
      },
      uploadStore: {
        async save() {
          throw new Error('not used')
        },
        async materialize(_assets, targetDir) {
          await mkdir(targetDir, { recursive: true })
          await writeFile(path.join(targetDir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
          return []
        },
      },
      queryFactory,
    })

    const events = []
    try {
      for await (const event of agent.runTurn({
        ...createSandboxedTurnRequest(),
        message: '把选中元素换成更强的标题，并使用上传图片',
        generationMode: 'from-current',
        selectedElement: {
          slideId: 'slide-1',
          selector: 'section.slide[data-slide-id="slide-1"] [data-node-id="text-hero"]',
          elementTag: 'h1',
          elementText: '旧标题',
        },
        messageAssetIds: ['asset-logo'],
        sessionSnapshot: {
          htmlPptState: {
            uploadedAssets: [
              {
                assetId: 'asset-logo',
                fileName: 'logo.png',
                path: path.join(tempDir, 'logo.png'),
                contentType: 'image/png',
                ext: '.png',
                sizeBytes: 4,
                usability: 'usable',
              },
            ],
          },
        },
      })) {
        events.push(event)
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }

    expect(capturedPrompt).toContain('Selected element context')
    expect(capturedPrompt).toContain('section.slide[data-slide-id="slide-1"] [data-node-id="text-hero"]')
    expect(capturedPrompt).toContain('本次消息指定图片素材')
    expect(capturedPrompt).toContain('assets/logo.png')
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'html_candidate_ready',
        html: expect.stringContaining('data:image/png;base64'),
      }),
    ]))
  })

  it('uses generic agent copy for Claude Code status and fallback summary shown to users', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ppt-claude-copy-'))
    const agent = createSandboxedClaudeCodeDeckAgent({
      runtimeConfig: createRuntimeConfigFixture(),
      sandboxManager: {
        async create() {
          await writeFile(path.join(tempDir, 'current-deck.html'), blankDeckHtml, 'utf8')
          await writeFile(path.join(tempDir, 'presentation.html'), '', 'utf8')
          return createSandboxHandleFixture(tempDir)
        },
        async destroy() {},
      },
      artifactStore: {
        async save(args) {
          return {
            artifactId: 'artifact-agent-copy',
            tenantId: args.tenantId,
            userId: args.userId,
            sessionId: args.sessionId,
            jobId: args.jobId,
            fileName: args.fileName,
            contentType: args.contentType,
            sizeBytes: args.buffer.byteLength,
            relativePath: 'artifacts/presentation.html',
            absolutePath: path.join(tempDir, 'artifact.html'),
            createdAt: Date.now(),
          }
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
      queryFactory: () => (async function* () {
        await writeFile(
          path.join(tempDir, 'presentation.html'),
          '<!doctype html><html><head><title>Agent Deck</title></head><body><section class="slide"><h1>Agent Deck</h1></section></body></html>',
          'utf8',
        )
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'agent-copy-session',
          result: 'ok',
        }
      })(),
    })

    const events = []
    for await (const event of agent.runTurn(createSandboxedTurnRequest())) {
      events.push(event)
    }

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'status',
        phase: 'drafting',
        label: '正在调用 agent 生成 HTML',
      }),
      expect.objectContaining({
        type: 'html_candidate_ready',
        summary: 'agent 已生成 HTML 候选。',
      }),
    ]))
    expect(JSON.stringify(events)).not.toContain('Claude Code')

    await rm(tempDir, { recursive: true, force: true })
  })

  it('normalizes Claude Code mentions in assistant transcript text before streaming to users', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ppt-claude-transcript-'))
    const agent = createSandboxedClaudeCodeDeckAgent({
      runtimeConfig: createRuntimeConfigFixture(),
      sandboxManager: {
        async create() {
          await writeFile(path.join(tempDir, 'current-deck.html'), blankDeckHtml, 'utf8')
          await writeFile(path.join(tempDir, 'presentation.html'), '', 'utf8')
          return createSandboxHandleFixture(tempDir)
        },
        async destroy() {},
      },
      artifactStore: {
        async save(args) {
          return {
            artifactId: 'artifact-agent-transcript',
            tenantId: args.tenantId,
            userId: args.userId,
            sessionId: args.sessionId,
            jobId: args.jobId,
            fileName: args.fileName,
            contentType: args.contentType,
            sizeBytes: args.buffer.byteLength,
            relativePath: 'artifacts/presentation.html',
            absolutePath: path.join(tempDir, 'artifact.html'),
            createdAt: Date.now(),
          }
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
      queryFactory: () => (async function* () {
        await writeFile(
          path.join(tempDir, 'presentation.html'),
          '<!doctype html><html><head><title>Agent Deck</title></head><body><section class="slide"><h1>Agent Deck</h1></section></body></html>',
          'utf8',
        )
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Claude Code 已写入 presentation.html。' }],
          },
        }
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'agent-transcript-session',
          result: 'ok',
        }
      })(),
    })

    const events = []
    for await (const event of agent.runTurn(createSandboxedTurnRequest())) {
      events.push(event)
    }

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'assistant_done',
        text: 'agent 已写入 presentation.html。',
      }),
      expect.objectContaining({
        type: 'html_candidate_ready',
        summary: 'agent 已写入 presentation.html。',
      }),
    ]))
    expect(JSON.stringify(events)).not.toContain('Claude Code')

    await rm(tempDir, { recursive: true, force: true })
  })

  it('retries when Claude Code completes without writing presentation.html', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ppt-claude-retry-'))
    const prompts: string[] = []
    const agent = createSandboxedClaudeCodeDeckAgent({
      runtimeConfig: createRuntimeConfigFixture(),
      sandboxManager: {
        async create() {
          await writeFile(path.join(tempDir, 'current-deck.html'), blankDeckHtml, 'utf8')
          await writeFile(path.join(tempDir, 'presentation.html'), '', 'utf8')
          return createSandboxHandleFixture(tempDir)
        },
        async destroy() {},
      },
      artifactStore: {
        async save(args) {
          return {
            artifactId: 'artifact-retry',
            tenantId: args.tenantId,
            userId: args.userId,
            sessionId: args.sessionId,
            jobId: args.jobId,
            fileName: args.fileName,
            contentType: args.contentType,
            sizeBytes: args.buffer.byteLength,
            relativePath: 'artifacts/presentation.html',
            absolutePath: path.join(tempDir, 'artifact.html'),
            createdAt: Date.now(),
          }
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
      queryFactory: ({ prompt }) => {
        prompts.push(prompt)
        return (async function* () {
          if (prompts.length === 2) {
            await writeFile(
              path.join(tempDir, 'presentation.html'),
              '<!doctype html><html><head><title>Retry Deck</title></head><body><section class="slide"><h1>Retry Deck</h1></section></body></html>',
              'utf8',
            )
          }
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: prompts.length === 1 ? '我已经完成。' : '重试后已写入。' }],
            },
          }
          yield {
            type: 'result',
            subtype: 'success',
            session_id: `retry-session-${prompts.length}`,
            result: 'ok',
          }
        })()
      },
    })

    const events = []
    for await (const event of agent.runTurn(createSandboxedTurnRequest())) {
      events.push(event)
    }

    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toContain('The previous agent run completed without writing presentation.html.')
    expect(prompts[1]).toContain(path.join(tempDir, 'presentation.html'))
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'status',
        phase: 'drafting',
        label: '正在重试生成 HTML 文件',
      }),
      expect.objectContaining({
        type: 'html_candidate_ready',
        previewMeta: expect.objectContaining({
          title: 'Retry Deck',
        }),
      }),
    ]))

    await rm(tempDir, { recursive: true, force: true })
  })

  it('rewrites visually weak white decks before returning the HTML candidate', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ppt-claude-visual-rewrite-'))
    const prompts: string[] = []
    const agent = createSandboxedClaudeCodeDeckAgent({
      runtimeConfig: createRuntimeConfigFixture(),
      sandboxManager: {
        async create() {
          await writeFile(path.join(tempDir, 'current-deck.html'), blankDeckHtml, 'utf8')
          await writeFile(path.join(tempDir, 'presentation.html'), '', 'utf8')
          return createSandboxHandleFixture(tempDir)
        },
        async destroy() {},
      },
      artifactStore: {
        async save(args) {
          return {
            artifactId: 'artifact-visual-rewrite',
            tenantId: args.tenantId,
            userId: args.userId,
            sessionId: args.sessionId,
            jobId: args.jobId,
            fileName: args.fileName,
            contentType: args.contentType,
            sizeBytes: args.buffer.byteLength,
            relativePath: 'artifacts/presentation.html',
            absolutePath: path.join(tempDir, 'artifact.html'),
            createdAt: Date.now(),
          }
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
      queryFactory: ({ prompt }) => {
        prompts.push(prompt)
        return (async function* () {
          await writeFile(
            path.join(tempDir, 'presentation.html'),
            prompts.length === 1
              ? '<!doctype html><html><head><title>Weak Deck</title><style>:root{--bg:#ffffff;--surface:#fff;--surface-2:#f8fafc}.slide{background:#ffffff}</style></head><body><section class="slide"><h1>Weak Deck</h1></section></body></html>'
              : '<!doctype html><html><head><title>Strong Deck</title><style>:root{--bg:#07162f;--surface:#123b78;--surface-2:#7f1d1d}.slide{background:linear-gradient(135deg,#07162f,#123b78);color:#fff}</style></head><body><section class="slide"><h1>Strong Deck</h1></section></body></html>',
            'utf8',
          )
          yield {
            type: 'result',
            subtype: 'success',
            session_id: `visual-session-${prompts.length}`,
            result: 'ok',
          }
        })()
      },
    })

    const events = []
    for await (const event of agent.runTurn({
      ...createSandboxedTurnRequest(),
      message: '根据上传材料生成一份部门工作汇报 PPT',
      htmlPpt: {
        ...defaultHtmlPptBrief,
        themeName: undefined,
        fullDeckName: undefined,
      },
    })) {
      events.push(event)
    }

    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toContain('visual system is too close to a plain white/light fallback style')
    expect(prompts[1]).toContain('Root background and surface are white-like')
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'status',
        phase: 'drafting',
        label: '正在增强 HTML 候选的主题背景与视觉层次',
      }),
      expect.objectContaining({
        type: 'html_candidate_ready',
        previewMeta: expect.objectContaining({
          title: 'Strong Deck',
        }),
      }),
    ]))

    await rm(tempDir, { recursive: true, force: true })
  })

  it('aborts the Claude Code query when the turn abort signal fires', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ppt-claude-abort-'))
    const abortController = new AbortController()
    let queryAbortController: AbortController | undefined
    const agent = createSandboxedClaudeCodeDeckAgent({
      runtimeConfig: createRuntimeConfigFixture(),
      sandboxManager: {
        async create() {
          await writeFile(path.join(tempDir, 'current-deck.html'), blankDeckHtml, 'utf8')
          await writeFile(path.join(tempDir, 'presentation.html'), '', 'utf8')
          return createSandboxHandleFixture(tempDir)
        },
        async destroy() {},
      },
      artifactStore: {
        async save() {
          throw new Error('candidate should not be saved after abort')
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
      queryFactory: ({ options }) => {
        queryAbortController = options.abortController
        return (async function* () {
          await new Promise<void>((_resolve, reject) => {
            options.abortController?.signal.addEventListener('abort', () => {
              reject(new Error('aborted'))
            }, { once: true })
          })
        })()
      },
    })

    const iterator = agent.runTurn({
      ...createSandboxedTurnRequest(),
      abortSignal: abortController.signal,
    })[Symbol.asyncIterator]()

    expect(await iterator.next()).toEqual({
      done: false,
      value: expect.objectContaining({
        type: 'status',
        phase: 'queued',
      }),
    })
    expect(await iterator.next()).toEqual({
      done: false,
      value: expect.objectContaining({
        type: 'status',
        phase: 'drafting',
      }),
    })

    const pendingNext = iterator.next()
    await waitForCondition(() => Boolean(queryAbortController))
    abortController.abort()

    await expect(pendingNext).rejects.toThrow(/aborted/i)
    expect(queryAbortController?.signal.aborted).toBe(true)

    await rm(tempDir, { recursive: true, force: true })
  })

  it('streams the existing error event when Claude Code generation fails', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ppt-claude-error-'))
    const agent = createSandboxedClaudeCodeDeckAgent({
      runtimeConfig: createRuntimeConfigFixture(),
      sandboxManager: {
        async create() {
          await writeFile(path.join(tempDir, 'current-deck.html'), blankDeckHtml, 'utf8')
          await writeFile(path.join(tempDir, 'presentation.html'), '', 'utf8')
          return createSandboxHandleFixture(tempDir)
        },
        async destroy() {},
      },
      artifactStore: {
        async save() {
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
      queryFactory: () => (async function* () {
        yield {
          type: 'result',
          subtype: 'error_during_execution',
          errors: ['MiniMax stream disconnected'],
          session_id: 'claude-session-error',
        }
      })(),
    })
    const server = createAiServer({ agent })
    const address = await server.listen(0)
    const response = await fetch(`${address}/api/ai/turns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createSandboxedTurnRequest()),
    })
    const body = await response.text()
    await server.close()

    expect(body).toContain('"type":"error"')
    expect(body).toContain('MiniMax stream disconnected')

    await rm(tempDir, { recursive: true, force: true })
  })
})

async function waitForCondition(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > 1_000) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

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

function createSandboxedTurnRequest() {
  return {
    sessionId: 'session-a',
    documentId: 'document-1',
    conversationId: null,
        message: '生成一份 AI 产品发布演示',
        knowledgeReferences: [
          {
            id: 'knowledge-1',
            title: '测试规范',
            content: '部门汇报必须突出质量门禁、风险闭环和交付节奏。',
            summary: '质量门禁与风险闭环',
            sourceType: 'document',
            categoryPath: ['制度', '测试'],
          },
        ],
        skillId: 'html_ppt',
    currentDeckHtml: blankDeckHtml,
    currentDeckHash: 'hash-sandboxed',
    clientContext: {
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      surface: 'editor' as const,
    },
    generationMode: 'from-scratch' as const,
    htmlPpt: defaultHtmlPptBrief,
    sessionSnapshot: null,
    sessionOwner: {
      tenantId: 'tenant-a',
      userId: 'user-a',
      sessionId: 'session-a',
    },
  }
}

function createSandboxHandleFixture(rootDir: string) {
  return {
    sandboxId: 'sandbox-claude-id',
    rootDir,
    currentDeckPath: path.join(rootDir, 'current-deck.html'),
    outputHtmlPath: path.join(rootDir, 'presentation.html'),
    assetsDir: path.join(rootDir, 'assets'),
    skillBundlePath: 'D:/workspace/ppt/server/embedded-skills/html-ppt',
  }
}
