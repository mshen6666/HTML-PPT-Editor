import { guideLayoutCategoryLabels } from '../../../htmlPptSkillGuideData'
import type { GuideLayout } from '../../../htmlPptSkillGuideData'
import { useLayoutPreviews } from './useLayoutPreviews'
import './preview.css'

interface LayoutPreviewProps {
  layout: GuideLayout
}

export function LayoutPreview({ layout }: LayoutPreviewProps) {
  const { previewMap, loading } = useLayoutPreviews()
  const srcdoc = previewMap?.[layout.name]

  return (
    <div className="preview-content preview-content--layout">
      <div className="preview-header">
        <h2 className="preview-title">{layout.name}</h2>
        <span className="preview-badge">
          {guideLayoutCategoryLabels[layout.category]}
        </span>
      </div>

      <div className="theme-slide-preview-shell">
        {srcdoc ? (
          <iframe
            className="theme-slide-preview-iframe"
            sandbox=""
            title={`${layout.name} layout preview`}
            srcDoc={srcdoc}
          />
        ) : (
          <div className="theme-slide-preview-loading">
            {loading ? '加载布局预览...' : '预览不可用'}
          </div>
        )}
      </div>

      <div className="preview-section">
        <h4>信息类型</h4>
        <p>{layout.informationType}</p>
      </div>

      <div className="preview-section">
        <h4>使用建议</h4>
        <p>{layout.usageAdvice}</p>
      </div>
    </div>
  )
}
