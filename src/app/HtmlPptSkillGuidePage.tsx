import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import './htmlPptSkillGuide.css'
import './components/guide/guide.css'
import { EDITOR_NEW_PATH } from './routePaths'
import { GuideBrowser } from './components/guide/GuideBrowser'

export function HtmlPptSkillGuidePage(): ReactElement {
  return (
    <div className="guide-page-shell">
      <div className="guide-browser-container">
        <Link className="guide-back-btn" to={EDITOR_NEW_PATH}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回编辑器
        </Link>
        <GuideBrowser />
      </div>
    </div>
  )
}
