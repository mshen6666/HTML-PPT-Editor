import { useMemo } from 'react'
import { guideAnimationKindLabels } from '../../../htmlPptSkillGuideData'
import type { GuideAnimation } from '../../../htmlPptSkillGuideData'
import { useAnimationCSS } from './useAnimationCSS'
import { buildAnimationSrcdoc } from './buildAnimationSrcdoc'
import './preview.css'

interface AnimationPreviewProps {
  animation: GuideAnimation
}

export function AnimationPreview({ animation }: AnimationPreviewProps) {
  const { cssData, loading } = useAnimationCSS()

  const srcdoc = useMemo(() => {
    if (!cssData) return null
    return buildAnimationSrcdoc({
      baseCSS: cssData.baseCSS,
      fontsCSS: cssData.fontsCSS,
      animationsCSS: cssData.animationsCSS,
      animation,
    })
  }, [cssData, animation])

  return (
    <div className="preview-content preview-content--animation">
      <div className="preview-header">
        <h2 className="preview-title">{animation.name}</h2>
        <span className="preview-badge">
          {guideAnimationKindLabels[animation.kind]}
        </span>
      </div>

      <div className="theme-slide-preview-shell">
        {srcdoc ? (
          <iframe
            className="theme-slide-preview-iframe"
            sandbox=""
            title={`${animation.name} animation preview`}
            srcDoc={srcdoc}
          />
        ) : (
          <div className="theme-slide-preview-loading">
            {loading ? '加载动效预览...' : '预览不可用'}
          </div>
        )}
      </div>

      <div className="preview-section">
        <h4>效果</h4>
        <p>{animation.effect}</p>
      </div>

      <div className="preview-section">
        <h4>最适合</h4>
        <p>{animation.bestFor}</p>
      </div>

      <div className="preview-section">
        <h4>提示词</h4>
        <p className="preview-hint">{animation.promptHint}</p>
      </div>

      <div className="preview-caution">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span>{animation.caution}</span>
      </div>
    </div>
  )
}
