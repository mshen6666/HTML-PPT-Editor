import { htmlPptSkillGuideData } from '../../../htmlPptSkillGuideData'
import './views.css'

export function QuickStartView() {
  return (
    <div className="quickstart-view">
      <header className="quickstart-header">
        <h2 className="quickstart-title">如何开始</h2>
        <p className="quickstart-subtitle">
          按以下五个步骤，快速掌握 html-ppt-skill 的使用方法
        </p>
      </header>

      <ol className="quickstart-steps">
        {htmlPptSkillGuideData.quickStart.map((step, index) => (
          <li key={index} className="quickstart-step">
            <div className="quickstart-step-marker" aria-hidden="true">
              <span className="quickstart-step-number">{index + 1}</span>
            </div>
            <div className="quickstart-step-content">
              <h3 className="quickstart-step-title">{step.title}</h3>
              <p className="quickstart-step-desc">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
