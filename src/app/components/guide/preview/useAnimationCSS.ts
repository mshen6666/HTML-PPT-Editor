import { useEffect, useState } from 'react'

type AnimationCSSData = { baseCSS: string; fontsCSS: string; animationsCSS: string }

let cachedData: AnimationCSSData | null = null
let fetchPromise: Promise<AnimationCSSData> | null = null

async function fetchAnimationCSS(): Promise<AnimationCSSData> {
  const response = await fetch('/api/agent/html-ppt/animation-previews')
  if (!response.ok) {
    throw new Error(`Failed to load animation CSS: ${response.status}`)
  }
  return response.json() as Promise<AnimationCSSData>
}

export function useAnimationCSS(): {
  cssData: AnimationCSSData | null
  loading: boolean
} {
  const [cssData, setCssData] = useState<AnimationCSSData | null>(cachedData)
  const [loading, setLoading] = useState(!cachedData)

  useEffect(() => {
    if (cachedData) return

    if (!fetchPromise) {
      fetchPromise = fetchAnimationCSS()
    }

    let cancelled = false
    fetchPromise.then((result) => {
      cachedData = result
      if (!cancelled) {
        setCssData(result)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [])

  return { cssData, loading }
}
