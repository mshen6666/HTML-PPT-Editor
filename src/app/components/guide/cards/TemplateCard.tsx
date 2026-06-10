import { fullDeckNameLabels } from '../../../htmlPptSkillGuideData'
import type { GuideFullDeck } from '../../../htmlPptSkillGuideData'
import { useTemplatePreviews } from '../preview/useTemplatePreviews'
import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard'
import { CardThumbnail } from './CardThumbnail'
import './cards.css'

interface TemplateCardProps {
  template: GuideFullDeck
  viewMode: 'grid' | 'list'
  onClick: () => void
}

export function TemplateCard({ template, viewMode, onClick }: TemplateCardProps) {
  const chineseName = fullDeckNameLabels[template.name] || template.displayName || template.name
  const { previewMap, loading } = useTemplatePreviews()
  const srcdoc = previewMap?.[template.name]
  const { copied, copy } = useCopyToClipboard()

  return (
    <article
      className={`guide-card guide-card--template ${viewMode === 'list' ? 'is-list' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <button
        className={`guide-card-copy-btn ${copied ? 'is-copied' : ''}`}
        onClick={e => { e.stopPropagation(); copy(template.promptStarter) }}
        aria-label={copied ? '已复制' : '复制提示词'}
        title={copied ? '已复制' : '复制提示词'}
      >
        {copied ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        )}
      </button>
      <CardThumbnail srcdoc={srcdoc} loading={loading} label={chineseName} />
      <header className="guide-card-header">
        <h3 className="guide-card-title">
          {chineseName}
          <span className="guide-card-subtitle">{template.name}</span>
        </h3>
      </header>
      <p className="guide-card-scenario">{template.scenario}</p>
      <div className="guide-card-keywords">
        {template.visualKeywords.map(k => (
          <span key={k} className="guide-card-tag">{k}</span>
        ))}
      </div>
      <p className="guide-card-fit">{template.fit}</p>
      {template.source === 'beautiful-html-templates' && (
        <p className="guide-card-fit">来源：精选模板库 · 约 {template.slideCount ?? '?'} 页</p>
      )}
    </article>
  )
}
