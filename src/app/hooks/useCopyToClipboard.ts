import { useState, useCallback } from 'react'

export function useCopyToClipboard(resetDelay = 1500) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), resetDelay)
    } catch {
      // Clipboard API may fail in insecure contexts
    }
  }, [resetDelay])

  return { copied, copy }
}
