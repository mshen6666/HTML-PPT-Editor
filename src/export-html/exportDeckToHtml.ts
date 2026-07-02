import {
  createDeckDocument,
  getDeckProfile,
  parseControlledDeck,
  serializeDeck,
} from '../deck-contract/deckContract'
import { createExportFrame, waitForExportSurfaceReady } from '../export-runtime/exportFrame'
import { inlineEmbeddedHtmlPptAssetsForBrowser } from '../html-ppt/browserEmbeddedAssetLoader'

const EXPORT_FILE_NAME = '可编辑演示'
const HTML_MIME_TYPE = 'text/html;charset=utf-8'

export async function exportDeckToHtml(
  html: string,
  options?: {
    onProgress?: (message: string) => void
  },
): Promise<void> {
  const sourceDocument = createDeckDocument(html)
  const exportFrame = await createExportFrame(html)

  try {
    const exportDocument = exportFrame.contentDocument
    if (!exportDocument) {
      throw new Error('HTML 导出环境初始化失败')
    }

    options?.onProgress?.('正在准备 HTML 导出…')
    await waitForExportSurfaceReady(exportDocument)
    prepareDeckDocumentForHtmlExport(exportDocument)
    await waitForExportSurfaceReady(exportDocument)

    saveHtmlBlob(
      new Blob([await createStandaloneHtmlExport(exportDocument)], {
        type: HTML_MIME_TYPE,
      }),
      createSafeFileName(sourceDocument.title || EXPORT_FILE_NAME),
    )
  } finally {
    exportFrame.remove()
  }
}

export async function createStandaloneHtmlExport(document: Document): Promise<string> {
  const clone = document.cloneNode(true) as Document
  normalizeHtmlPptStandaloneStructure(clone)
  await inlineExternalAssets(document, clone)
  const normalizedHtml = await inlineEmbeddedHtmlPptAssetsForBrowser(serializeDeck(clone))
  const normalizedClone = createDeckDocument(normalizedHtml)
  clone.replaceChild(clone.importNode(normalizedClone.documentElement, true), clone.documentElement)
  injectStandaloneExportStyles(clone)
  injectStandaloneExportNavigationRuntime(clone)
  injectStandaloneExportRuntime(clone)
  return serializeDeck(clone)
}

export function prepareDeckDocumentForHtmlExport(document: Document): void {
  const deck = parseControlledDeck(document)

  document.querySelectorAll<HTMLElement>('.notes-overlay, .overview, .overview-overlay').forEach((overlay) => {
    overlay.classList.remove('open')
    overlay.setAttribute('aria-hidden', 'true')
  })

  if (getDeckProfile(document) !== 'html-ppt') {
    return
  }

  const firstSlideId = deck.slideOrder[0]
  if (!firstSlideId) {
    return
  }

  document.querySelectorAll<HTMLElement>('section.slide[data-slide-id]').forEach((slide) => {
    const isActive = slide.dataset.slideId === firstSlideId
    slide.classList.toggle('is-active', isActive)
    slide.classList.remove('is-prev')
    slide.classList.remove('visible')
    slide.removeAttribute('data-preview-static')
    slide.style.removeProperty('opacity')
    slide.style.removeProperty('pointer-events')
    slide.style.removeProperty('visibility')
    slide.style.removeProperty('z-index')
  })
}

function createSafeFileName(value: string): string {
  const nextValue = Array.from(value)
    .filter((char) => char.charCodeAt(0) >= 0x20 && !'<>:"/\\|?*'.includes(char))
    .join('')
    .trim()
  return nextValue || EXPORT_FILE_NAME
}

function saveHtmlBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${fileName}.html`
  anchor.click()
  URL.revokeObjectURL(url)
}

async function inlineExternalAssets(sourceDocument: Document, targetDocument: Document): Promise<void> {
  await Promise.all([
    inlineStylesheets(sourceDocument, targetDocument),
    inlineScripts(sourceDocument, targetDocument),
    inlineImages(sourceDocument, targetDocument),
  ])
}

async function inlineStylesheets(sourceDocument: Document, targetDocument: Document): Promise<void> {
  const sourceLinks = Array.from(sourceDocument.querySelectorAll<HTMLLinkElement>('link[rel][href]')).filter((link) =>
    link.rel
      .split(/\s+/)
      .map((value) => value.trim().toLowerCase())
      .includes('stylesheet'),
  )
  const targetLinks = Array.from(targetDocument.querySelectorAll<HTMLLinkElement>('link[rel][href]')).filter((link) =>
    link.rel
      .split(/\s+/)
      .map((value) => value.trim().toLowerCase())
      .includes('stylesheet'),
  )

  await Promise.all(
    sourceLinks.map(async (sourceLink, index) => {
      const targetLink = targetLinks[index]
      if (!targetLink || !isInlineableAssetUrl(sourceLink.href)) {
        return
      }

      try {
        const cssText = await fetchTextAsset(sourceLink.href)
        if (!isInlineableTextAsset(cssText, 'style')) {
          return
        }

        const style = targetDocument.createElement('style')
        style.textContent = rewriteCssAssetUrls(cssText, sourceLink.href)
        style.setAttribute('data-export-inline-source', sourceLink.href)
        if (sourceLink.media) {
          style.media = sourceLink.media
        }
        targetLink.replaceWith(style)
      } catch {
        // Keep the original link when an asset cannot be materialized for export.
      }
    }),
  )
}

async function inlineScripts(sourceDocument: Document, targetDocument: Document): Promise<void> {
  const sourceScripts = Array.from(sourceDocument.querySelectorAll<HTMLScriptElement>('script[src]'))
  const targetScripts = Array.from(targetDocument.querySelectorAll<HTMLScriptElement>('script[src]'))

  await Promise.all(
    sourceScripts.map(async (sourceScript, index) => {
      const targetScript = targetScripts[index]
      if (!targetScript || !isInlineableAssetUrl(sourceScript.src)) {
        return
      }

      try {
        const scriptText = await fetchTextAsset(sourceScript.src)
        if (!isInlineableTextAsset(scriptText, 'script')) {
          return
        }

        const script = targetDocument.createElement('script')
        copyAttributes(sourceScript, script, new Set(['src']))
        script.textContent = scriptText
        script.setAttribute('data-export-inline-source', sourceScript.src)
        targetScript.replaceWith(script)
      } catch {
        // Preserve the original script tag if inlining fails.
      }
    }),
  )
}

async function inlineImages(sourceDocument: Document, targetDocument: Document): Promise<void> {
  const sourceImages = Array.from(sourceDocument.querySelectorAll<HTMLImageElement>('img[src]'))
  const targetImages = Array.from(targetDocument.querySelectorAll<HTMLImageElement>('img[src]'))

  await Promise.all(
    sourceImages.map(async (sourceImage, index) => {
      const targetImage = targetImages[index]
      const sourceUrl = sourceImage.currentSrc || sourceImage.src

      if (!targetImage || !sourceUrl || !isInlineableAssetUrl(sourceUrl)) {
        return
      }

      try {
        const blob = await fetchBlobAsset(sourceUrl)
        const dataUrl = await blobToDataUrl(blob)
        targetImage.src = dataUrl
        targetImage.setAttribute('src', dataUrl)
      } catch {
        // Leave the original image source intact when fetch/CORS prevents inlining.
      }
    }),
  )
}

async function fetchTextAsset(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch export asset: ${url}`)
  }

  return response.text()
}

async function fetchBlobAsset(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch export asset: ${url}`)
  }

  return response.blob()
}

function isInlineableAssetUrl(url: string): boolean {
  return Boolean(url) && !/^(data:|blob:|javascript:|about:)/i.test(url)
}

function isInlineableTextAsset(text: string, kind: 'style' | 'script'): boolean {
  const trimmed = text.trimStart().toLowerCase()
  if (
    trimmed.startsWith('<!doctype')
    || trimmed.startsWith('<html')
    || trimmed.startsWith('<head')
    || trimmed.startsWith('<body')
  ) {
    return false
  }

  if (kind === 'style') {
    return !trimmed.startsWith('<script')
  }

  return !trimmed.startsWith('<style')
}

function rewriteCssAssetUrls(cssText: string, baseUrl: string): string {
  return cssText.replace(/url\(([^)]+)\)/g, (match, rawValue: string) => {
    const unwrapped = rawValue.trim().replace(/^['"]|['"]$/g, '')
    if (!unwrapped || /^(data:|blob:|javascript:|#|https?:)/i.test(unwrapped)) {
      return match
    }

    try {
      return `url("${new URL(unwrapped, baseUrl).href}")`
    } catch {
      return match
    }
  })
}

function copyAttributes(source: Element, target: Element, ignoredNames: ReadonlySet<string>): void {
  Array.from(source.attributes).forEach((attribute) => {
    if (ignoredNames.has(attribute.name.toLowerCase())) {
      return
    }

    target.setAttribute(attribute.name, attribute.value)
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const chunkSize = 0x8000

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
    }

    const mimeType = blob.type || 'application/octet-stream'
    return `data:${mimeType};base64,${btoa(binary)}`
  })
}

function normalizeHtmlPptStandaloneStructure(document: Document): void {
  if (getDeckProfile(document) !== 'html-ppt') {
    return
  }

  const slides = Array.from(document.querySelectorAll<HTMLElement>('section.slide'))
  if (!slides.length) {
    return
  }

  if (slides.some((slide) => slide.closest('.deck'))) {
    return
  }

  const sharedParent = slides[0]?.parentElement
  if (!sharedParent || slides.some((slide) => slide.parentElement !== sharedParent)) {
    return
  }

  const deck = document.createElement('div')
  deck.className = 'deck'

  if (sharedParent === document.body) {
    slides.forEach((slide) => deck.appendChild(slide))
    document.body.insertBefore(deck, document.body.firstChild)
    return
  }

  sharedParent.replaceWith(deck)
  deck.appendChild(sharedParent)
}

function injectStandaloneExportRuntime(document: Document): void {
  document.querySelectorAll('script[data-export-runtime="standalone-animation-replay"]').forEach((script) => {
    script.remove()
  })

  const script = document.createElement('script')
  script.setAttribute('data-export-runtime', 'standalone-animation-replay')
  script.textContent = `
    (() => {
      function replaySlideAnimations(slide) {
        if (!(slide instanceof HTMLElement) || !slide.classList.contains('is-active')) {
          return
        }

        slide.querySelectorAll('[data-anim="stagger-list"]').forEach((node) => {
          if (node instanceof HTMLElement) {
            node.style.opacity = '1'
          }
        })

        void slide.offsetWidth
      }

      function replayActiveSlide() {
        replaySlideAnimations(document.querySelector('.slide.is-active'))
      }

      function observeSlides() {
        document.querySelectorAll('.slide').forEach((slide) => {
          if (!(slide instanceof HTMLElement)) {
            return
          }

          const observer = new MutationObserver(() => {
            if (slide.classList.contains('is-active')) {
              replaySlideAnimations(slide)
            }
          })

          observer.observe(slide, {
            attributes: true,
            attributeFilter: ['class'],
          })
        })
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', replayActiveSlide, { once: true })
      } else {
        replayActiveSlide()
      }

      observeSlides()
      window.addEventListener('hashchange', () => {
        requestAnimationFrame(replayActiveSlide)
      })
    })();
  `

  ;(document.body ?? document.documentElement).appendChild(script)
}

function injectStandaloneExportNavigationRuntime(document: Document): void {
  if (getDeckProfile(document) !== 'html-ppt') {
    return
  }

  document.querySelectorAll('script[data-export-runtime="standalone-slide-navigation"]').forEach((script) => {
    script.remove()
  })

  const script = document.createElement('script')
  script.setAttribute('data-export-runtime', 'standalone-slide-navigation')
  script.textContent = `
    (() => {
      const interactiveSelector = 'input, textarea, select, button, [contenteditable="true"]'
      let index = 0

      function slides() {
        const deckSlides = Array.from(document.querySelectorAll('.deck section.slide'))
        return deckSlides.length ? deckSlides : Array.from(document.querySelectorAll('section.slide'))
      }

      function syncDeckHeight(activeSlide) {
        const deck = activeSlide && activeSlide.closest ? activeSlide.closest('.deck') : null
        if (!(deck instanceof HTMLElement) || !(activeSlide instanceof HTMLElement)) {
          return
        }

        const canvasWidth = Number(document.documentElement.dataset.fsCanvasWidth) || 1280
        const canvasHeight = Number(document.documentElement.dataset.fsCanvasHeight) || 720
        const contentWidth = canvasWidth
        const contentHeight = canvasHeight
        const scale = Math.min(window.innerWidth / contentWidth, window.innerHeight / contentHeight) || 1
        deck.style.setProperty('--standalone-export-canvas-width', canvasWidth + 'px')
        deck.style.setProperty('--standalone-export-canvas-height', canvasHeight + 'px')
        deck.style.setProperty('--standalone-export-scale', String(scale))
        deck.style.setProperty('--standalone-export-offset-x', Math.max((window.innerWidth - contentWidth * scale) / 2, 0) + 'px')
        const backdrop = resolveSlideBackdrop(activeSlide)
        deck.style.setProperty('--standalone-export-stage-bg-color', backdrop.color)
        deck.style.setProperty('--standalone-export-stage-bg-image', backdrop.image)
        deck.style.setProperty('--standalone-export-stage-bg-size', backdrop.size)
        deck.style.setProperty('--standalone-export-stage-bg-position', backdrop.position)
        deck.style.setProperty('--standalone-export-stage-bg-repeat', backdrop.repeat)
        document.documentElement.style.setProperty('--standalone-export-stage-bg-color', backdrop.color)
        document.documentElement.style.setProperty('--standalone-export-stage-bg-image', backdrop.image)
        document.documentElement.style.setProperty('--standalone-export-stage-bg-size', backdrop.size)
        document.documentElement.style.setProperty('--standalone-export-stage-bg-position', backdrop.position)
        document.documentElement.style.setProperty('--standalone-export-stage-bg-repeat', backdrop.repeat)
      }

      function resolveSlideBackdrop(activeSlide) {
        const candidates = [
          activeSlide,
          activeSlide.querySelector('[data-page-scaffold="1"]'),
          activeSlide.querySelector('.ppt-page-content'),
          activeSlide.querySelector('[data-role="content"]'),
          activeSlide.querySelector('main'),
          document.body,
          document.documentElement,
        ].filter(Boolean)

        for (const node of candidates) {
          if (!(node instanceof HTMLElement)) continue
          const style = window.getComputedStyle(node)
          if (style.backgroundImage && style.backgroundImage !== 'none') {
            return {
              color: readVisibleBackgroundColor(candidates) || readThemeBackgroundColor() || 'transparent',
              image: style.backgroundImage,
              size: style.backgroundSize || 'auto',
              position: style.backgroundPosition || '0% 0%',
              repeat: style.backgroundRepeat || 'repeat',
            }
          }
        }

        return {
          color: readVisibleBackgroundColor(candidates) || readThemeBackgroundColor() || 'transparent',
          image: 'none',
          size: 'auto',
          position: '0% 0%',
          repeat: 'repeat',
        }
      }

      function readVisibleBackgroundColor(candidates) {
        for (const node of candidates) {
          if (!(node instanceof HTMLElement)) continue
          const style = window.getComputedStyle(node)
          const color = style.backgroundColor && !/^rgba?\\(\\s*0\\s*,\\s*0\\s*,\\s*0\\s*,\\s*0\\s*\\)$/i.test(style.backgroundColor)
            ? style.backgroundColor
            : ''
          if (color) return color
        }
        return ''
      }

      function readThemeBackgroundColor() {
        const rootStyle = window.getComputedStyle(document.documentElement)
        return rootStyle.getPropertyValue('--bg').trim()
          || rootStyle.getPropertyValue('--background').trim()
          || rootStyle.getPropertyValue('--deck-bg').trim()
      }

      function activeIndex(list) {
        const fromHash = /^#\\/(\\d+)/.exec(location.hash || '')
        if (fromHash) {
          return Number(fromHash[1]) - 1
        }

        const active = list.findIndex((slide) => slide.classList.contains('is-active'))
        return active >= 0 ? active : 0
      }

      function ensureProgressBar() {
        let bar = document.querySelector('.progress-bar')
        if (!bar) {
          bar = document.createElement('div')
          bar.className = 'progress-bar'
          bar.setAttribute('aria-hidden', 'true')
          bar.innerHTML = '<span></span>'
          document.body.appendChild(bar)
        }

        let fill = bar.querySelector('span')
        if (!fill) {
          fill = document.createElement('span')
          bar.appendChild(fill)
        }

        return fill
      }

      function syncNavigationChrome(list, activeSlide, nextIndex) {
        const progress = list.length ? ((nextIndex + 1) / list.length) * 100 : 0
        const fill = ensureProgressBar()
        fill.style.width = progress + '%'
        fill.style.transform = 'scaleX(' + progress / 100 + ')'

        document.querySelectorAll('.nav-dot').forEach((dot, dotIndex) => {
          const dotSlideId = dot.dataset.slideId || (dot.getAttribute('href') || '').replace(/^#/, '')
          const active = dotSlideId
            ? dotSlideId === (activeSlide.dataset.slideId || activeSlide.id)
            : dotIndex === nextIndex
          dot.classList.toggle('active', active)
          dot.classList.toggle('is-active', active)
          if (active) {
            dot.setAttribute('aria-current', 'true')
          } else {
            dot.removeAttribute('aria-current')
          }
        })
      }

      function go(nextIndex, updateHash = true) {
        const list = slides()
        if (!list.length) {
          return
        }

        index = Math.max(0, Math.min(list.length - 1, nextIndex))
        const activeSlide = list[index]

        list.forEach((slide, slideIndex) => {
          const active = slideIndex === index
          slide.classList.toggle('is-active', active)
          slide.classList.toggle('visible', active)
          slide.classList.toggle('is-prev', slideIndex < index)
          if (active && !slide.dataset.slideId && slide.id) {
            slide.dataset.slideId = slide.id
          }
        })

        syncNavigationChrome(list, activeSlide, index)
        syncDeckHeight(activeSlide)

        if (updateHash) {
          const nextHash = '#/' + (index + 1)
          if (location.hash !== nextHash) {
            history.replaceState(null, '', nextHash)
          }
        }
      }

      function isTypingTarget(target) {
        return target instanceof HTMLElement && Boolean(target.closest(interactiveSelector))
      }

      document.addEventListener('keydown', (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
          return
        }

        switch (event.key) {
          case 'ArrowRight':
          case ' ':
          case 'PageDown':
          case 'Enter':
            event.preventDefault()
            go(index + 1)
            break
          case 'ArrowLeft':
          case 'PageUp':
          case 'Backspace':
            event.preventDefault()
            go(index - 1)
            break
          case 'Home':
            event.preventDefault()
            go(0)
            break
          case 'End':
            event.preventDefault()
            go(slides().length - 1)
            break
        }
      })

      window.addEventListener('hashchange', () => {
        go(activeIndex(slides()), false)
      })
      window.addEventListener('resize', () => {
        const list = slides()
        syncDeckHeight(list[index] || list[0])
      })

      function init() {
        const list = slides()
        go(activeIndex(list), false)
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true })
      } else {
        init()
      }
    })();
  `

  ;(document.body ?? document.documentElement).appendChild(script)
}

function injectStandaloneExportStyles(document: Document): void {
  document.querySelectorAll('style[data-export-runtime="standalone-stagger-fix"]').forEach((style) => {
    style.remove()
  })

  const style = document.createElement('style')
  style.setAttribute('data-export-runtime', 'standalone-stagger-fix')
  style.textContent = `
    html[data-fs-deck-profile='html-ppt'] .deck {
      position: relative;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }

    html[data-fs-deck-profile='html-ppt'],
    html[data-fs-deck-profile='html-ppt'] body {
      width: 100vw;
      height: 100vh;
      margin: 0;
      overflow: hidden;
      background-color: var(--standalone-export-stage-bg-color);
      background-image: var(--standalone-export-stage-bg-image);
      background-size: var(--standalone-export-stage-bg-size);
      background-position: var(--standalone-export-stage-bg-position);
      background-repeat: var(--standalone-export-stage-bg-repeat);
    }

    html[data-fs-deck-profile='html-ppt'] .deck section.slide {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      width: var(--standalone-export-canvas-width, 1280px) !important;
      height: var(--standalone-export-canvas-height, 720px) !important;
      overflow: hidden !important;
      opacity: 0;
      pointer-events: none;
      transform: translateX(var(--standalone-export-offset-x, 0)) scale(var(--standalone-export-scale, 1)) !important;
      transform-origin: top left;
      visibility: hidden;
    }

    html[data-fs-deck-profile='html-ppt'] .deck section.slide.is-active {
      opacity: 1 !important;
      pointer-events: auto;
      visibility: visible !important;
      z-index: 2;
    }

    html[data-fs-deck-profile='html-ppt'] .progress-bar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      z-index: 20;
      background: transparent;
    }

    html[data-fs-deck-profile='html-ppt'] .progress-bar > span {
      display: block;
      height: 100%;
      width: 0;
      background: var(--accent, #3b6cff);
      transition: width 0.3s ease;
      transform-origin: left center;
    }

    .slide.is-active [data-anim='stagger-list'] { opacity: 1 !important; }
    [data-preview-static='true'] [data-anim='stagger-list'] { opacity: 1 !important; }
  `
  document.head.appendChild(style)
}
