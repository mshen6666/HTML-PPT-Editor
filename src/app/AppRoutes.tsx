import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { EditorRoutePage } from './EditorRoutePage'
import { HtmlPptSkillGuidePage } from './HtmlPptSkillGuidePage'
import { EDITOR_NEW_PATH, HTML_PPT_SKILL_GUIDE_PATH } from './routePaths'

export function AppRoutes(): ReactElement {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={EDITOR_NEW_PATH} replace />} />
      <Route path={EDITOR_NEW_PATH} element={<EditorRoutePage />} />
      <Route path="/editor/:sessionId" element={<EditorRoutePage />} />
      <Route path={HTML_PPT_SKILL_GUIDE_PATH} element={<HtmlPptSkillGuidePage />} />
      <Route path="*" element={<Navigate to={EDITOR_NEW_PATH} replace />} />
    </Routes>
  )
}
