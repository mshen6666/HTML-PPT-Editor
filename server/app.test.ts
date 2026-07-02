// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { compileDeckDraftToHtml } from '../src/agent/deckDraft'
import type { AgentTurnEvent, AiTurnRequest } from '../src/agent/protocol'
import { createAiServer } from './createAiServer'
import { createInviteGate } from './inviteGate'
import { InMemorySessionStore } from './sessionStore'
import { FileSystemArtifactStore } from './artifactStore'

const defaultHtmlPptBrief = {
  audience: 'engineers',
  format: 'live',
  themeName: 'tokyo-night',
  fullDeckName: 'tech-sharing',
  includeNotes: true,
  preserveRuntime: true,
  slideCountHint: 6,
} as const

describe('createAiServer', () => {
  it('streams intelligent pptx export events and serves the generated artifact download', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'ppt-export-server-'))
    const artifactStore = new FileSystemArtifactStore({
      rootDir: path.join(tempDir, 'artifacts'),
    })
    const server = createAiServer({
      store: new InMemorySessionStore(),
      artifactStore,
      pptxExportAgent: {
        async *runExport(request) {
          expect(request.currentDeckHtml).toContain('Current deck')
          const artifact = await artifactStore.save({
            tenantId: request.sessionOwner.tenantId,
            userId: request.sessionOwner.userId,
            sessionId: request.sessionOwner.sessionId,
            jobId: 'job-pptx-export',
            fileName: 'export.pptx',
            contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            buffer: Buffer.from('pptx bytes'),
          })
          yield { type: 'status', phase: 'drafting', label: '正在生成可编辑 PPTX' }
          yield {
            type: 'pptx_export_ready',
            summary: '已生成可编辑 PPTX。',
            artifactRef: {
              artifactId: artifact.artifactId,
              fileName: artifact.fileName,
              contentType: artifact.contentType,
              sizeBytes: artifact.sizeBytes,
            },
            downloadUrl: `/api/agent/sessions/${request.sessionOwner.sessionId}/artifacts/${artifact.artifactId}/download`,
          }
        },
      },
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const exportResponse = await fetch(`${address}/api/agent/pptx-export`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ppt-tenant-id': 'tenant-a',
          'x-ppt-user-id': 'user-a',
        },
        body: JSON.stringify({
          sessionId: 'session-pptx-export',
          documentId: 'document-1',
          currentDeckHtml: '<!doctype html><html><head><title>Current deck</title></head><body></body></html>',
          currentDeckHash: 'hash-1',
          clientContext: {
            locale: 'zh-CN',
            timezone: 'Asia/Shanghai',
            surface: 'editor',
          },
        }),
      })

      expect(exportResponse.status).toBe(200)
      const events = (await exportResponse.text()).trim().split('\n').map((line) => JSON.parse(line))
      const readyEvent = events.find((event) => event.type === 'pptx_export_ready')
      expect(readyEvent).toEqual(expect.objectContaining({
        artifactRef: expect.objectContaining({
          fileName: 'export.pptx',
        }),
        downloadUrl: expect.stringContaining('/api/agent/sessions/session-pptx-export/artifacts/'),
      }))

      const downloadResponse = await fetch(`${address}${readyEvent.downloadUrl}`, {
        headers: {
          'x-ppt-tenant-id': 'tenant-a',
          'x-ppt-user-id': 'user-a',
        },
      })
      expect(downloadResponse.status).toBe(200)
      expect(downloadResponse.headers.get('content-type')).toContain('application/vnd.openxmlformats-officedocument.presentationml.presentation')
      expect(Buffer.from(await downloadResponse.arrayBuffer())).toEqual(Buffer.from('pptx bytes'))

      const blockedResponse = await fetch(`${address}${readyEvent.downloadUrl}`, {
        headers: {
          'x-ppt-tenant-id': 'tenant-a',
          'x-ppt-user-id': 'user-b',
        },
      })
      expect(blockedResponse.status).toBe(404)
    } finally {
      await server.close()
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('reuses conversation state for the same session and isolates different sessions', async () => {
    const seenConversationIds: Array<string | null> = []
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn(request) {
          seenConversationIds.push(request.conversationId)
          yield createAssistantDoneEvent('ready')
          yield createCandidateEvent('candidate-1')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const body = JSON.stringify(createRequest('session-a'))

      await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createRequest('session-b')),
      })
    } finally {
      await server.close()
    }

    expect(seenConversationIds[0]).toBeNull()
    expect(seenConversationIds[1]).not.toBeNull()
    expect(seenConversationIds[2]).toBeNull()
  })

  it('streams assistant and candidate events as ndjson', async () => {
    const server = createAiServer({
      store: new InMemorySessionStore(),
      agent: {
        async *runTurn() {
          yield { type: 'assistant_delta', text: 'Planning' } satisfies AgentTurnEvent
          yield createAssistantDoneEvent('Planning complete')
          yield createCandidateEvent('candidate-42')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const response = await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createRequest('session-stream')),
      })

      expect(response.status).toBe(200)
      const body = await response.text()
      const events = body
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as AgentTurnEvent)

      expect(events).toEqual([
        { type: 'assistant_delta', text: 'Planning' },
        { type: 'assistant_done', text: 'Planning complete' },
        expect.objectContaining({
          type: 'candidate_ready',
          candidateId: 'candidate-42',
        }),
        { type: 'done' },
      ])
    } finally {
      await server.close()
    }
  })

  it('lists the available agent skills', async () => {
    const server = createAiServer({
      store: new InMemorySessionStore(),
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const response = await fetch(`${address}/api/agent/skills`)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        skills: expect.arrayContaining([
          expect.objectContaining({
            id: 'html_ppt',
            label: 'HTML PPT',
            workflow: 'html_agent',
          }),
          expect.objectContaining({
            id: 'general_edit',
            label: '通用改写',
          }),
          expect.objectContaining({
            id: 'research_refresh',
            label: '研究补全',
          }),
        ]),
      })
    } finally {
      await server.close()
    }
  })

  it('stores the latest candidate snapshot for session restore', async () => {
    const server = createAiServer({
      store: new InMemorySessionStore(),
      agent: {
        async *runTurn() {
          yield { type: 'status', phase: 'searching', label: '正在联网搜索' } satisfies AgentTurnEvent
          yield createAssistantDoneEvent('Planning complete')
          yield createCandidateEvent('candidate-restore')
        },
      },
    })

    const address = await server.listen(0)

    try {
      await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createRequest('session-restore')),
      })

      const response = await fetch(`${address}/api/agent/sessions/session-restore/snapshot`)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        sessionId: 'session-restore',
        snapshot: expect.objectContaining({
          lastAssistantText: 'Planning complete',
          candidate: expect.objectContaining({
            candidateId: 'candidate-restore',
          }),
        }),
      })
    } finally {
      await server.close()
    }
  })

  it('stores pending input state and reuses its response id as the next conversation id', async () => {
    const seenConversationIds: Array<string | null> = []
    let turnCount = 0
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn(request) {
          seenConversationIds.push(request.conversationId)
          turnCount += 1

          if (turnCount === 1) {
            yield createAssistantDoneEvent('Need clarification')
            yield {
              type: 'input_required',
              kind: 'text',
              inputId: 'input-clarify-1',
              responseId: 'response-clarify-1',
              title: 'Clarify',
              prompt: 'Which direction should I emphasize?',
              submitLabel: 'Send answer',
            } satisfies AgentTurnEvent
            return
          }

          yield createAssistantDoneEvent('Continuing with the clarified direction')
          yield createCandidateEvent('candidate-after-clarify')
        },
      },
    })

    const address = await server.listen(0)

    try {
      await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createRequest('session-awaiting-input')),
      })

      const snapshotResponse = await fetch(`${address}/api/agent/sessions/session-awaiting-input/snapshot`)
      expect(snapshotResponse.status).toBe(200)
      expect(await snapshotResponse.json()).toEqual({
        sessionId: 'session-awaiting-input',
        snapshot: expect.objectContaining({
          lastAssistantText: 'Need clarification',
          pendingInput: expect.objectContaining({
            inputId: 'input-clarify-1',
            responseId: 'response-clarify-1',
          }),
        }),
      })

      await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...createRequest('session-awaiting-input'),
          inputReply: {
            inputId: 'input-clarify-1',
            answers: [
              {
                questionId: 'reply',
                value: 'timeline',
                text: 'Focus on the launch timeline.',
              },
            ],
          },
        }),
      })
    } finally {
      await server.close()
    }

    expect(seenConversationIds).toEqual([null, 'response-clarify-1'])
  })

  it('stores html-ppt state in the session snapshot for continuation requests', async () => {
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn(request) {
          expect(request.sessionSnapshot).toBeNull()
          yield createAssistantDoneEvent('我会按这个方向继续生成演示。')
          yield {
            type: 'html_candidate_ready',
            candidateId: 'candidate-html-stateful',
            summary: '已生成一份 html-ppt 风格的 HTML 候选。',
            html: '<!doctype html><html><head><title>Nova AI</title></head><body><section class="slide"><h1>Nova AI</h1></section></body></html>',
            previewMeta: {
              title: 'Nova AI',
              slideCount: 1,
              generatedSlideCount: 1,
              targetSlideCount: 6,
              isPartial: true,
            },
            sources: [],
            runMeta: {
              skillId: 'html_ppt',
              model: 'MiniMax-M2.7',
              usedWebSearch: false,
              searchMode: 'off',
            },
          } satisfies AgentTurnEvent
        },
      },
    })

    const address = await server.listen(0)

    try {
      await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...createRequest('session-html-ppt-state'),
          skillId: 'html_ppt',
          message: '生成一份 Nova AI 产品发布演示',
          htmlPpt: defaultHtmlPptBrief,
          inputReply: {
            inputId: 'input-fs-1',
            answers: [
              {
                questionId: 'product_basics',
                value: 'defined',
                text: 'Nova AI，一款面向企业客服团队的 AI 智能客服平台',
              },
            ],
          },
        }),
      })

      const response = await fetch(`${address}/api/agent/sessions/session-html-ppt-state/snapshot`)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        sessionId: 'session-html-ppt-state',
        snapshot: expect.objectContaining({
          htmlPptState: expect.objectContaining({
            initialMessage: '生成一份 Nova AI 产品发布演示',
            targetSlideCount: 6,
            htmlPpt: expect.objectContaining({
              themeName: 'tokyo-night',
              fullDeckName: 'tech-sharing',
            }),
            lastInputReply: expect.objectContaining({
              inputId: 'input-fs-1',
            }),
          }),
        }),
      })
    } finally {
      await server.close()
    }
  })

  it('streams input_required events when a form question contains a nullable freeTextLabel', async () => {
    const server = createAiServer({
      store: new InMemorySessionStore(),
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('Need a few details')
          yield {
            type: 'input_required',
            kind: 'form',
            inputId: 'input-form-nullable',
            responseId: 'response-form-nullable',
            title: 'Presentation Context',
            submitLabel: 'Continue',
            questions: [
              {
                id: 'purpose',
                header: 'Purpose',
                question: 'What is this presentation for?',
                allowFreeText: false,
                freeTextLabel: null,
                options: [
                  {
                    value: 'pitch',
                    label: 'Pitch deck',
                    description: 'Selling an idea, product, or company.',
                  },
                ],
              },
            ],
          } satisfies AgentTurnEvent
        },
      },
    })

    const address = await server.listen(0)

    try {
      const response = await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createRequest('session-form-nullable')),
      })

      const body = await response.text()
      const events = body
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as AgentTurnEvent)

      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'input_required',
          kind: 'form',
        }),
      ]))
      expect(events).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'error',
        }),
      ]))
    } finally {
      await server.close()
    }
  })

  it('returns html-ppt style previews from the dedicated endpoint', async () => {
    const server = createAiServer({
      store: new InMemorySessionStore(),
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const response = await fetch(`${address}/api/agent/html-ppt/style-previews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: '生成一份 AI 发布演示',
          htmlPpt: defaultHtmlPptBrief,
        }),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        previews: expect.arrayContaining([
          expect.objectContaining({
            presetId: 'bold_signal',
            name: 'Bold Signal',
          }),
        ]),
      })
    } finally {
      await server.close()
    }
  })

  it('returns embedded and beautiful html-ppt template previews from the dedicated endpoint', async () => {
    const server = createAiServer({
      store: new InMemorySessionStore(),
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const response = await fetch(`${address}/api/agent/html-ppt/template-previews`)

      expect(response.status).toBe(200)
      const data = await response.json() as { previewMap: Record<string, string> }
      expect(data.previewMap['pitch-deck']).toContain('pitch-deck Preview')
      expect(data.previewMap['soft-editorial']).toContain('soft-editorial Preview')
      expect(data.previewMap['blue-professional']).toContain('blue-professional Preview')
    } finally {
      await server.close()
    }
  }, 10_000)

  it('returns guide preview assets through filtered lightweight endpoints', async () => {
    const server = createAiServer({
      store: new InMemorySessionStore(),
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const sharedResponse = await fetch(`${address}/api/agent/html-ppt/guide-preview-shared-css`)
      expect(sharedResponse.status).toBe(200)
      const shared = await sharedResponse.json() as {
        baseCSS: string
        fontsCSS: string
        animationsCSS: string
        runtimeJS: string
      }
      expect(shared.baseCSS).toContain('.slide')
      expect(shared.fontsCSS).toContain('@import')
      expect(shared.animationsCSS).toContain('@keyframes')
      expect(shared.runtimeJS).toContain('runtime.js')

      const themeResponse = await fetch(`${address}/api/agent/html-ppt/css/themes-lite?names=tokyo-night,missing-theme`)
      expect(themeResponse.status).toBe(200)
      const themeData = await themeResponse.json() as { themeMap: Record<string, string> }
      expect(Object.keys(themeData.themeMap)).toEqual(['tokyo-night'])
      expect(themeData.themeMap['tokyo-night']).toContain('tokyo')

      const referenceResponse = await fetch(`${address}/api/agent/html-ppt/oh-my-ppt-style-preview-parts?names=amber-aurora,missing-style`)
      expect(referenceResponse.status).toBe(200)
      const referenceData = await referenceResponse.json() as { previewMap: Record<string, string> }
      expect(Object.keys(referenceData.previewMap)).toEqual(['amber-aurora'])
      expect(referenceData.previewMap['amber-aurora']).toContain('扁豆紫蜜陀僧')
    } finally {
      await server.close()
    }
  }, 10_000)

  it('disables host filesystem scanning for html-ppt assets', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'ppt-fs-assets-'))
    const server = createAiServer({
      store: new InMemorySessionStore(),
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const response = await fetch(`${address}/api/agent/html-ppt/assets/scan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageFolderPath: tempDir,
        }),
      })

      expect(response.status).toBe(410)
      expect(await response.json()).toEqual({
        error: 'host_path_scanning_disabled',
      })
    } finally {
      await server.close()
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('rejects session snapshot reads from a different user identity', async () => {
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('ready')
          yield createCandidateEvent('candidate-owned')
        },
      },
    })

    const address = await server.listen(0)

    try {
      await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ppt-tenant-id': 'tenant-a',
          'x-ppt-user-id': 'user-a',
        },
        body: JSON.stringify(createRequest('session-owned')),
      })

      const response = await fetch(`${address}/api/agent/sessions/session-owned/snapshot`, {
        headers: {
          'x-ppt-tenant-id': 'tenant-a',
          'x-ppt-user-id': 'user-b',
        },
      })

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({
        error: 'session_not_found',
      })
    } finally {
      await server.close()
    }
  })

  it('registers uploaded assets in session state instead of requiring a host filesystem scan', async () => {
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const uploadResponse = await fetch(`${address}/api/agent/uploads?sessionId=session-upload`, {
        method: 'POST',
        headers: {
          'content-type': 'image/png',
          'x-file-name': 'logo.png',
          'x-ppt-tenant-id': 'tenant-a',
          'x-ppt-user-id': 'user-a',
        },
        body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      })

      expect(uploadResponse.status).toBe(201)
      expect(await uploadResponse.json()).toEqual({
        asset: expect.objectContaining({
          assetId: expect.any(String),
          fileName: 'logo.png',
          contentType: 'image/png',
          ext: '.png',
        }),
      })

      const snapshotResponse = await fetch(`${address}/api/agent/sessions/session-upload/snapshot`, {
        headers: {
          'x-ppt-tenant-id': 'tenant-a',
          'x-ppt-user-id': 'user-a',
        },
      })

      expect(snapshotResponse.status).toBe(200)
      expect(await snapshotResponse.json()).toEqual({
        sessionId: 'session-upload',
        snapshot: expect.objectContaining({
          htmlPptState: expect.objectContaining({
            uploadedAssets: [
              expect.objectContaining({
                assetId: expect.any(String),
                fileName: 'logo.png',
                contentType: 'image/png',
                ext: '.png',
              }),
            ],
          }),
        }),
      })
    } finally {
      await server.close()
    }
  })

  it('extracts text reference content when uploading markdown assets', async () => {
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const uploadResponse = await fetch(`${address}/api/agent/uploads?sessionId=session-text-reference`, {
        method: 'POST',
        headers: {
          'content-type': 'text/markdown',
          'x-file-name': 'brief.md',
        },
        body: Buffer.from('# Launch Brief\n\nUse the Safety AI positioning and cite the 42% pilot lift.'),
      })

      expect(uploadResponse.status).toBe(201)
      expect(await uploadResponse.json()).toEqual({
        asset: expect.objectContaining({
          fileName: 'brief.md',
          contentType: 'text/markdown',
          referenceText: {
            status: 'extracted',
            excerpt: '# Launch Brief\n\nUse the Safety AI positioning and cite the 42% pilot lift.',
            charCount: 74,
            truncated: false,
          },
        }),
      })

      const snapshotResponse = await fetch(`${address}/api/agent/sessions/session-text-reference/snapshot`)

      expect(snapshotResponse.status).toBe(200)
      expect(await snapshotResponse.json()).toEqual({
        sessionId: 'session-text-reference',
        snapshot: expect.objectContaining({
          htmlPptState: expect.objectContaining({
            uploadedAssets: [
              expect.objectContaining({
                fileName: 'brief.md',
                referenceText: expect.objectContaining({
                  status: 'extracted',
                  excerpt: expect.stringContaining('42% pilot lift'),
                }),
              }),
            ],
          }),
        }),
      })
    } finally {
      await server.close()
    }
  })

  it('decodes gb18030 plain text uploads without garbling chinese content', async () => {
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const uploadResponse = await fetch(`${address}/api/agent/uploads?sessionId=session-gb18030-reference`, {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          'x-file-name': 'quarterly-notes.txt',
        },
        body: Buffer.from('bcbeb6c8b8b4c5cc0ad3aacad5d4f6b3a420343225', 'hex'),
      })

      expect(uploadResponse.status).toBe(201)
      expect(await uploadResponse.json()).toEqual({
        asset: expect.objectContaining({
          fileName: 'quarterly-notes.txt',
          contentType: 'text/plain',
          referenceText: {
            status: 'extracted',
            excerpt: '季度复盘\n营收增长 42%',
            charCount: 13,
            truncated: false,
          },
        }),
      })
    } finally {
      await server.close()
    }
  })

  it('decodes url-encoded upload filenames before saving them', async () => {
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const uploadResponse = await fetch(`${address}/api/agent/uploads?sessionId=session-encoded-name`, {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-file-name': encodeURIComponent('季度复盘.xlsx'),
        },
        body: await createWorkbookBuffer(),
      })

      expect(uploadResponse.status).toBe(201)
      expect(await uploadResponse.json()).toEqual({
        asset: expect.objectContaining({
          fileName: '季度复盘.xlsx',
          ext: '.xlsx',
          referenceText: expect.objectContaining({
            status: 'extracted',
          }),
        }),
      })
    } finally {
      await server.close()
    }
  })

  it('extracts worksheet text when uploading xlsx assets even if the browser omits the mime type', async () => {
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const uploadResponse = await fetch(`${address}/api/agent/uploads?sessionId=session-xlsx-reference`, {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-file-name': 'metrics.xlsx',
        },
        body: await createWorkbookBuffer(),
      })

      expect(uploadResponse.status).toBe(201)
      expect(await uploadResponse.json()).toEqual({
        asset: expect.objectContaining({
          fileName: 'metrics.xlsx',
          ext: '.xlsx',
          referenceText: expect.objectContaining({
            status: 'extracted',
            excerpt: expect.stringContaining('Pipeline'),
            charCount: expect.any(Number),
            truncated: false,
          }),
        }),
      })
    } finally {
      await server.close()
    }
  })

  it('extracts paragraph text when uploading docx assets', async () => {
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const uploadResponse = await fetch(`${address}/api/agent/uploads?sessionId=session-docx-reference`, {
        method: 'POST',
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'x-file-name': 'brief.docx',
        },
        body: await createDocxBuffer(),
      })

      expect(uploadResponse.status).toBe(201)
      expect(await uploadResponse.json()).toEqual({
        asset: expect.objectContaining({
          assetId: expect.any(String),
          fileName: 'brief.docx',
          ext: '.docx',
          referenceText: expect.objectContaining({
            status: 'extracted',
            excerpt: expect.stringContaining('Launch Brief'),
            charCount: expect.any(Number),
            truncated: false,
          }),
          extractedAssets: [
            expect.objectContaining({
              fileName: expect.stringMatching(/^[0-9a-f-]+-brief\.extracted\.txt$/),
              kind: 'full-text',
            }),
          ],
        }),
      })
    } finally {
      await server.close()
    }
  })

  it('marks unsupported binary uploads without text extraction', async () => {
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const uploadResponse = await fetch(`${address}/api/agent/uploads?sessionId=session-binary-reference`, {
        method: 'POST',
        headers: {
          'content-type': 'application/pdf',
          'x-file-name': 'brief.pdf',
        },
        body: Buffer.from('%PDF'),
      })

      expect(uploadResponse.status).toBe(201)
      expect(await uploadResponse.json()).toEqual({
        asset: expect.objectContaining({
          fileName: 'brief.pdf',
          referenceText: expect.objectContaining({
            status: 'unsupported',
            excerpt: '',
            charCount: 0,
            truncated: false,
            reason: '暂不支持提取该文件类型的文字内容。',
          }),
        }),
      })
    } finally {
      await server.close()
    }
  })

  it('keeps pptx uploads as binary references without text extraction', async () => {
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const uploadResponse = await fetch(`${address}/api/agent/uploads?sessionId=session-pptx-reference`, {
        method: 'POST',
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'x-file-name': 'brief.pptx',
        },
        body: Buffer.from('pptx bytes'),
      })

      expect(uploadResponse.status).toBe(201)
      expect(await uploadResponse.json()).toEqual({
        asset: expect.objectContaining({
          fileName: 'brief.pptx',
          referenceText: expect.objectContaining({
            status: 'unsupported',
            excerpt: '',
            charCount: 0,
            truncated: false,
          }),
        }),
      })
    } finally {
      await server.close()
    }
  })

  it('keeps uploaded assets in the session snapshot after a generation turn', async () => {
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn(request) {
          expect(request.sessionSnapshot?.htmlPptState?.uploadedAssets).toEqual([
            expect.objectContaining({
              fileName: 'source.xlsx',
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }),
          ])
          yield createAssistantDoneEvent('ready')
          yield createCandidateEvent('candidate-after-upload')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const uploadResponse = await fetch(`${address}/api/agent/uploads?sessionId=session-upload-retained`, {
        method: 'POST',
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'x-file-name': 'source.xlsx',
        },
        body: Buffer.from('sheet bytes'),
      })
      expect(uploadResponse.status).toBe(201)

      await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createRequest('session-upload-retained')),
      })

      const snapshotResponse = await fetch(`${address}/api/agent/sessions/session-upload-retained/snapshot`)

      expect(snapshotResponse.status).toBe(200)
      expect(await snapshotResponse.json()).toEqual({
        sessionId: 'session-upload-retained',
        snapshot: expect.objectContaining({
          htmlPptState: expect.objectContaining({
            uploadedAssets: [
              expect.objectContaining({
                fileName: 'source.xlsx',
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                ext: '.xlsx',
              }),
            ],
          }),
        }),
      })
    } finally {
      await server.close()
    }
  })

  it('resets conversation state while retaining uploaded assets for the next turn', async () => {
    const seenConversationIds: Array<string | null> = []
    const seenUploadedAssetNames: string[][] = []
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn(request) {
          seenConversationIds.push(request.conversationId)
          seenUploadedAssetNames.push(
            request.sessionSnapshot?.htmlPptState?.uploadedAssets?.map((asset) => asset.fileName) ?? [],
          )
          yield createAssistantDoneEvent('ready')
          yield createCandidateEvent(`candidate-${seenConversationIds.length}`)
        },
      },
    })

    const address = await server.listen(0)

    try {
      const uploadResponse = await fetch(`${address}/api/agent/uploads?sessionId=session-reset`, {
        method: 'POST',
        headers: {
          'content-type': 'application/pdf',
          'x-file-name': 'brief.pdf',
        },
        body: Buffer.from('%PDF'),
      })
      expect(uploadResponse.status).toBe(201)

      await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createRequest('session-reset')),
      })

      const resetResponse = await fetch(`${address}/api/agent/sessions/session-reset/reset`, {
        method: 'POST',
      })
      expect(resetResponse.status).toBe(200)
      expect(await resetResponse.json()).toEqual({ ok: true })

      await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createRequest('session-reset')),
      })
    } finally {
      await server.close()
    }

    expect(seenConversationIds).toEqual([expect.any(String), null])
    expect(seenUploadedAssetNames).toEqual([
      ['brief.pdf'],
      ['brief.pdf'],
    ])
  })

  it('resets conversation state and clears uploaded assets when requested', async () => {
    const seenUploadedAssetNames: string[][] = []
    const store = new InMemorySessionStore()
    const server = createAiServer({
      store,
      agent: {
        async *runTurn(request) {
          seenUploadedAssetNames.push(
            request.sessionSnapshot?.htmlPptState?.uploadedAssets?.map((asset) => asset.fileName) ?? [],
          )
          yield createAssistantDoneEvent('ready')
          yield createCandidateEvent(`candidate-${seenUploadedAssetNames.length}`)
        },
      },
    })

    const address = await server.listen(0)

    try {
      const uploadResponse = await fetch(`${address}/api/agent/uploads?sessionId=session-reset-clear`, {
        method: 'POST',
        headers: {
          'content-type': 'application/pdf',
          'x-file-name': 'brief.pdf',
        },
        body: Buffer.from('%PDF'),
      })
      expect(uploadResponse.status).toBe(201)

      await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createRequest('session-reset-clear')),
      })

      const resetResponse = await fetch(`${address}/api/agent/sessions/session-reset-clear/reset`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          preserveUploadedAssets: false,
        }),
      })
      expect(resetResponse.status).toBe(200)
      expect(await resetResponse.json()).toEqual({ ok: true })

      await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createRequest('session-reset-clear')),
      })
    } finally {
      await server.close()
    }

    expect(seenUploadedAssetNames).toEqual([
      ['brief.pdf'],
      [],
    ])
  })

  it('passes an abort signal to the agent when the client disconnects during a turn', async () => {
    let seenSignal: AbortSignal | undefined
    let aborted = false
    const server = createAiServer({
      store: new InMemorySessionStore(),
      agent: {
        async *runTurn(request) {
          seenSignal = request.abortSignal
          yield { type: 'status', phase: 'drafting', label: 'working' } satisfies AgentTurnEvent

          if (!request.abortSignal) {
            return
          }

          await new Promise<void>((resolve) => {
            request.abortSignal?.addEventListener('abort', () => {
              aborted = true
              resolve()
            })
          })
        },
      },
    })

    const address = await server.listen(0)
    const controller = new AbortController()

    try {
      const response = await fetch(`${address}/api/ai/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createRequest('session-abort')),
        signal: controller.signal,
      })
      const reader = response.body?.getReader()
      await reader?.read()

      controller.abort()
      await waitForCondition(() => aborted)
    } finally {
      await server.close()
    }

    expect(seenSignal).toBeDefined()
    expect(aborted).toBe(true)
  })

  it('requires a valid invite session for protected API routes while leaving health open', async () => {
    const server = createAiServer({
      store: new InMemorySessionStore(),
      inviteGate: createInviteGate({
        inviteCode: 'helloWorld',
        cookieSecret: 'test-cookie-secret',
      }),
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const healthResponse = await fetch(`${address}/api/health`)
      expect(healthResponse.status).toBe(200)
      expect(await healthResponse.json()).toEqual({ ok: true })

      const blockedResponse = await fetch(`${address}/api/agent/skills`)
      expect(blockedResponse.status).toBe(401)
      expect(await blockedResponse.json()).toEqual({ error: 'invite_required' })

      const invalidInviteResponse = await fetch(`${address}/api/invite/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'wrong' }),
      })
      expect(invalidInviteResponse.status).toBe(401)
      expect(invalidInviteResponse.headers.get('set-cookie')).toBeNull()

      const inviteResponse = await fetch(`${address}/api/invite/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'helloWorld' }),
      })
      expect(inviteResponse.status).toBe(200)
      expect(await inviteResponse.json()).toEqual({ ok: true })
      const inviteCookie = inviteResponse.headers.get('set-cookie')
      expect(inviteCookie).toContain('ppt_invite_session=')
      expect(inviteCookie).toContain('HttpOnly')
      expect(inviteCookie).toContain('SameSite=Lax')
      expect(inviteCookie).toContain('Max-Age=259200')

      const allowedResponse = await fetch(`${address}/api/agent/skills`, {
        headers: {
          cookie: inviteCookie ?? '',
        },
      })
      expect(allowedResponse.status).toBe(200)
      expect(await allowedResponse.json()).toEqual({
        skills: expect.arrayContaining([
          expect.objectContaining({
            id: 'html_ppt',
          }),
        ]),
      })
    } finally {
      await server.close()
    }
  })

  it('rejects tampered invite cookies and rate limits repeated failures', async () => {
    const server = createAiServer({
      store: new InMemorySessionStore(),
      inviteGate: createInviteGate({
        inviteCode: 'helloWorld',
        cookieSecret: 'test-cookie-secret',
        maxFailures: 2,
        failureWindowMs: 10_000,
      }),
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const address = await server.listen(0)

    try {
      const tamperedResponse = await fetch(`${address}/api/agent/skills`, {
        headers: {
          cookie: 'ppt_invite_session=tampered',
        },
      })
      expect(tamperedResponse.status).toBe(401)

      for (let index = 0; index < 2; index += 1) {
        const response = await fetch(`${address}/api/invite/session`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: 'wrong' }),
        })
        expect(response.status).toBe(401)
      }

      const limitedResponse = await fetch(`${address}/api/invite/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'wrong' }),
      })
      expect(limitedResponse.status).toBe(429)
      expect(await limitedResponse.json()).toEqual({ error: 'too_many_attempts' })
    } finally {
      await server.close()
    }
  })

  it('serves the invite page instead of app HTML until the browser has an invite cookie', async () => {
    const server = createAiServer({
      store: new InMemorySessionStore(),
      inviteGate: createInviteGate({
        inviteCode: 'helloWorld',
        cookieSecret: 'test-cookie-secret',
      }),
      agent: {
        async *runTurn() {
          yield createAssistantDoneEvent('unused')
          yield createCandidateEvent('candidate-unused')
        },
      },
    })

    const gate = createInviteGate({
      inviteCode: 'helloWorld',
      cookieSecret: 'test-cookie-secret',
    })
    server.app.use(gate.requirePageAuth)
    server.app.get('/app.js', (_request, response) => {
      response.type('application/javascript').send('window.__APP_LOADED__ = true')
    })
    server.app.get('/', (_request, response) => {
      response.type('html').send('<!doctype html><div id="app">React editor app</div><script src="/app.js"></script>')
    })

    const address = await server.listen(0)

    try {
      const blockedPage = await fetch(`${address}/`)
      expect(blockedPage.status).toBe(200)
      expect(await blockedPage.text()).toContain('输入邀请码')

      const blockedAsset = await fetch(`${address}/app.js`)
      const blockedAssetBody = await blockedAsset.text()
      expect(blockedAsset.headers.get('content-type')).toContain('text/html')
      expect(blockedAssetBody).toContain('输入邀请码')
      expect(blockedAssetBody).not.toContain('window.__APP_LOADED__')

      const inviteResponse = await fetch(`${address}/api/invite/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'helloWorld' }),
      })
      const inviteCookie = inviteResponse.headers.get('set-cookie')

      const allowedPage = await fetch(`${address}/`, {
        headers: {
          cookie: inviteCookie ?? '',
        },
      })
      expect(await allowedPage.text()).toContain('React editor app')

      const allowedAsset = await fetch(`${address}/app.js`, {
        headers: {
          cookie: inviteCookie ?? '',
        },
      })
      expect(await allowedAsset.text()).toContain('window.__APP_LOADED__')
    } finally {
      await server.close()
    }
  })

})

function createRequest(sessionId: string): AiTurnRequest {
  const currentDeckHtml = compileDeckDraftToHtml({
    title: 'Current deck',
    theme: {
      accent: '#d95d39',
      background: '#f6efe6',
      text: '#201715',
      muted: '#715f59',
    },
    slides: [
      {
        template: 'title-body',
        title: 'Current',
        eyebrow: 'Deck',
        body: ['Source of truth'],
      },
    ],
  })

  return {
    sessionId,
    documentId: 'document-1',
    message: 'Please revise the deck',
    skillId: 'general_edit',
    currentDeckHtml,
    currentDeckHash: 'hash-1',
    clientContext: {
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      surface: 'editor',
    },
    generationMode: 'from-current',
    inputReply: undefined,
  }
}

function createAssistantDoneEvent(text: string): AgentTurnEvent {
  return {
    type: 'assistant_done',
    text,
  }
}

function createCandidateEvent(candidateId: string): AgentTurnEvent {
  return {
    type: 'candidate_ready',
    candidateId,
    summary: 'Generated a new direction',
    slideMeta: [
      {
        slideId: 'slide-1',
        title: 'Launch',
        nodeCount: 4,
      },
    ],
    deckDraft: {
      title: 'Candidate deck',
      theme: {
        accent: '#d95d39',
        background: '#f6efe6',
        text: '#201715',
        muted: '#715f59',
      },
      slides: [
        {
          template: 'title-body',
          title: 'Launch',
          eyebrow: 'Plan',
          body: ['Refined message'],
        },
      ],
    },
    compiledHtml: compileDeckDraftToHtml({
      title: 'Candidate deck',
      theme: {
        accent: '#d95d39',
        background: '#f6efe6',
        text: '#201715',
        muted: '#715f59',
      },
      slides: [
        {
          template: 'title-body',
          title: 'Launch',
          eyebrow: 'Plan',
          body: ['Refined message'],
        },
      ],
    }),
    sources: [],
    runMeta: {
      skillId: 'general_edit',
      model: 'MiniMax-M2.7',
      usedWebSearch: false,
      searchMode: 'off',
    },
  }
}

async function createWorkbookBuffer(): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`)
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)
  zip.folder('xl')?.file('workbook.xml', `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Summary" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`)
  zip.folder('xl')?.folder('_rels')?.file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`)
  zip.folder('xl')?.file('sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">
  <si><t>Pipeline</t></si>
  <si><t>42%</t></si>
  <si><t>Win Rate</t></si>
  <si><t>18%</t></si>
</sst>`)
  zip.folder('xl')?.folder('worksheets')?.file('sheet1.xml', `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>2</v></c>
      <c r="B2" t="s"><v>3</v></c>
    </row>
  </sheetData>
</worksheet>`)

  return zip.generateAsync({ type: 'nodebuffer' })
}

async function createDocxBuffer(): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Launch Brief</w:t></w:r></w:p>
    <w:p><w:r><w:t>Use Safety AI positioning.</w:t></w:r></w:p>
  </w:body>
</w:document>`)

  return zip.generateAsync({ type: 'nodebuffer' })
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > 1_000) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
