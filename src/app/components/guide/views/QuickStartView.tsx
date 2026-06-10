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

      <section className="quickstart-workflows" aria-labelledby="quickstart-workflows-title">
        <div className="platform-section-heading">
          <p className="overview-section-label">创作入口</p>
          <h3 id="quickstart-workflows-title">可直接套用的创作入口</h3>
        </div>
        <div className="quickstart-workflow-grid">
          {htmlPptSkillGuideData.creationWorkflows.map((workflow) => (
            <article key={workflow.title} className="quickstart-workflow-card">
              <header>
                <span>oh-my-ppt 启发</span>
                <h4>{workflow.title}</h4>
              </header>
              <p>{workflow.bestWhen}</p>
              <ol>
                {workflow.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="quickstart-workflow-prompt">{workflow.promptStarter}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
