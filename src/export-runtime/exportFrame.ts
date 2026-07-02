export const EXPORT_VIEWPORT_WIDTH = 1280
export const EXPORT_VIEWPORT_HEIGHT = 720
export const EXPORT_LOAD_TIMEOUT_MS = 15000

export type ExportViewportSize = {
  width: number
  height: number
}

type ExportFrameOptions = {
  scripts?: 'allow' | 'remove'
}

export async function createExportFrame(
  html: string,
  viewportSize: ExportViewportSize = {
    width: EXPORT_VIEWPORT_WIDTH,
    height: EXPORT_VIEWPORT_HEIGHT,
  },
  options: ExportFrameOptions = {},
): Promise<HTMLIFrameElement> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('导出仅支持在浏览器中运行')
  }

  const iframe = createHiddenExportFrame(viewportSize)
  iframe.srcdoc = options.scripts === 'remove' ? removeScriptsFromHtml(html) : html

  document.body.appendChild(iframe)
  await waitForExportDocumentReady(iframe, EXPORT_LOAD_TIMEOUT_MS)
  return iframe
}

export function createHiddenExportFrame(
  viewportSize: ExportViewportSize = {
    width: EXPORT_VIEWPORT_WIDTH,
    height: EXPORT_VIEWPORT_HEIGHT,
  },
): HTMLIFrameElement {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = [
    'position: fixed',
    'left: -20000px',
    'top: 0',
    `width: ${viewportSize.width}px`,
    `height: ${viewportSize.height}px`,
    'border: 0',
    'opacity: 0',
    'pointer-events: none',
    'z-index: -1',
  ].join('; ')
  iframe.width = String(viewportSize.width)
  iframe.height = String(viewportSize.height)
  return iframe
}

export function waitForExportDocumentReady(
  iframe: HTMLIFrameElement,
  timeoutMs: number,
): Promise<Document> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('导出页面加载超时'))
    }, timeoutMs)

    const cleanup = () => {
      window.clearTimeout(timeout)
      iframe.removeEventListener('load', handleLoad)
    }

    const handleLoad = () => {
      const exportDocument = iframe.contentDocument
      const root = exportDocument?.querySelector('[data-fs-editable-deck="1"]')

      if (!exportDocument || !root) {
        return
      }

      cleanup()
      resolve(exportDocument)
    }

    iframe.addEventListener('load', handleLoad)
    handleLoad()
  })
}

export async function waitForExportSurfaceReady(
  document: Document,
  root: ParentNode = document.body ?? document.documentElement,
  timeoutMs = EXPORT_LOAD_TIMEOUT_MS,
): Promise<void> {
  await waitForExportAssets(document, root, timeoutMs)
  await waitForAnimationFrames(2)
  await waitForDomQuiet(root, timeoutMs)
  await waitForExportAssets(document, root, timeoutMs)
  await waitForAnimationFrames(2)
}

export function waitForAnimationFrames(count = 1): Promise<void> {
  let remaining = Math.max(1, count)
  return new Promise((resolve) => {
    const tick = () => {
      remaining -= 1
      if (remaining <= 0) {
        resolve()
        return
      }

      requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  })
}

async function waitForExportAssets(
  document: Document,
  root: ParentNode,
  timeoutMs: number,
): Promise<void> {
  const imagePromises = collectImages(root).map((image) => {
    if (image.complete) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => resolve(), { once: true })
    })
  })

  const fontPromise =
    'fonts' in document && document.fonts?.ready
      ? Promise.race([document.fonts.ready.then(() => undefined), delay(timeoutMs)])
      : Promise.resolve()

  await Promise.all([...imagePromises, fontPromise])
}

function collectImages(root: ParentNode): HTMLImageElement[] {
  if (root instanceof Document) {
    return Array.from(root.images)
  }

  if (root instanceof HTMLElement || root instanceof DocumentFragment) {
    return Array.from(root.querySelectorAll<HTMLImageElement>('img'))
  }

  return []
}

function waitForDomQuiet(root: ParentNode, timeoutMs: number, quietWindowMs = 120): Promise<void> {
  if (typeof MutationObserver === 'undefined') {
    return delay(quietWindowMs)
  }

  return new Promise((resolve) => {
    let settled = false
    let quietTimer = 0
    const timeout = window.setTimeout(() => {
      cleanup()
      resolve()
    }, timeoutMs)

    const cleanup = () => {
      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timeout)
      window.clearTimeout(quietTimer)
      observer.disconnect()
    }

    const armQuietTimer = () => {
      window.clearTimeout(quietTimer)
      quietTimer = window.setTimeout(() => {
        cleanup()
        resolve()
      }, quietWindowMs)
    }

    const observer = new MutationObserver(() => {
      armQuietTimer()
    })

    observer.observe(root, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    })

    armQuietTimer()
  })
}

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, timeoutMs)
  })
}

export function removeScriptsFromHtml(html: string): string {
  const parser = new DOMParser()
  const document = parser.parseFromString(html, 'text/html')
  document.querySelectorAll('script').forEach((script) => script.remove())
  return '<!doctype html>\n' + document.documentElement.outerHTML
}
