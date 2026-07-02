import { useMemo } from 'react'
import { guideThemeCategoryLabels, themeNameLabels } from '../../../htmlPptSkillGuideData'
import type { GuideTheme } from '../../../htmlPptSkillGuideData'
import { useThemeCSS } from '../preview/useThemeCSS'
import { useReferenceThemePreview } from '../preview/useReferenceThemePreview'
import { generateSlideHTML } from '../preview/themeSlideContent'
import { buildThemeSrcdoc } from '../preview/buildThemeSrcdoc'
import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard'
import { CardThumbnail } from './CardThumbnail'
import './cards.css'

interface ThemeCardProps {
  theme: GuideTheme
  viewMode: 'grid' | 'list'
  onClick: () => void
}

export function ThemeCard({ theme, viewMode, onClick }: ThemeCardProps) {
  const chineseName = theme.label || themeNameLabels[theme.name] || theme.name
  const isReferenceTheme = theme.referenceOnly === true
  const { cssMap, loading: cssLoading } = useThemeCSS({ enabled: !isReferenceTheme })
  const { previewHtml, loading: referenceLoading } = useReferenceThemePreview(theme.name, { enabled: isReferenceTheme })
  const { copied, copy } = useCopyToClipboard()

  const srcdoc = useMemo(() => {
    if (isReferenceTheme) {
      return previewHtml
    }
    const cssData = cssMap?.[theme.name]
    if (!cssData) return null
    const { slide1 } = generateSlideHTML(theme)
    return buildThemeSrcdoc({
      baseCSS: cssData.base,
      fontsCSS: cssData.fonts,
      themeCSS: cssData.theme,
      slide1HTML: slide1,
    })
  }, [cssMap, isReferenceTheme, previewHtml, theme])
  const loading = isReferenceTheme ? referenceLoading : cssLoading

  return (
    <article
      className={`guide-card guide-card--theme ${viewMode === 'list' ? 'is-list' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <button
        className={`guide-card-copy-btn ${copied ? 'is-copied' : ''}`}
        onClick={e => { e.stopPropagation(); copy(theme.promptHint) }}
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
          <span className="guide-card-subtitle">{theme.name}</span>
        </h3>
        <span className="guide-card-badge">
          {guideThemeCategoryLabels[theme.category]}
        </span>
      </header>
      <div className="guide-card-tone">
        {theme.tone.map(t => (
          <span key={t} className="guide-card-tag">{t}</span>
        ))}
      </div>
      <p className="guide-card-desc">{theme.useCases}</p>
      {viewMode === 'list' && (
        <p className="guide-card-hint">{theme.promptHint}</p>
      )}
    </article>
  )
}
