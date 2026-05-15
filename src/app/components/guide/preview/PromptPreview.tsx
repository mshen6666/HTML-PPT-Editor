import type { PromptPattern } from '../../../htmlPptSkillGuideData'
import './preview.css'

interface PromptPreviewProps {
  prompt: PromptPattern
}

export function PromptPreview({ prompt }: PromptPreviewProps) {
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="preview-content preview-content--prompt">
      <div className="preview-header">
        <h2 className="preview-title">{prompt.title}</h2>
      </div>

      <div className="preview-section">
        <h4>目标</h4>
        <p>{prompt.goal}</p>
      </div>

      <div className="preview-section">
        <h4>模板句式</h4>
        <div className="preview-code-block">
          <code>{prompt.template}</code>
          <button
            className="preview-copy-btn"
            onClick={() => handleCopy(prompt.template)}
            aria-label="复制模板"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
        </div>
      </div>

      <div className="preview-section">
        <h4>短示例</h4>
        <p className="preview-example">{prompt.shortExample}</p>
      </div>

      <div className="preview-section">
        <h4>完整示例</h4>
        <p className="preview-example preview-example--long">{prompt.longExample}</p>
      </div>
    </div>
  )
}
