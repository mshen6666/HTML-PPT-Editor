import { useEffect, useCallback } from 'react'
import type { GuideItem } from '../../types/guide'
import { ThemePreview } from './preview/ThemePreview'
import { TemplatePreview } from './preview/TemplatePreview'
import { LayoutPreview } from './preview/LayoutPreview'
import { AnimationPreview } from './preview/AnimationPreview'
import { PromptPreview } from './preview/PromptPreview'
import './guide.css'

interface GuidePreviewProps {
  item: GuideItem | null
  onClose: () => void
}

export function GuidePreview({ item, onClose }: GuidePreviewProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (item) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [item, handleKeyDown])

  if (!item) return null

  const renderContent = () => {
    switch (item.type) {
      case 'theme':
        return <ThemePreview theme={item.data} />
      case 'template':
        return <TemplatePreview template={item.data} />
      case 'layout':
        return <LayoutPreview layout={item.data} />
      case 'animation':
        return <AnimationPreview animation={item.data} />
      case 'prompt':
        return <PromptPreview prompt={item.data} />
    }
  }

  return (
    <>
      <div className="guide-preview-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="guide-preview-panel" role="dialog" aria-modal="true" aria-label="详情预览">
        <button className="guide-preview-close" onClick={onClose} aria-label="关闭预览">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        {renderContent()}
      </aside>
    </>
  )
}
