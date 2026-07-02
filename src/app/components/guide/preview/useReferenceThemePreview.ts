import { useEffect, useState } from 'react'

let cachedPreviewMap: Record<string, string> = {}
const fetchPromises = new Map<string, Promise<Record<string, string>>>()

async function fetchReferenceThemePreviews(names: string[]): Promise<Record<string, string>> {
  const query = encodeURIComponent(names.join(','))
  const response = await fetch(`/api/agent/html-ppt/oh-my-ppt-style-preview-parts?names=${query}`)
  if (!response.ok) {
    throw new Error(`Failed to load reference theme preview: ${response.status}`)
  }
  const data = await response.json() as { previewMap: Record<string, string> }
  return data.previewMap
}

export function useReferenceThemePreview(name: string, options: { enabled?: boolean } = {}): {
  previewHtml: string | null
  loading: boolean
} {
  const enabled = options.enabled ?? true
  const [previewHtml, setPreviewHtml] = useState(cachedPreviewMap[name] ?? null)
  const [loading, setLoading] = useState(enabled && !cachedPreviewMap[name])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    const cached = cachedPreviewMap[name]
    if (cached) {
      setPreviewHtml(cached)
      setLoading(false)
      return
    }

    if (!fetchPromises.has(name)) {
      fetchPromises.set(name, fetchReferenceThemePreviews([name]))
    }

    let cancelled = false
    fetchPromises.get(name)?.then((result) => {
      cachedPreviewMap = { ...cachedPreviewMap, ...result }
      if (!cancelled) {
        setPreviewHtml(result[name] ?? null)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [enabled, name])

  return { previewHtml, loading }
}

