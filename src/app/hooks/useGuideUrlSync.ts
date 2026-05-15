import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { GuideTabId } from '../types/guide'

export function useGuideUrlSync() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTabState] = useState<GuideTabId>(
    () => (searchParams.get('tab') as GuideTabId) || 'themes'
  )
  const [searchQuery, setSearchQueryState] = useState(() => searchParams.get('q') || '')

  const setActiveTab = useCallback((tab: GuideTabId) => {
    setActiveTabState(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    setSearchParams(params, { replace: true })
  }, [searchParams, setSearchParams])

  const setSearchQuery = useCallback((q: string) => {
    setSearchQueryState(q)
    const params = new URLSearchParams(searchParams.toString())
    if (q) params.set('q', q)
    else params.delete('q')
    setSearchParams(params, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab') as GuideTabId
      const q = params.get('q') || ''
      if (tab) setActiveTabState(tab)
      setSearchQueryState(q)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return { activeTab, setActiveTab, searchQuery, setSearchQuery }
}
