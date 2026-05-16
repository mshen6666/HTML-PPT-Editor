import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { JSDOM } from 'jsdom'

export type BeautifulHtmlTemplateCatalogEntry = {
  slug: string
  name: string
}

export async function loadBeautifulTemplatePreviewMap(templatesDir: string): Promise<Record<string, string>> {
  const catalog = await readBeautifulTemplateCatalog(templatesDir)
  const previewMap: Record<string, string> = {}

  await Promise.all(
    catalog.map(async (template) => {
      const templatePath = path.join(templatesDir, template.slug, 'template.html')

      try {
        const html = await readFile(templatePath, 'utf-8')
        previewMap[template.slug] = buildBeautifulTemplatePreviewHtml({
          slug: template.slug,
          html,
        })
      } catch {
        // Keep the endpoint resilient when a vendored template is incomplete.
      }
    }),
  )

  return previewMap
}

export function buildBeautifulTemplatePreviewHtml(args: {
  slug: string
  html: string
}): string {
  const dom = new JSDOM(args.html)
  const document = dom.window.document
  const firstSlide = findFirstSlide(document)

  if (!firstSlide) {
    throw new Error(`No previewable slide found for ${args.slug}`)
  }

  firstSlide.classList.add('is-active')
  if (firstSlide.classList.contains('slide')) {
    firstSlide.classList.add('active')
  }
  firstSlide.setAttribute('data-slide-id', `beautiful-${args.slug}-slide-1`)

  const fontLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[href]'))
    .filter((link) => {
      const href = link.getAttribute('href') ?? ''
      const rel = (link.getAttribute('rel') ?? '').toLowerCase()
      return href.startsWith('https://fonts.') || rel === 'preconnect'
    })
    .map((link) => link.outerHTML)
    .join('\n')

  const styles = Array.from(document.querySelectorAll<HTMLStyleElement>('style'))
    .map((style) => style.textContent ?? '')
    .join('\n\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(args.slug)} Preview</title>
${fontLinks}
<style>${styles}</style>
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111}
body{min-height:100vh}
.beautiful-template-preview-stage{width:100vw;height:100vh;overflow:hidden;position:relative}
.beautiful-template-preview-stage>.slide,
.beautiful-template-preview-stage>section,
.beautiful-template-preview-stage>div{
  display:flex!important;
  opacity:1!important;
  visibility:visible!important;
  pointer-events:auto!important;
  transform:none!important;
}
.beautiful-template-preview-stage>.slide{
  width:100vw!important;
  height:100vh!important;
  min-height:100vh!important;
}
.hint,.nav-controls,.progress-bar,.slide-counter,.controls{display:none!important}
</style>
</head>
<body>
<div class="beautiful-template-preview-stage">
${firstSlide.outerHTML}
</div>
</body>
</html>`
}

async function readBeautifulTemplateCatalog(templatesDir: string): Promise<BeautifulHtmlTemplateCatalogEntry[]> {
  try {
    const catalogText = await readFile(path.join(templatesDir, '_catalog.json'), 'utf-8')
    const parsed = JSON.parse(catalogText) as { templates?: BeautifulHtmlTemplateCatalogEntry[] }
    return Array.isArray(parsed.templates) ? parsed.templates : []
  } catch {
    const entries = await readdir(templatesDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ slug: entry.name, name: entry.name }))
      .sort((left, right) => left.slug.localeCompare(right.slug))
  }
}

function findFirstSlide(document: Document): HTMLElement | null {
  return document.querySelector<HTMLElement>('deck-stage > section')
    ?? document.querySelector<HTMLElement>('section.slide')
    ?? document.querySelector<HTMLElement>('.slides-container > .slide')
    ?? document.querySelector<HTMLElement>('.deck > .slide')
    ?? document.querySelector<HTMLElement>('.presentation > .slide')
    ?? document.querySelector<HTMLElement>('.slides > .slide')
    ?? document.querySelector<HTMLElement>('body > .slide')
    ?? document.querySelector<HTMLElement>('.slide')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
