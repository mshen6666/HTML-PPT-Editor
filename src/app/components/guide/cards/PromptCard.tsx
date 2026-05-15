import type { PromptPattern } from '../../../htmlPptSkillGuideData'
import './cards.css'

interface PromptCardProps {
  prompt: PromptPattern
  viewMode: 'grid' | 'list'
  onClick: () => void
}

export function PromptCard({ prompt, viewMode, onClick }: PromptCardProps) {
  return (
    <article
      className={`guide-card guide-card--prompt ${viewMode === 'list' ? 'is-list' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <header className="guide-card-header">
        <h3 className="guide-card-title">{prompt.title}</h3>
      </header>
      <p className="guide-card-goal">{prompt.goal}</p>
      {viewMode === 'list' && (
        <p className="guide-card-template">{prompt.template}</p>
      )}
    </article>
  )
}
