import { type ChangeEvent, type FormEvent, type ReactElement, useRef, useState } from 'react'

import type { AgentTurnEvent, HtmlPptAsset, PendingInput } from '../agent/protocol'
import type { PendingFormAnswer } from './useAgentSession'

type TranscriptEntry = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

type CandidateEvent =
  | Extract<AgentTurnEvent, { type: 'candidate_ready' }>
  | Extract<AgentTurnEvent, { type: 'html_candidate_ready' }>

type AgentDrawerTab = 'transcript' | 'candidate'

export type CandidatePreview = {
  id: string
  title: string
  detail: string
  srcDoc: string
}

type AiPanelProps = {
  candidate: CandidateEvent | null
  candidatePreviews: CandidatePreview[]
  composerText: string
  replyText: string
  pendingInput: PendingInput | null
  pendingFormAnswers: Record<string, PendingFormAnswer>
  uploadedAssets: HtmlPptAsset[]
  pendingMessageImageAssets: HtmlPptAsset[]
  selectedElement: {
    slideId: string
    selector: string
    elementTag?: string
    elementText?: string
  } | null
  isElementPickActive: boolean
  generationMode: 'from-scratch' | 'from-current'
  activeStatus: string | null
  activeTab: AgentDrawerTab
  isCompareMode: boolean
  isSubmitting: boolean
  transcript: TranscriptEntry[]
  onComposerTextChange: (value: string) => void
  onReplyTextChange: (value: string) => void
  onPendingFormAnswerChange: (questionId: string, value: PendingFormAnswer) => void
  onTabChange: (tab: AgentDrawerTab) => void
  onUploadAsset: (file: File) => Promise<unknown>
  onUploadMessageImageAsset: (file: File) => Promise<void>
  onRemoveMessageImageAsset: (assetKey: string) => void
  onStartElementPick: () => void
  onClearSelectedElement: () => void
  onGenerationModeChange: (value: 'from-scratch' | 'from-current') => void
  onSubmit: () => Promise<void>
  onAbortTurn: () => void
  onClearConversation: () => Promise<void>
  onApplyCandidate: () => void
  onDiscardCandidate: () => void
  onDownloadHtmlCandidate: () => void
  onEnterCompareMode: () => void
  onImportHtmlCandidate: () => void
  onOptimizePrompt: () => Promise<void>
  isOptimizing: boolean
  optimizedPrompt: string | null
  optimizationExplanation: string | null
  onOptimizedPromptChange: (value: string) => void
  onApplyOptimizedPrompt: () => void
  onDismissOptimization: () => void
}

const TABS: Array<{ id: AgentDrawerTab; label: string }> = [
  { id: 'transcript', label: '对话记录' },
  { id: 'candidate', label: '候选' },
]

const MODE_OPTIONS: Array<{
  value: 'from-scratch' | 'from-current'
  label: string
  description: string
}> = [
  {
    value: 'from-scratch',
    label: '从零生成',
    description: '从空白结构开始生成一套新演示',
  },
  {
    value: 'from-current',
    label: '对话修改当前演示',
    description: '围绕当前页面内容继续改写和迭代',
  },
]

export function AiPanel({
  candidate,
  candidatePreviews,
  composerText,
  replyText,
  pendingInput,
  pendingFormAnswers,
  uploadedAssets,
  pendingMessageImageAssets,
  selectedElement,
  isElementPickActive,
  generationMode,
  activeStatus,
  activeTab,
  isCompareMode,
  isSubmitting,
  transcript,
  onComposerTextChange,
  onReplyTextChange,
  onPendingFormAnswerChange,
  onTabChange,
  onUploadAsset,
  onUploadMessageImageAsset,
  onRemoveMessageImageAsset,
  onStartElementPick,
  onClearSelectedElement,
  onGenerationModeChange,
  onSubmit,
  onAbortTurn,
  onClearConversation,
  onApplyCandidate,
  onDiscardCandidate,
  onDownloadHtmlCandidate,
  onEnterCompareMode,
  onImportHtmlCandidate,
  onOptimizePrompt,
  isOptimizing,
  optimizedPrompt,
  optimizationExplanation,
  onOptimizedPromptChange,
  onApplyOptimizedPrompt,
  onDismissOptimization,
}: AiPanelProps): ReactElement {
  const assetInputRef = useRef<HTMLInputElement | null>(null)
  const imageAssetInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const hasComposerText = Boolean(composerText.trim())
  const pendingImageAssetKeys = new Set(pendingMessageImageAssets.map((asset) => asset.assetId ?? asset.fileName))
  const referenceAssets = uploadedAssets.filter((asset) => !pendingImageAssetKeys.has(asset.assetId ?? asset.fileName))
  const selectedAsset =
    referenceAssets.find((asset) => (asset.assetId ?? asset.fileName) === selectedAssetId)
    ?? referenceAssets[0]
    ?? null
  const submitLabel = pendingInput
    ? pendingInput.submitLabel ?? '发送回答'
    : isSubmitting
      ? (hasComposerText ? '发送新指令' : '生成中…')
      : '生成候选'
  const isSubmitDisabled = pendingInput
    ? !isPendingInputReady(pendingInput, replyText, pendingFormAnswers)
    : !hasComposerText
  const statusLabel = activeStatus ?? (isSubmitting ? '生成中…' : candidate ? '候选已生成' : '待命')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void onSubmit()
  }

  function handleAssetUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) {
      return
    }

    void onUploadAsset(file).finally(() => {
      input.value = ''
    })
  }

  function handleClearConversation() {
    if (!window.confirm('这会清除当前对话记录并重置智能体上下文，但会保留已上传参考资料。是否继续？')) {
      return
    }

    void onClearConversation()
  }

  function handleImageAssetUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) {
      return
    }

    void onUploadMessageImageAsset(file).finally(() => {
      input.value = ''
    })
  }

  function renderCandidatePrimaryActions(): ReactElement {
    if (!candidate) {
      return <></>
    }

    if (candidate.type === 'candidate_ready') {
      return (
        <>
          <button type="button" onClick={onApplyCandidate}>应用草稿</button>
          <button type="button" className="secondary-action" onClick={onDiscardCandidate}>丢弃草稿</button>
        </>
      )
    }

    return (
      <>
        {!isCompareMode ? (
          <button type="button" onClick={onEnterCompareMode}>进入对比模式</button>
        ) : null}
        <button type="button" className="secondary-action" onClick={onImportHtmlCandidate}>导入编辑器</button>
        <button type="button" className="secondary-action" onClick={onDownloadHtmlCandidate}>下载 HTML 候选</button>
        <button type="button" className="secondary-action" onClick={onDiscardCandidate}>丢弃草稿</button>
      </>
    )
  }

  return (
    <aside className="ai-panel agent-panel" aria-label="智能体">
      <div className="panel-header agent-drawer-header">
        <div className="agent-drawer-titleblock">
          <p className="eyebrow">智能体</p>
          <h2>智能体</h2>
        </div>
        <div className="agent-drawer-header-actions">
          <span className="agent-drawer-status-chip">{statusLabel}</span>
        </div>
      </div>

      <form className="ai-composer agent-compose-form" onSubmit={handleSubmit}>
        <section className="agent-workbench">
          <div className="agent-toolbar agent-workbench-toolbar">
            <fieldset className="agent-mode-group" aria-label="生成模式">
              <legend className="agent-mode-legend">生成模式</legend>
              <div className="agent-mode-options">
                {MODE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={generationMode === option.value ? 'agent-mode-option is-active' : 'agent-mode-option'}
                  >
                    <input
                      aria-label={option.label}
                      checked={generationMode === option.value}
                      name="generation-mode"
                      type="radio"
                      onChange={() => onGenerationModeChange(option.value)}
                    />
                    <span className="agent-mode-option-label">{option.label}</span>
                    <small>{option.description}</small>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="agent-utility-row">
              <button
                type="button"
                className={isElementPickActive ? 'secondary-action agent-reference-button is-active' : 'secondary-action agent-reference-button'}
                onClick={onStartElementPick}
              >
                {isElementPickActive ? '拣选中…' : '拣选元素'}
              </button>
              <button
                type="button"
                className="secondary-action agent-reference-button"
                onClick={() => imageAssetInputRef.current?.click()}
              >
                {pendingMessageImageAssets.length ? `图片素材 · ${pendingMessageImageAssets.length}` : '上传图片'}
              </button>
              <button
                type="button"
                className="secondary-action agent-reference-button"
                onClick={() => assetInputRef.current?.click()}
              >
                {referenceAssets.length ? `参考资料 · ${referenceAssets.length}` : '参考资料'}
              </button>
            </div>
          </div>

          <input
            ref={assetInputRef}
            aria-label="上传参考资料"
            className="agent-upload-input"
            type="file"
            onChange={handleAssetUpload}
          />
          <input
            ref={imageAssetInputRef}
            aria-label="上传图片素材"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="agent-upload-input"
            type="file"
            onChange={handleImageAssetUpload}
          />
          {selectedElement ? (
            <div className="agent-selected-element" aria-label="已拣选元素">
              <span>已拣选元素</span>
              <strong>{formatSelectedElement(selectedElement)}</strong>
              <button type="button" className="agent-chip-remove" onClick={onClearSelectedElement}>
                移除
              </button>
            </div>
          ) : null}
          {pendingMessageImageAssets.length ? (
            <div className="agent-asset-list" aria-label="本次消息图片素材">
              {pendingMessageImageAssets.map((asset) => {
                const assetKey = asset.assetId ?? asset.fileName
                return (
                  <button
                    key={assetKey}
                    type="button"
                    className="agent-asset-chip is-active"
                    onClick={() => onRemoveMessageImageAsset(assetKey)}
                  >
                    <strong>{asset.fileName}</strong>
                    <span>{asset.contentType ?? asset.ext}</span>
                    <span>点击移除</span>
                  </button>
                )
              })}
            </div>
          ) : null}
          {referenceAssets.length ? (
            <div className="agent-asset-list" aria-label="已上传参考资料">
              {referenceAssets.map((asset) => (
                <button
                  key={asset.assetId ?? asset.fileName}
                  type="button"
                  className={
                    (asset.assetId ?? asset.fileName) === (selectedAsset?.assetId ?? selectedAsset?.fileName)
                      ? 'agent-asset-chip is-active'
                      : 'agent-asset-chip'
                  }
                  onClick={() => setSelectedAssetId(asset.assetId ?? asset.fileName)}
                >
                  <strong>{asset.fileName}</strong>
                  <span>{asset.contentType ?? asset.ext}</span>
                  <span>{formatReferenceTextStatus(asset)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {selectedAsset?.referenceText ? (
            <div className="agent-reference-preview">
              <div className="agent-reference-preview-header">
                <strong>文字预览</strong>
                <span>{formatReferenceTextStatus(selectedAsset)}</span>
              </div>
              {selectedAsset.referenceText.status === 'extracted' && selectedAsset.referenceText.excerpt.trim() ? (
                <pre>{selectedAsset.referenceText.excerpt}</pre>
              ) : (
                <p>{selectedAsset.referenceText.reason ?? '该文件暂无可预览文字。'}</p>
              )}
            </div>
          ) : null}

          {pendingInput ? (
            <div className="agent-compose-card">
              <div className="field agent-compose-field">
                <span>{pendingInput.title}</span>
                {pendingInput.kind === 'text' ? (
                  <>
                    <p>{pendingInput.prompt}</p>
                    <textarea
                      aria-label="继续回答智能体"
                      placeholder="继续回答智能体"
                      value={replyText}
                      onChange={(event) => onReplyTextChange(event.target.value)}
                    />
                  </>
                ) : (
                  <div className="agent-questionnaire">
                    {pendingInput.questions.map((question) => {
                      const answer = pendingFormAnswers[question.id] ?? { value: '', text: '' }
                      const showFreeText = Boolean(question.allowFreeText && answer.value === 'other')

                      return (
                        <fieldset key={question.id} className="agent-question-group">
                          <legend>{question.header}</legend>
                          <p>{question.question}</p>
                          <div className="agent-question-options">
                            {question.options.map((option) => (
                              <label key={option.value} className="agent-question-option">
                                <input
                                  type="radio"
                                  name={question.id}
                                  checked={answer.value === option.value}
                                  onChange={() =>
                                    onPendingFormAnswerChange(question.id, {
                                      value: option.value,
                                      text: option.value === 'other' ? answer.text : '',
                                    })}
                                />
                                <span>{option.label}</span>
                                <small>{option.description}</small>
                              </label>
                            ))}
                          </div>
                          {showFreeText ? (
                            <label className="field">
                              <span>{question.freeTextLabel ?? '补充内容'}</span>
                              <input
                                aria-label={question.freeTextLabel ?? '补充内容'}
                                type="text"
                                value={answer.text}
                                onChange={(event) =>
                                  onPendingFormAnswerChange(question.id, {
                                    value: answer.value,
                                    text: event.target.value,
                                  })}
                              />
                            </label>
                          ) : null}
                        </fieldset>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="field agent-compose-field agent-compose-primary">
            <div className="agent-compose-heading">
              <label htmlFor="agent-composer-textarea">
                {pendingInput ? '继续描述你的需求' : '给智能体的需求'}
              </label>
              <button
                type="button"
                className="secondary-action"
                disabled={!hasComposerText || isSubmitting || isOptimizing || Boolean(pendingInput)}
                onClick={() => void onOptimizePrompt()}
              >
                {isOptimizing ? '优化中…' : '优化提示词'}
              </button>
            </div>
            <textarea
              id="agent-composer-textarea"
              aria-label="给智能体的需求"
              placeholder="例如：生成一份 10 页产品发布 pitch deck；或继续把当前演示改成更克制的发布叙事。缺失的页数、用途和风格信息会继续追问。"
              value={composerText}
              onChange={(event) => onComposerTextChange(event.target.value)}
              disabled={Boolean(pendingInput)}
            />
          </div>

          {optimizedPrompt !== null ? (
            <div className="agent-optimize-card">
              <p className="eyebrow">优化结果</p>
              <textarea
                aria-label="优化后的提示词"
                value={optimizedPrompt}
                onChange={(event) => onOptimizedPromptChange(event.target.value)}
              />
              {optimizationExplanation ? (
                <p className="agent-optimize-explanation">{optimizationExplanation}</p>
              ) : null}
              <div className="agent-optimize-actions">
                <button type="button" className="secondary-action" onClick={onDismissOptimization}>
                  取消
                </button>
                <button type="button" onClick={onApplyOptimizedPrompt}>
                  使用优化结果
                </button>
              </div>
            </div>
          ) : null}

          {candidate && activeTab !== 'candidate' ? (
            <section className="agent-inline-candidate" aria-label="当前候选摘要">
              <div className="agent-inline-candidate-copy">
                <p className="eyebrow">当前候选</p>
                <h3>{candidate.type === 'candidate_ready' ? '局部草稿已生成' : 'HTML 候选已生成'}</h3>
                <p className="agent-inline-candidate-summary">{candidate.summary}</p>
                <p className="agent-inline-candidate-meta">
                  {candidate.type === 'candidate_ready'
                    ? `共 ${candidate.slideMeta.length} 页局部草稿，可直接应用到当前演示。`
                    : `${candidate.previewMeta.slideCount} 页 HTML 演示，可继续对比、导入或下载。`}
                </p>
              </div>
              <div className="agent-inline-candidate-actions">
                {renderCandidatePrimaryActions()}
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => onTabChange('candidate')}
                >
                  查看候选详情
                </button>
              </div>
            </section>
          ) : null}

          <div className="agent-compose-actions">
            {isSubmitting ? (
              <button type="button" className="secondary-action" onClick={onAbortTurn}>
                终止生成
              </button>
            ) : null}
            <button type="submit" disabled={isSubmitDisabled}>
              {submitLabel}
            </button>
          </div>
        </section>
      </form>

      <div className="agent-drawer-tabs" role="tablist" aria-label="智能体面板标签">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'agent-tab is-active' : 'agent-tab'}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="agent-drawer-panel">
        {activeTab === 'transcript' ? (
          <section className="ai-transcript">
            <div className="ai-transcript-header">
              <div>
                <p className="eyebrow">Transcript</p>
                <h3>对话记录</h3>
              </div>
              <button type="button" className="secondary-action" onClick={handleClearConversation}>
                清除记录
              </button>
            </div>
            <div className="ai-transcript-scroll" data-testid="agent-transcript-scroll">
              {transcript.length ? (
                transcript.map((entry, index) => (
                  <article
                    key={`${entry.id}-${index}`}
                    className={entry.role === 'assistant' ? 'transcript-entry is-assistant' : 'transcript-entry'}
                  >
                    <strong>{entry.role === 'assistant' ? '智能体' : '你'}</strong>
                    <p>{entry.text}</p>
                  </article>
                ))
              ) : (
                <p>这里会展示智能体的过程输出。</p>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === 'candidate' ? (
          candidate ? (
            <section className="candidate-card">
              <div className="candidate-header">
                <p className="eyebrow">Candidate</p>
                <h3>{candidate.summary}</h3>
              </div>

              <div className="candidate-actions candidate-actions-sticky">
                {renderCandidatePrimaryActions()}
              </div>

              {candidate.type === 'candidate_ready' ? (
                <div className="candidate-meta">
                  {candidate.slideMeta.map((slide) => (
                    <div key={slide.slideId} className="candidate-slide">
                      <strong>{slide.title}</strong>
                      <span>{`${slide.nodeCount} 个可编辑节点`}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="candidate-meta">
                  <div className="candidate-slide">
                    <strong>{candidate.previewMeta.title}</strong>
                    <span>{`${candidate.previewMeta.slideCount} 页 HTML 演示`}</span>
                  </div>
                  <p className="candidate-compare-copy">
                    先在这里确认摘要与来源，需要时再进入主工作区对比，不让抽屉被预览占满。
                  </p>
                </div>
              )}

              <p className="candidate-run-meta">
                {candidate.runMeta.usedWebSearch
                  ? `技能：${candidate.runMeta.skillId} · 已联网搜索`
                  : `技能：${candidate.runMeta.skillId}`}
              </p>

              {candidatePreviews.length ? (
                <div className="candidate-preview-grid" aria-label="候选页面预览">
                  {candidatePreviews.map((preview) => (
                    <article key={preview.id} className="candidate-preview-tile" data-testid="candidate-page-preview">
                      <div className="candidate-thumbnail-shell" aria-label={`${preview.title} 缩略预览`}>
                        <iframe
                          className="candidate-thumbnail-preview"
                          data-testid={preview.id === candidatePreviews[0]?.id ? 'candidate-thumbnail-preview' : undefined}
                          sandbox=""
                          title={`${preview.title} thumbnail preview`}
                          srcDoc={preview.srcDoc}
                        />
                      </div>
                      <div className="candidate-preview-caption">
                        <strong>{preview.title}</strong>
                        <span>{preview.detail}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              {candidate.sources.length ? (
                <div className="candidate-sources">
                  {candidate.sources.slice(0, 3).map((source) => (
                    <a key={source.url} className="source-link" href={source.url} target="_blank" rel="noreferrer">
                      <strong>{source.title}</strong>
                      <span>{source.domain}</span>
                    </a>
                  ))}
                  {candidate.sources.length > 3 ? (
                    <span className="source-link candidate-source-more">{`+${candidate.sources.length - 3} 来源`}</span>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : (
            <section className="candidate-card empty-state">
              <p>生成候选后，这里会展示摘要、来源以及进入对比模式的入口。</p>
            </section>
          )
        ) : null}
      </section>
    </aside>
  )
}

function formatReferenceTextStatus(asset: HtmlPptAsset): string {
  const referenceText = asset.referenceText
  if (!referenceText) {
    return typeof asset.sizeBytes === 'number' ? formatBytes(asset.sizeBytes) : '已上传'
  }

  if (referenceText.status === 'extracted') {
    return `已提取 ${referenceText.charCount} 字`
  }

  if (referenceText.status === 'unsupported') {
    return '暂不支持预览'
  }

  return '提取失败'
}

function formatSelectedElement(element: NonNullable<AiPanelProps['selectedElement']>): string {
  const text = element.elementText?.trim()
  const tag = element.elementTag ? `<${element.elementTag}>` : '元素'
  return text ? `${tag} ${text}` : tag
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function isPendingInputReady(
  pendingInput: PendingInput,
  replyText: string,
  pendingFormAnswers: Record<string, PendingFormAnswer>,
): boolean {
  if (pendingInput.kind === 'text') {
    return Boolean(replyText.trim())
  }

  return pendingInput.questions.every((question) => {
    const answer = pendingFormAnswers[question.id]
    if (!answer?.value) {
      return false
    }

    if (question.allowFreeText && answer.value === 'other') {
      return Boolean(answer.text.trim())
    }

    return true
  })
}
