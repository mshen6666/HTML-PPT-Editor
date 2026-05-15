import { guideThemeCategoryLabels } from '../../../htmlPptSkillGuideData'
import type { GuideTheme } from '../../../htmlPptSkillGuideData'
import { useThemeCSS } from './useThemeCSS'
import { ThemeSlidePreview } from './ThemeSlidePreview'
import './preview.css'

interface ThemePreviewProps {
  theme: GuideTheme
}

export function ThemePreview({ theme }: ThemePreviewProps) {
  const { cssMap, loading } = useThemeCSS()
  const cssData = cssMap?.[theme.name]

  return (
    <div className="preview-content preview-content--theme">
      <div className="preview-header">
        <h2 className="preview-title">{theme.name}</h2>
        <span className="preview-badge">
          {guideThemeCategoryLabels[theme.category]}
        </span>
      </div>

      <div className="theme-slide-preview-shell">
        {cssData ? (
          <ThemeSlidePreview theme={theme} cssData={cssData} />
        ) : (
          <div className="theme-slide-preview-loading">
            {loading ? '加载主题预览...' : '预览不可用'}
          </div>
        )}
      </div>

      <div className="preview-section">
        <div className="scene-pill-row">
          {theme.tone.map((tone) => (
            <span key={tone} className="scene-theme-chip">
              {tone}
            </span>
          ))}
        </div>
      </div>

      <div className="preview-section">
        <h4>使用场景</h4>
        <p>{theme.useCases}</p>
      </div>

      <div className="preview-section">
        <h4>提示词写法</h4>
        <p className="preview-hint">{theme.promptHint}</p>
      </div>
    </div>
  )
}
