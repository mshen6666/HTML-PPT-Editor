import { htmlPptSkillGuideData } from '../../htmlPptSkillGuideData'
import type { GuideTabId } from '../../types/guide'
import './guide.css'

const TABS: Array<{ id: GuideTabId; label: string; count?: number }> = [
  { id: 'quick-start', label: '快速开始' },
  { id: 'platform-usage', label: '平台使用' },
  { id: 'themes', label: '主题', count: htmlPptSkillGuideData.themes.length },
  { id: 'templates', label: '模板', count: htmlPptSkillGuideData.fullDecks.length },
  { id: 'layouts', label: '布局', count: htmlPptSkillGuideData.layouts.length },
  { id: 'animations', label: '动效', count: htmlPptSkillGuideData.animations.length },
  { id: 'prompts', label: '提示词', count: htmlPptSkillGuideData.promptPatterns.length },
]

interface GuideTabsProps {
  activeTab: GuideTabId
  onTabChange: (tab: GuideTabId) => void
}

export function GuideTabs({ activeTab, onTabChange }: GuideTabsProps) {
  return (
    <nav className="guide-tabs" role="tablist" aria-label="指南分类">
      {TABS.map((tab, index) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`guide-tab ${activeTab === tab.id ? 'is-active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          title={`按 ${index + 1} 切换到此标签`}
        >
          <span className="guide-tab-label">{tab.label}</span>
          {tab.count !== undefined && (
            <span className="guide-tab-count">{tab.count}</span>
          )}
        </button>
      ))}
    </nav>
  )
}
