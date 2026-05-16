import { describe, expect, it } from 'vitest'

import { agentTurnEventSchema } from './protocol'

describe('agentTurnEventSchema', () => {
  it('accepts html candidate layout warnings in preview metadata', () => {
    const event = agentTurnEventSchema.parse({
      type: 'html_candidate_ready',
      candidateId: 'candidate-1',
      summary: 'HTML 候选已生成，但部分页面可能溢出。',
      html: '<!doctype html><html><body><section class="slide">Deck</section></body></html>',
      previewMeta: {
        title: 'Deck',
        slideCount: 1,
        generatedSlideCount: 1,
        targetSlideCount: 1,
        isPartial: false,
        layoutWarnings: [
          {
            code: 'dense-text',
            severity: 'warning',
            slideId: 'slide-1',
            slideIndex: 1,
            message: '第 1 页文本量可能超出内容高度预算。',
          },
        ],
      },
      sources: [],
      runMeta: {
        skillId: 'html_ppt',
        model: 'test',
        usedWebSearch: false,
        searchMode: 'off',
      },
    })

    expect(event.type).toBe('html_candidate_ready')
    if (event.type !== 'html_candidate_ready') {
      throw new Error('expected html candidate event')
    }
    expect(event.previewMeta.layoutWarnings).toHaveLength(1)
  })
})
