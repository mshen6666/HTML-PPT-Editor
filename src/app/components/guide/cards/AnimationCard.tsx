import { useMemo } from 'react'
import { guideAnimationKindLabels, animationNameLabels } from '../../../htmlPptSkillGuideData'
import type { GuideAnimation } from '../../../htmlPptSkillGuideData'
import { useAnimationCSS } from '../preview/useAnimationCSS'
import { buildAnimationSrcdoc } from '../preview/buildAnimationSrcdoc'
import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard'
import { CardThumbnail } from './CardThumbnail'
import './cards.css'

interface AnimationCardProps {
  animation: GuideAnimation
  viewMode: 'grid' | 'list'
  onClick: () => void
}

export function AnimationCard({ animation, viewMode, onClick }: AnimationCardProps) {
  const chineseName = animationNameLabels[animation.name] || animation.name
  const { cssData, loading } = useAnimationCSS()
  const { copied, copy } = useCopyToClipboard()

  const srcdoc = useMemo(() => {
    if (!cssData) return null
    return buildAnimationSrcdoc({
      baseCSS: cssData.baseCSS,
      fontsCSS: cssData.fontsCSS,
      animationsCSS: cssData.animationsCSS,
      animation,
      loop: true,
    })
  }, [cssData, animation])

  return (
    <article
      className={`guide-card guide-card--animation ${viewMode === 'list' ? 'is-list' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <button
        className={`guide-card-copy-btn ${copied ? 'is-copied' : ''}`}
        onClick={e => { e.stopPropagation(); copy(animation.promptHint) }}
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
          <span className="guide-card-subtitle">{animation.name}</span>
        </h3>
        <span className="guide-card-badge">
          {guideAnimationKindLabels[animation.kind]}
        </span>
      </header>
      <p className="guide-card-effect">{animation.effect}</p>
      <p className="guide-card-best-for">{animation.bestFor}</p>
      {viewMode === 'list' && (
        <p className="guide-card-hint">{animation.promptHint}</p>
      )}
    </article>
  )
}
