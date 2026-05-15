import { useEffect, useState } from 'react'

let cachedPreviewMap: Record<string, string> | null = null
let fetchPromise: Promise<Record<string, string>> | null = null

async function fetchLayoutPreviews(): Promise<Record<string, string>> {
  const response = await fetch('/api/agent/html-ppt/layout-previews')
  if (!response.ok) {
    throw new Error(`Failed to load layout previews: ${response.status}`)
  }
  const data = await response.json() as { previewMap: Record<string, string> }
  return data.previewMap
}

export function useLayoutPreviews(): {
  previewMap: Record<string, string> | null
  loading: boolean
} {
  const [previewMap, setPreviewMap] = useState<Record<string, string> | null>(cachedPreviewMap)
  const [loading, setLoading] = useState(!cachedPreviewMap)

  useEffect(() => {
    if (cachedPreviewMap) return

    if (!fetchPromise) {
      fetchPromise = fetchLayoutPreviews()
    }

    let cancelled = false
    fetchPromise.then((result) => {
      cachedPreviewMap = result
      if (!cancelled) {
        setPreviewMap(result)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [])

  return { previewMap, loading }
}
