import { useMemo, useState, useEffect } from 'react'
import { htmlPptSkillGuideData } from '../htmlPptSkillGuideData'
import type { GuideItem, GuideFilters, GuideTabId } from '../types/guide'

export function useGuideSearch(
  query: string,
  activeTab: GuideTabId,
  filters: GuideFilters
) {
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(timer)
  }, [query])

  return useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim()
    let items: GuideItem[] = []

    switch (activeTab) {
      case 'quick-start':
      case 'platform-usage':
        return []
      case 'themes':
        items = htmlPptSkillGuideData.themes.map((data) => ({ type: 'theme', data }))
        break
      case 'templates':
        items = htmlPptSkillGuideData.fullDecks.map((data) => ({ type: 'template', data }))
        break
      case 'layouts':
        items = htmlPptSkillGuideData.layouts.map((data) => ({ type: 'layout', data }))
        break
      case 'animations':
        items = htmlPptSkillGuideData.animations.map((data) => ({ type: 'animation', data }))
        break
      case 'prompts':
        items = htmlPptSkillGuideData.promptPatterns.map((data) => ({ type: 'prompt', data }))
        break
      default:
        return []
    }

    return items.filter(item => {
      const searchText = getSearchText(item).toLowerCase()
      if (q && !searchText.includes(q)) return false

      switch (item.type) {
        case 'theme':
          if (filters.themeCategory && item.data.category !== filters.themeCategory) return false
          break
        case 'layout':
          if (filters.layoutCategory && item.data.category !== filters.layoutCategory) return false
          break
        case 'animation':
          if (filters.animationKind && item.data.kind !== filters.animationKind) return false
          break
      }

      return true
    })
  }, [debouncedQuery, activeTab, filters])
}

function getSearchText(item: GuideItem): string {
  switch (item.type) {
    case 'theme':
      return `${item.data.name} ${item.data.category} ${item.data.tone.join(' ')} ${item.data.useCases}`
    case 'template':
      return `${item.data.name} ${item.data.scenario} ${item.data.visualKeywords.join(' ')}`
    case 'layout':
      return `${item.data.name} ${item.data.category} ${item.data.informationType}`
    case 'animation':
      return `${item.data.name} ${item.data.group} ${item.data.effect}`
    case 'prompt':
      return `${item.data.title} ${item.data.goal}`
  }
}
