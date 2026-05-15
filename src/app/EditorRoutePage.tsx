import type { ReactElement } from 'react'
import { useLocation, useParams } from 'react-router-dom'

import { blankDeckHtml } from '../blankDeck'
import { App } from './App'

export type EditorLaunchContext = {
  initialComposerText?: string
  focusAgentPanel?: boolean
  statusMessage?: string
}

type EditorLocationState = {
  launchContext?: EditorLaunchContext
}

export function EditorRoutePage(): ReactElement {
  const location = useLocation()
  const params = useParams<{ sessionId: string }>()
  const state = (location.state as EditorLocationState | null)?.launchContext ?? null
  const sessionId = params.sessionId

  return (
    <App
      key={sessionId ?? 'new'}
      initialAgentSessionId={sessionId && sessionId !== 'new' ? sessionId : undefined}
      initialComposerText={state?.initialComposerText}
      initialDeckHtml={sessionId === 'new' ? blankDeckHtml : undefined}
      initialLeftPanelMode={state?.focusAgentPanel ? 'agent' : undefined}
      initialStatusMessage={state?.statusMessage}
    />
  )
}
