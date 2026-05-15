import { useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

interface PreviewDemoProps {
  label: string
  sceneClassName: string
  children: ReactNode
  sceneName?: string
  testId?: string
}

export function PreviewDemo({
  label,
  sceneClassName,
  children,
  sceneName,
  testId = 'preview-demo-scene',
}: PreviewDemoProps): ReactElement {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [replayNonce, setReplayNonce] = useState(0)

  return (
    <div className="preview-demo-shell">
      <div className="preview-demo-toolbar">
        <span className="preview-demo-label">{label}</span>
        {prefersReducedMotion ? null : (
          <button
            type="button"
            className="preview-demo-replay"
            onClick={() => setReplayNonce((value) => value + 1)}
          >
            重播演示
          </button>
        )}
      </div>
      <div
        key={prefersReducedMotion ? 'reduced-motion' : replayNonce}
        className={`preview-demo-scene animation-demo-scene ${sceneClassName}`.trim()}
        data-scene={sceneName}
        data-testid={testId}
      >
        {children}
      </div>
    </div>
  )
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => getMotionPreference())

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches)
    }

    updatePreference()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updatePreference)
      return () => mediaQuery.removeEventListener('change', updatePreference)
    }

    mediaQuery.addListener(updatePreference)
    return () => mediaQuery.removeListener(updatePreference)
  }, [])

  return prefersReducedMotion
}

function getMotionPreference(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
