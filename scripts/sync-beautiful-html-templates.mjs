import { mkdir, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const REPO_RAW_BASE = 'https://raw.githubusercontent.com/zarazhangrui/beautiful-html-templates/main'
const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const templatesRoot = path.join(
  repoRoot,
  'server',
  'embedded-skills',
  'html-ppt',
  'templates',
  'beautiful-html-templates',
)
const frontendCatalogPath = path.join(repoRoot, 'src', 'app', 'beautifulHtmlTemplateCatalog.ts')

async function main() {
  const [catalog, license] = await Promise.all([
    fetchJson(`${REPO_RAW_BASE}/index.json`),
    fetchText(`${REPO_RAW_BASE}/LICENSE`),
  ])

  await rm(templatesRoot, { recursive: true, force: true })
  await mkdir(templatesRoot, { recursive: true })

  await writeFile(path.join(templatesRoot, 'LICENSE'), license, 'utf-8')
  await writeFile(
    path.join(templatesRoot, '_catalog.json'),
    `${JSON.stringify(catalog, null, 2)}\n`,
    'utf-8',
  )

  for (const template of catalog.templates) {
    const templateDir = path.join(templatesRoot, template.slug)
    await mkdir(templateDir, { recursive: true })

    const templateHtml = await fetchText(`${REPO_RAW_BASE}/templates/${template.slug}/template.html`)
    await writeFile(path.join(templateDir, 'template.html'), templateHtml, 'utf-8')

    for (const assetPath of findLocalScriptPaths(templateHtml)) {
      const assetText = await fetchText(`${REPO_RAW_BASE}/templates/${template.slug}/${assetPath}`).catch(() => null)
      if (assetText) {
        await writeFile(path.join(templateDir, assetPath), assetText, 'utf-8')
      }
    }
  }

  await writeFile(frontendCatalogPath, createFrontendCatalog(catalog.templates), 'utf-8')
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url))
}

async function fetchText(url) {
  const response = await fetchWithRetry(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return response.text()
}

async function fetchWithRetry(url, attempts = 4) {
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url)
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      await new Promise((resolve) => setTimeout(resolve, attempt * 750))
    }
  }

  if (process.platform === 'win32') {
    const text = await fetchTextWithPowerShell(url)
    return new Response(text)
  }

  throw lastError
}

async function fetchTextWithPowerShell(url) {
  const { stdout } = await execFileAsync('powershell', [
    '-NoProfile',
    '-Command',
    `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; (Invoke-WebRequest -Uri ${JSON.stringify(url)} -UseBasicParsing -TimeoutSec 60).Content`,
  ], {
    maxBuffer: 1024 * 1024 * 20,
  })

  return stdout
}

function findLocalScriptPaths(html) {
  const paths = new Set()
  const scriptPattern = /<script[^>]+src="([^"]+)"/g
  for (const match of html.matchAll(scriptPattern)) {
    const src = match[1]
    if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('/')) {
      paths.add(src)
    }
  }
  return [...paths]
}

function createFrontendCatalog(templates) {
  const entries = templates.map((template) => ({
    source: 'beautiful-html-templates',
    name: template.slug,
    displayName: template.name,
    scenario: template.occasion.slice(0, 4).join(' / '),
    visualKeywords: template.mood,
    fit: template.best_for,
    promptStarter: `请以 beautiful-html-templates 的 ${template.slug} 模板作为起始视觉系统，保留它的字体、色彩、装饰语言和版式节奏，把内容替换成我的主题。最终输出需要适配 HTML PPT 编辑器：每一页使用 section.slide，并保留键盘翻页体验。`,
    tagline: template.tagline,
    mood: template.mood,
    tone: template.tone,
    occasion: template.occasion,
    formality: template.formality,
    density: template.density,
    scheme: template.scheme,
    bestFor: template.best_for,
    avoidFor: template.avoid_for,
    slideCount: template.slide_count,
  }))

  return `export const beautifulHtmlTemplates = ${JSON.stringify(entries, null, 2)}\n`
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
