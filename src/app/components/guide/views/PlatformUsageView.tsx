import { htmlPptSkillGuideData } from '../../../htmlPptSkillGuideData'
import './views.css'

export function PlatformUsageView() {
  return (
    <div className="platform-usage-view">
      <header className="platform-usage-header">
        <p className="overview-section-label">平台帮助</p>
        <h2 className="platform-usage-title">平台使用说明</h2>
        <p className="platform-usage-lead">
          这份说明按日常编辑流程组织，先看推荐顺序，再按模块查找具体功能。
        </p>
      </header>

      <section className="platform-usage-order" aria-labelledby="platform-usage-order-title">
        <div className="platform-section-heading">
          <p className="overview-section-label">Workflow</p>
          <h3 id="platform-usage-order-title">推荐使用顺序</h3>
        </div>
        <ol className="platform-order-list">
          {htmlPptSkillGuideData.usageOrder.map((step, index) => (
            <li key={step.title} className="platform-order-step">
              <span className="platform-order-number">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h4>{step.title}</h4>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="platform-module-list" aria-label="平台模块说明">
        {htmlPptSkillGuideData.platformModules.map((module) => (
          <article key={module.title} className="platform-module-card">
            <div className="platform-module-intro">
              <p className="overview-section-label">Module</p>
              <h3>{module.title}</h3>
              <p>{module.purpose}</p>
            </div>
            <dl className="platform-feature-list">
              {module.features.map((feature) => (
                <div key={feature.name} className="platform-feature-item">
                  <dt>{feature.name}</dt>
                  <dd>{feature.description}</dd>
                </div>
              ))}
            </dl>
            <p className="platform-module-tip">{module.tip}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
