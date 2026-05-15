import { describe, expect, it } from 'vitest'

import {
  compileDeckDraftToHtml,
  deckDraftSchema,
  summarizeDeckHtmlForPrompt,
} from './deckDraft'
import { createDeckDocument, parseControlledDeck } from '../deck-contract/deckContract'

describe('deckDraftSchema', () => {
  it('rejects unsupported slide templates', () => {
    const result = deckDraftSchema.safeParse({
      title: 'Unsupported',
      theme: {
        accent: '#d95d39',
        background: '#f6efe6',
        text: '#201715',
        muted: '#715f59',
      },
      slides: [
        {
          template: 'freeform',
          title: 'Nope',
          eyebrow: 'bad',
          body: ['bad'],
        },
      ],
    })

    expect(result.success).toBe(false)
  })
})

describe('compileDeckDraftToHtml', () => {
  it('compiles a structured draft into a controlled editable deck and escapes plain text content', () => {
    const html = compileDeckDraftToHtml({
      title: 'AI deck',
      theme: {
        accent: '#d95d39',
        background: '#f6efe6',
        text: '#201715',
        muted: '#715f59',
      },
      slides: [
        {
          template: 'title-body',
          title: 'Launch <Soon>',
          eyebrow: 'Roadmap',
          body: ['First line', 'Second & safer line'],
        },
        {
          template: 'image-focus',
          title: 'Visual',
          body: ['Image placeholder'],
          image: {
            alt: 'Abstract preview',
            prompt: 'abstract product launch',
          },
        },
      ],
    })

    const deck = parseControlledDeck(createDeckDocument(html))

    expect(deck.slideOrder).toEqual(['slide-1', 'slide-2'])
    expect(deck.nodes['slide-1-title']).toMatchObject({
      kind: 'text',
      html: 'Launch &lt;Soon&gt;',
    })
    expect(deck.nodes['slide-1-body']).toMatchObject({
      kind: 'text',
    })
    expect(deck.nodes['slide-2-image']).toMatchObject({
      kind: 'image',
      image: {
        alt: 'Abstract preview',
      },
    })
    expect(html).toContain('data-fs-editable-deck="1"')
    expect(html).toContain('Second &amp; safer line')
  })
})

describe('summarizeDeckHtmlForPrompt', () => {
  it('summarizes slides and editable nodes from the current editor html', () => {
    const html = compileDeckDraftToHtml({
      title: 'Summary deck',
      theme: {
        accent: '#d95d39',
        background: '#f6efe6',
        text: '#201715',
        muted: '#715f59',
      },
      slides: [
        {
          template: 'metrics',
          title: 'KPIs',
          eyebrow: 'Q2',
          metrics: [
            { label: 'Pipeline', value: '42%' },
            { label: 'Win rate', value: '18%' },
          ],
          body: ['Short summary'],
        },
      ],
    })

    expect(summarizeDeckHtmlForPrompt(html)).toContain('slide-1')
    expect(summarizeDeckHtmlForPrompt(html)).toContain('slide-1-metric-1')
    expect(summarizeDeckHtmlForPrompt(html)).toContain('Pipeline')
  })
})
