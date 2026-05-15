import { useEffect, useState } from 'react'

type ThemeCSSData = { base: string; fonts: string; theme: string }

let cachedCSSMap: Record<string, ThemeCSSData> | null = null
let fetchPromise: Promise<Record<string, ThemeCSSData>> | null = null

async function fetchAllThemeCSS(): Promise<Record<string, ThemeCSSData>> {
  const response = await fetch('/api/agent/html-ppt/css/all-themes')
  if (!response.ok) {
    throw new Error(`Failed to load theme CSS: ${response.status}`)
  }
  const data = await response.json() as { cssMap: Record<string, ThemeCSSData> }
  return data.cssMap
}

export function useThemeCSS(): {
  cssMap: Record<string, ThemeCSSData> | null
  loading: boolean
} {
  const [cssMap, setCssMap] = useState<Record<string, ThemeCSSData> | null>(cachedCSSMap)
  const [loading, setLoading] = useState(!cachedCSSMap)

  useEffect(() => {
    if (cachedCSSMap) return

    if (!fetchPromise) {
      fetchPromise = fetchAllThemeCSS()
    }

    let cancelled = false
    fetchPromise.then((result) => {
      cachedCSSMap = result
      if (!cancelled) {
        setCssMap(result)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [])

  return { cssMap, loading }
}
