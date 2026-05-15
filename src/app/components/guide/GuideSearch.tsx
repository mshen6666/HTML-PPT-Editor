import { useRef } from 'react'
import {
  guideThemeCategoryLabels,
  guideLayoutCategoryLabels,
  guideAnimationKindLabels,
} from '../../htmlPptSkillGuideData'
import type { GuideFilters, GuideTabId, ViewMode } from '../../types/guide'
import './guide.css'

interface GuideSearchProps {
  query: string
  onQueryChange: (q: string) => void
  activeTab: GuideTabId
  filters: GuideFilters
  onFiltersChange: (filters: GuideFilters) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function GuideSearch({
  query,
  onQueryChange,
  activeTab,
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
}: GuideSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onQueryChange('')
      inputRef.current?.blur()
    }
  }

  const updateFilter = <K extends keyof GuideFilters>(key: K, value: GuideFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  return (
    <div className="guide-search-bar">
      <div className="guide-search-input-wrap">
        <svg className="guide-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="guide-search-input"
          placeholder="搜索主题、模板、布局..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="搜索"
        />
        {query && (
          <button
            className="guide-search-clear"
            onClick={() => onQueryChange('')}
            aria-label="清除搜索"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="guide-view-toggle">
        <button
          className={`guide-view-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
          onClick={() => onViewModeChange('grid')}
          aria-label="网格视图"
          title="网格视图"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
        </button>
        <button
          className={`guide-view-btn ${viewMode === 'list' ? 'is-active' : ''}`}
          onClick={() => onViewModeChange('list')}
          aria-label="列表视图"
          title="列表视图"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </button>
      </div>

      {activeTab === 'themes' && (
        <div className="guide-filter-chips">
          {(Object.entries(guideThemeCategoryLabels) as [string, string][])
            .filter(([key]) => key !== 'all')
            .map(([key, label]) => (
              <button
                key={key}
                className={`guide-filter-chip ${filters.themeCategory === key ? 'is-active' : ''}`}
                onClick={() => updateFilter('themeCategory', filters.themeCategory === key ? undefined : key as any)}
              >
                {label}
              </button>
            ))}
        </div>
      )}

      {activeTab === 'layouts' && (
        <div className="guide-filter-chips">
          {(Object.entries(guideLayoutCategoryLabels) as [string, string][])
            .filter(([key]) => key !== 'all')
            .map(([key, label]) => (
              <button
                key={key}
                className={`guide-filter-chip ${filters.layoutCategory === key ? 'is-active' : ''}`}
                onClick={() => updateFilter('layoutCategory', filters.layoutCategory === key ? undefined : key as any)}
              >
                {label}
              </button>
            ))}
        </div>
      )}

      {activeTab === 'animations' && (
        <div className="guide-filter-chips">
          {(Object.entries(guideAnimationKindLabels) as [string, string][])
            .filter(([key]) => key !== 'all')
            .map(([key, label]) => (
              <button
                key={key}
                className={`guide-filter-chip ${filters.animationKind === key ? 'is-active' : ''}`}
                onClick={() => updateFilter('animationKind', filters.animationKind === key ? undefined : key as any)}
              >
                {label}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
