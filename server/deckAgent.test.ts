// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { compileDeckDraftToHtml } from '../src/agent/deckDraft'
import {
  createConfiguredDeckAgent,
  createMockDeckAgent,
  extractSlideMetaFromHtml,
} from './deckAgent'

const defaultHtmlPptBrief = {
  audience: 'engineers',
  format: 'live',
  themeName: 'tokyo-night',
  fullDeckName: 'tech-sharing',
  includeNotes: true,
  preserveRuntime: true,
  slideCountHint: 10,
} as const

describe('extractSlideMetaFromHtml', () => {
  it('reads slide titles and node counts from compiled candidate html', () => {
    const html = compileDeckDraftToHtml({
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
          body: ['Refined body'],
        },
        {
          template: 'metrics',
          title: 'Traction',
          eyebrow: 'Growth',
          body: ['Usage is trending upward.'],
          metrics: [
            { value: '12k', label: 'Users' },
          ],
        },
      ],
    })

    const meta = extractSlideMetaFromHtml(html)

    expect(meta).toHaveLength(2)
    expect(meta[0].title).toBe('Launch')
    expect(meta[0].slideId).toBeTruthy()
    expect(meta[0].nodeCount).toBeGreaterThanOrEqual(1)
    expect(meta[1].title).toBe('Traction')
  })

  it('falls back to the slide id when no title node is present', () => {
    const html = '<section class="slide" data-slide-id="slide-fallback"></section>'
    const meta = extractSlideMetaFromHtml(html)

    expect(meta).toHaveLength(1)
    expect(meta[0].slideId).toBe('slide-fallback')
    expect(meta[0].title).toBe('slide-fallback')
  })
})

describe('createMockDeckAgent', () => {
  it('returns a deck agent whose runTurn yields candidate events for deck workflow', async () => {
    const agent = createMockDeckAgent()

    const events = []
    for await (const event of agent.runTurn({
      sessionId: 'session-1',
      documentId: 'document-1',
      conversationId: null,
      message: 'Condense the executive summary',
      skillId: 'condense_content',
      currentDeckHtml: '<section class="slide" data-slide-id="s1"></section>',
      currentDeckHash: 'hash-1',
      clientContext: {
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        surface: 'editor',
      },
      generationMode: 'edit',
    })) {
      events.push(event)
    }

    expect(events.some((event) => event.type === 'status')).toBe(true)
    expect(events.some((event) => event.type === 'assistant_done')).toBe(true)

    const candidate = events.find((event) => event.type === 'candidate_ready')
    expect(candidate).toBeDefined()
    expect(candidate).toMatchObject({
      type: 'candidate_ready',
      runMeta: {
        skillId: 'condense_content',
        model: expect.stringContaining('mock:'),
        usedWebSearch: false,
      },
    })
    expect(candidate!.compiledHtml).toContain('data-slide-id')
    expect(candidate!.deckDraft).toBeDefined()
    expect(candidate!.slideMeta).toBeDefined()
  })

  it('uses the from-scratch preamble when generationMode is from-scratch', async () => {
    const agent = createMockDeckAgent()

    const events = []
    for await (const event of agent.runTurn({
      sessionId: 'session-2',
      documentId: 'document-2',
      conversationId: null,
      message: 'Create a brand new deck',
      skillId: 'general_edit',
      currentDeckHtml: '<section class="slide" data-slide-id="s1"></section>',
      currentDeckHash: 'hash-2',
      clientContext: {
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        surface: 'editor',
      },
      generationMode: 'from-scratch',
    })) {
      events.push(event)
    }

    const candidate = events.find((event) => event.type === 'candidate_ready')
    expect(candidate).toBeDefined()
    expect(candidate!.runMeta.model).toContain('mock:')
  })

  it('falls back to mock fallback html for html_agent workflow', async () => {
    const agent = createMockDeckAgent()

    const events = []
    for await (const event of agent.runTurn({
      sessionId: 'session-html',
      documentId: 'document-html',
      conversationId: null,
      message: '生成一份 AI 产品发布演示',
      skillId: 'html_ppt',
      currentDeckHtml: '<section class="slide" data-slide-id="s1"></section>',
      currentDeckHash: 'hash-html',
      clientContext: {
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        surface: 'editor',
      },
      generationMode: 'from-scratch',
      htmlPpt: defaultHtmlPptBrief,
    })) {
      events.push(event)
    }

    expect(events.some((event) => event.type === 'status')).toBe(true)
    expect(events.some((event) => event.type === 'assistant_done')).toBe(true)
    expect(events.some((event) => event.type === 'input_required')).toBe(true)
  })

  it('generates fallback html candidate for html_agent workflow with input reply', async () => {
    const agent = createMockDeckAgent()

    const events = []
    for await (const event of agent.runTurn({
      sessionId: 'session-html-reply',
      documentId: 'document-html-reply',
      conversationId: null,
      message: '生成一份 AI 产品发布演示',
      skillId: 'html_ppt',
      currentDeckHtml: '<section class="slide" data-slide-id="s1"></section>',
      currentDeckHash: 'hash-html-reply',
      clientContext: {
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        surface: 'editor',
      },
      generationMode: 'from-scratch',
      htmlPpt: defaultHtmlPptBrief,
      inputReply: {
        inputId: 'mock-html-ppt-input',
        answers: [
          { questionId: 'audience', value: 'engineers', text: 'Engineers' },
          { questionId: 'themeName', value: 'tokyo-night', text: 'tokyo-night' },
          { questionId: 'fullDeckName', value: 'tech-sharing', text: 'tech-sharing' },
          { questionId: 'format', value: 'live', text: 'Live presentation' },
        ],
      },
    })) {
      events.push(event)
    }

    const candidate = events.find((event) => event.type === 'html_candidate_ready')
    expect(candidate).toBeDefined()
    expect(candidate!.html).toBeTruthy()
    expect(candidate!.html).toContain('data-slide-id')
    expect(candidate!.runMeta.model).toContain('mock:')
  })

  it('generates fallback html for html_agent extend_remaining operation', async () => {
    const agent = createMockDeckAgent()
    const existingHtml = Array.from({ length: 5 }, (_, i) =>
      `<section class="slide" data-slide-id="s${i + 1}"><div data-node-id="n${i + 1}-title" data-edit-kind="text"><h1>Slide ${i + 1}</h1></div></section>`
    ).join('\n')

    const events = []
    for await (const event of agent.runTurn({
      sessionId: 'session-extend',
      documentId: 'document-extend',
      conversationId: null,
      message: '继续补齐到 10 页',
      skillId: 'html_ppt',
      currentDeckHtml: existingHtml,
      currentDeckHash: 'hash-extend',
      currentSlideCount: 5,
      clientContext: {
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        surface: 'editor',
      },
      generationMode: 'from-scratch',
      htmlPpt: defaultHtmlPptBrief,
      htmlAgentOperation: 'extend_remaining',
    })) {
      events.push(event)
    }

    const candidate = events.find((event) => event.type === 'html_candidate_ready')
    expect(candidate).toBeDefined()
    expect(candidate!.html).toBeTruthy()
    expect(candidate!.previewMeta.targetSlideCount).toBe(10)
    expect(candidate!.previewMeta.isPartial).toBe(true)
  })

  it('extracts slide count hint from message text', async () => {
    const agent = createMockDeckAgent()

    const events = []
    for await (const event of agent.runTurn({
      sessionId: 'session-count',
      documentId: 'document-count',
      conversationId: null,
      message: '帮我生成 8 页的演示',
      skillId: 'html_ppt',
      currentDeckHtml: '<section class="slide" data-slide-id="s1"></section>',
      currentDeckHash: 'hash-count',
      clientContext: {
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        surface: 'editor',
      },
      generationMode: 'from-scratch',
      htmlPpt: defaultHtmlPptBrief,
    })) {
      events.push(event)
    }

    const inputRequired = events.find((event) => event.type === 'input_required')
    expect(inputRequired).toBeDefined()
  })

  it('uses slideCountHint from htmlPpt brief when message has no count', async () => {
    const agent = createMockDeckAgent()

    const events = []
    for await (const event of agent.runTurn({
      sessionId: 'session-hint',
      documentId: 'document-hint',
      conversationId: null,
      message: '生成演示',
      skillId: 'html_ppt',
      currentDeckHtml: '<section class="slide" data-slide-id="s1"></section>',
      currentDeckHash: 'hash-hint',
      clientContext: {
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        surface: 'editor',
      },
      generationMode: 'from-scratch',
      htmlPpt: {
        ...defaultHtmlPptBrief,
        slideCountHint: 15,
      },
    })) {
      events.push(event)
    }

    const inputRequired = events.find((event) => event.type === 'input_required')
    expect(inputRequired).toBeDefined()
  })
})

describe('createConfiguredDeckAgent', () => {
  it('creates a deck agent using the default factory', () => {
    const agent = createConfiguredDeckAgent({
      startSandboxJanitor: false,
    })

    expect(agent).toBeDefined()
  })

  it('uses the provided deckAgentFactory when supplied', () => {
    let factoryCalled = false

    const agent = createConfiguredDeckAgent({
      deckAgentFactory() {
        factoryCalled = true
        return createMockDeckAgent()
      },
      startSandboxJanitor: false,
    })

    expect(agent).toBeDefined()
    expect(factoryCalled).toBe(true)
  })
})
