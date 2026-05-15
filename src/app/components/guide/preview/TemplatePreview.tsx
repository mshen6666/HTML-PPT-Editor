import type { GuideFullDeck } from '../../../htmlPptSkillGuideData'
import { useTemplatePreviews } from './useTemplatePreviews'
import './preview.css'

interface TemplatePreviewProps {
  template: GuideFullDeck
}

export function TemplatePreview({ template }: TemplatePreviewProps) {
  const { previewMap, loading } = useTemplatePreviews()
  const srcdoc = previewMap?.[template.name]

  return (
    <div className="preview-content preview-content--template">
      <div className="preview-header">
        <h2 className="preview-title">{template.name}</h2>
      </div>

      <div className="theme-slide-preview-shell">
        {srcdoc ? (
          <TemplateSlidePreview name={template.name} srcdoc={srcdoc} />
        ) : (
          <div className="theme-slide-preview-loading">
            {loading ? '加载模板预览...' : '预览不可用'}
          </div>
        )}
      </div>

      <div className="preview-section">
        <h4>场景</h4>
        <p>{template.scenario}</p>
      </div>

      <div className="preview-section">
        <h4>视觉关键词</h4>
        <div className="preview-keywords">
          {template.visualKeywords.map(k => (
            <span key={k} className="preview-tag">{k}</span>
          ))}
        </div>
      </div>

      <div className="preview-section">
        <h4>适用场景</h4>
        <p>{template.fit}</p>
      </div>

      <div className="preview-section">
        <h4>Prompt 开场白</h4>
        <p className="preview-hint">{template.promptStarter}</p>
      </div>
    </div>
  )
}

function TemplateSlidePreview({ name, srcdoc }: { name: string; srcdoc: string }) {
  return (
    <iframe
      className="theme-slide-preview-iframe"
      sandbox=""
      title={`${name} preview`}
      srcDoc={srcdoc}
    />
  )
}
