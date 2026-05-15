import { guideLayoutCategoryLabels, layoutNameLabels } from '../../../htmlPptSkillGuideData'
import type { GuideLayout } from '../../../htmlPptSkillGuideData'
import { useLayoutPreviews } from '../preview/useLayoutPreviews'
import { CardThumbnail } from './CardThumbnail'
import './cards.css'

interface LayoutCardProps {
  layout: GuideLayout
  viewMode: 'grid' | 'list'
  onClick: () => void
}

export function LayoutCard({ layout, viewMode, onClick }: LayoutCardProps) {
  const chineseName = layoutNameLabels[layout.name] || layout.name
  const { previewMap, loading } = useLayoutPreviews()
  const srcdoc = previewMap?.[layout.name]

  return (
    <article
      className={`guide-card guide-card--layout ${viewMode === 'list' ? 'is-list' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <CardThumbnail srcdoc={srcdoc} loading={loading} label={chineseName} />
      <header className="guide-card-header">
        <h3 className="guide-card-title">
          {chineseName}
          <span className="guide-card-subtitle">{layout.name}</span>
        </h3>
        <span className="guide-card-badge">
          {guideLayoutCategoryLabels[layout.category]}
        </span>
      </header>
      <p className="guide-card-info-type">{layout.informationType}</p>
      <p className="guide-card-advice">{layout.usageAdvice}</p>
    </article>
  )
}
