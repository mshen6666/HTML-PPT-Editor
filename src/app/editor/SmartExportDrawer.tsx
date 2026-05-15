import type { ReactElement } from 'react'

import type { PptxExportEvent } from '../../agent/protocol'

export type SmartExportPanelState = 'idle' | 'running' | 'ready' | 'error'

export type SmartExportLogEntry = {
  id: string
  kind: 'status' | 'assistant'
  text: string
}

type SmartExportDrawerProps = {
  state: Exclude<SmartExportPanelState, 'idle'>
  phase: Extract<PptxExportEvent, { type: 'status' }>['phase']
  logs: SmartExportLogEntry[]
  readyEvent?: Extract<PptxExportEvent, { type: 'pptx_export_ready' }>
  error: string | null
  isDownloading: boolean
  onClose: () => void
  onDownload: () => void
  onRetry: () => void
}

export function SmartExportDrawer({
  state,
  phase,
  logs,
  readyEvent,
  error,
  isDownloading,
  onClose,
  onDownload,
  onRetry,
}: SmartExportDrawerProps): ReactElement {
  return (
    <aside
      className="smart-export-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="smart-export-title"
      data-state={state}
    >
      <div className="smart-export-drawer-header">
        <div>
          <p className="eyebrow">PPTX Agent</p>
          <h2 id="smart-export-title">智能导出 PPTX</h2>
        </div>
        <button type="button" className="secondary-action" onClick={onClose}>
          关闭
        </button>
      </div>

      {state === 'running' ? (
        <p className="smart-export-warning">请不要关闭窗口或刷新页面，否则导出会失败。</p>
      ) : null}

      <div className="smart-export-progress" aria-label="智能导出进度">
        {(['queued', 'drafting', 'finalizing'] as const).map((step) => (
          <span
            key={step}
            className={resolveSmartExportStepClassName(step, phase, state)}
          >
            {getSmartExportPhaseLabel(step)}
          </span>
        ))}
      </div>

      {state === 'ready' && readyEvent ? (
        <section className="smart-export-result" aria-live="polite">
          <p className="eyebrow">完成</p>
          <h3>PPTX 已准备好</h3>
          <p>{readyEvent.summary}</p>
          <div className="smart-export-file">
            <strong>{readyEvent.artifactRef.fileName}</strong>
            <span>{formatFileSize(readyEvent.artifactRef.sizeBytes)}</span>
          </div>
          <button type="button" onClick={onDownload} disabled={isDownloading}>
            {isDownloading ? '下载中…' : '下载 PPTX'}
          </button>
        </section>
      ) : null}

      {state === 'error' ? (
        <section className="smart-export-error" aria-live="assertive">
          <p className="eyebrow">失败</p>
          <h3>导出失败</h3>
          <p>{error ?? '智能导出 PPTX 失败'}</p>
          <button type="button" onClick={onRetry}>
            重新导出
          </button>
        </section>
      ) : null}

      <section className="smart-export-log">
        <div className="smart-export-log-header">
          <p className="eyebrow">对话</p>
          <h3>智能体在做什么</h3>
        </div>
        <div className="smart-export-log-scroll">
          {logs.length ? (
            logs.map((entry) => (
              <article key={entry.id} className={entry.kind === 'assistant' ? 'smart-export-entry is-assistant' : 'smart-export-entry'}>
                <strong>{entry.kind === 'assistant' ? '智能体' : '状态'}</strong>
                <p>{entry.text}</p>
              </article>
            ))
          ) : (
            <p className="smart-export-empty">等待智能体开始导出。</p>
          )}
        </div>
      </section>
    </aside>
  )
}

function getSmartExportPhaseLabel(phase: Extract<PptxExportEvent, { type: 'status' }>['phase']): string {
  if (phase === 'queued') {
    return '排队'
  }
  if (phase === 'drafting') {
    return '生成'
  }
  return '收尾'
}

function resolveSmartExportStepClassName(
  phase: Extract<PptxExportEvent, { type: 'status' }>['phase'],
  activePhase: Extract<PptxExportEvent, { type: 'status' }>['phase'],
  panelState: SmartExportPanelState,
): string {
  const phaseOrder: Array<Extract<PptxExportEvent, { type: 'status' }>['phase']> = ['queued', 'drafting', 'finalizing']
  const activeIndex = phaseOrder.indexOf(activePhase)
  const phaseIndex = phaseOrder.indexOf(phase)
  const classNames = ['smart-export-step']
  if (panelState === 'ready' || phaseIndex < activeIndex) {
    classNames.push('is-complete')
  } else if (panelState === 'running' && phaseIndex === activeIndex) {
    classNames.push('is-active')
  }
  if (panelState === 'error' && phaseIndex === activeIndex) {
    classNames.push('is-error')
  }
  return classNames.join(' ')
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  const sizeKilobytes = sizeBytes / 1024
  if (sizeKilobytes < 1024) {
    return `${sizeKilobytes.toFixed(sizeKilobytes >= 10 ? 0 : 1)} KB`
  }

  const sizeMegabytes = sizeKilobytes / 1024
  return `${sizeMegabytes.toFixed(sizeMegabytes >= 10 ? 0 : 1)} MB`
}
