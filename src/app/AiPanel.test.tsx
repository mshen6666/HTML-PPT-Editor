import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AiPanel, type CandidatePreview } from './AiPanel'
import type { AgentTurnEvent } from '../agent/protocol'

describe('AiPanel', () => {
  it('shows layout warnings for HTML candidates', () => {
    render(
      <AiPanel
        {...createBaseProps()}
        activeTab="candidate"
        candidate={createHtmlCandidateWithLayoutWarning()}
      />,
    )

    expect(screen.getByText('布局风险')).toBeInTheDocument()
    expect(screen.getByText('第 1 页文本量可能超出内容高度预算。')).toBeInTheDocument()
  })
})

function createBaseProps(): Parameters<typeof AiPanel>[0] {
  return {
    candidate: null,
    candidatePreviews: [] satisfies CandidatePreview[],
    composerText: '',
    replyText: '',
    pendingInput: null,
    pendingFormAnswers: {},
    uploadedAssets: [],
    pendingMessageImageAssets: [],
    selectedElement: null,
    isElementPickActive: false,
    generationMode: 'from-scratch',
    activeStatus: null,
    activeTab: 'transcript',
    isCompareMode: false,
    isSubmitting: false,
    transcript: [],
    onComposerTextChange: vi.fn(),
    onReplyTextChange: vi.fn(),
    onPendingFormAnswerChange: vi.fn(),
    onTabChange: vi.fn(),
    onUploadAsset: vi.fn(async () => null),
    onUploadMessageImageAsset: vi.fn(async () => undefined),
    onRemoveMessageImageAsset: vi.fn(),
    onStartElementPick: vi.fn(),
    onClearSelectedElement: vi.fn(),
    onGenerationModeChange: vi.fn(),
    onSubmit: vi.fn(async () => undefined),
    onAbortTurn: vi.fn(),
    onClearConversation: vi.fn(async () => undefined),
    onApplyCandidate: vi.fn(),
    onDiscardCandidate: vi.fn(),
    onDownloadHtmlCandidate: vi.fn(),
    onEnterCompareMode: vi.fn(),
    onImportHtmlCandidate: vi.fn(),
    onOptimizePrompt: vi.fn(async () => undefined),
    isOptimizing: false,
    optimizedPrompt: null,
    optimizationExplanation: null,
    onOptimizedPromptChange: vi.fn(),
    onApplyOptimizedPrompt: vi.fn(),
    onDismissOptimization: vi.fn(),
  }
}

function createHtmlCandidateWithLayoutWarning(): Extract<AgentTurnEvent, { type: 'html_candidate_ready' }> {
  return {
    type: 'html_candidate_ready',
    candidateId: 'candidate-layout-warning',
    summary: 'HTML 候选已生成，但可能有页面溢出。',
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
  }
}
