import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { htmlPptSkillGuideData } from '../../htmlPptSkillGuideData'
import type { GuideTabId, GuideItem, GuideFilters, ViewMode } from '../../types/guide'
import { useGuideSearch } from '../../hooks/useGuideSearch'
import { GuideTabs } from './GuideTabs'
import { GuideSearch } from './GuideSearch'
import { GuidePreview } from './GuidePreview'
import { ThemeCard } from './cards/ThemeCard'
import { TemplateCard } from './cards/TemplateCard'
import { LayoutCard } from './cards/LayoutCard'
import { AnimationCard } from './cards/AnimationCard'
import { PromptCard } from './cards/PromptCard'
import { QuickStartView } from './views/QuickStartView'
import { PlatformUsageView } from './views/PlatformUsageView'
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

interface GuideBrowserProps {
  className?: string
}

export function GuideBrowser({ className }: GuideBrowserProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTabState] = useState<GuideTabId>(
    () => (searchParams.get('tab') as GuideTabId) || 'quick-start'
  )
  const [searchQuery, setSearchQueryState] = useState(() => searchParams.get('q') || '')
  const [filters, setFilters] = useState<GuideFilters>({})
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [previewItem, setPreviewItem] = useState<GuideItem | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const tabParam = searchParams.get('tab') as GuideTabId
    if (tabParam && tabParam !== activeTab) {
      setActiveTabState(tabParam)
    }
  }, [searchParams, activeTab])

  const setActiveTab = useCallback((tab: GuideTabId) => {
    setActiveTabState(tab)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSearchQuery = useCallback((q: string) => {
    setSearchQueryState(q)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (q) next.set('q', q)
      else next.delete('q')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const filteredItems = useGuideSearch(searchQuery, activeTab, filters)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return

      const tabIndex = parseInt(e.key) - 1
      if (tabIndex >= 0 && tabIndex < TABS.length) {
        setActiveTab(TABS[tabIndex].id)
      }
      if (e.key === '/' || e.key === 's') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        if (previewItem) setPreviewItem(null)
        else setSearchQuery('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewItem, setActiveTab, setSearchQuery])

  const renderCard = useCallback((item: GuideItem) => {
    const handleClick = () => setPreviewItem(item)

    switch (item.type) {
      case 'theme':
        return <ThemeCard key={item.data.name} theme={item.data} viewMode={viewMode} onClick={handleClick} />
      case 'template':
        return <TemplateCard key={item.data.name} template={item.data} viewMode={viewMode} onClick={handleClick} />
      case 'layout':
        return <LayoutCard key={item.data.name} layout={item.data} viewMode={viewMode} onClick={handleClick} />
      case 'animation':
        return <AnimationCard key={item.data.name} animation={item.data} viewMode={viewMode} onClick={handleClick} />
      case 'prompt':
        return <PromptCard key={item.data.id} prompt={item.data} viewMode={viewMode} onClick={handleClick} />
    }
  }, [viewMode])

  return (
    <div className={`guide-browser ${className || ''}`}>
      <header className="guide-browser-header">
        <h1 className="guide-browser-title">HTML PPT 指南</h1>
        <p className="guide-browser-subtitle">
          探索 {htmlPptSkillGuideData.themes.length} 个主题、{htmlPptSkillGuideData.fullDecks.length} 个模板、{htmlPptSkillGuideData.layouts.length} 个布局
        </p>
      </header>

      <GuideSearch
        query={searchQuery}
        onQueryChange={setSearchQuery}
        activeTab={activeTab}
        filters={filters}
        onFiltersChange={setFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <GuideTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="guide-browser-content">
        {activeTab === 'quick-start' && <QuickStartView />}
        {activeTab === 'platform-usage' && <PlatformUsageView />}
        {activeTab !== 'quick-start' && activeTab !== 'platform-usage' && (
          filteredItems.length === 0 ? (
            <div className="guide-empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <p>没有找到匹配的内容</p>
              <button onClick={() => setSearchQuery('')}>清除搜索</button>
            </div>
          ) : (
            <div className={`guide-card-grid ${viewMode === 'list' ? 'is-list' : ''}`}>
              {filteredItems.map(renderCard)}
            </div>
          )
        )}
      </main>

      <GuidePreview item={previewItem} onClose={() => setPreviewItem(null)} />
    </div>
  )
}
