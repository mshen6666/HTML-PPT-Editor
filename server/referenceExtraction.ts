import JSZip from 'jszip'
import path from 'node:path'

const REFERENCE_TEXT_EXCERPT_LIMIT = 24_000

const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'])

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
}

const PLAIN_TEXT_EXTENSIONS = new Set([
  '.csv',
  '.htm',
  '.html',
  '.json',
  '.md',
  '.markdown',
  '.tsv',
  '.txt',
  '.xml',
])

const MODERN_OFFICE_TEXT_EXTENSIONS = new Set([
  '.docx',
  '.xlsx',
])

const UNSUPPORTED_BINARY_EXTENSIONS = new Set([
  '.doc',
  '.pdf',
  '.ppt',
  '.pptx',
  '.xls',
])

export type ExtractedReferenceText = {
  status: 'extracted' | 'unsupported' | 'failed'
  excerpt: string
  charCount: number
  truncated: boolean
  reason?: string
}

export type ExtractedDocxImage = {
  fileName: string
  contentType: string
  buffer: Buffer
}

export async function extractReferenceText(args: {
  buffer: Buffer
  contentType: string
  ext: string
}): Promise<ExtractedReferenceText> {
  const contentType = args.contentType.toLowerCase()
  const ext = args.ext.toLowerCase()

  if (UNSUPPORTED_BINARY_EXTENSIONS.has(ext)) {
    return unsupported()
  }

  if (isPlainTextReference(contentType, ext)) {
    return extractPlainText(args.buffer)
  }

  if (ext === '.xlsx') {
    return extractSpreadsheetText(args.buffer)
  }

  if (ext === '.docx') {
    return extractDocxText(args.buffer)
  }

  return unsupported()
}

export function isContentReferenceAsset(args: {
  contentType?: string
  ext?: string
}): boolean {
  const contentType = args.contentType?.toLowerCase() ?? ''
  const ext = args.ext?.toLowerCase() ?? ''

  return isPlainTextReference(contentType, ext)
    || MODERN_OFFICE_TEXT_EXTENSIONS.has(ext)
}

function isPlainTextReference(contentType: string, ext: string): boolean {
  return contentType.startsWith('text/')
    || contentType.includes('markdown')
    || contentType.includes('json')
    || contentType === 'application/xml'
    || contentType.endsWith('+xml')
    || PLAIN_TEXT_EXTENSIONS.has(ext)
}

function extractPlainText(buffer: Buffer): ExtractedReferenceText {
  try {
    const decoded = decodePlainTextBuffer(buffer)
    return finalizeExtractedText(decoded)
  } catch (error) {
    return failed(error)
  }
}

function decodePlainTextBuffer(buffer: Buffer): string {
  const decoders = collectCandidateDecoders(buffer)
  let bestResult = ''
  let bestScore = Number.NEGATIVE_INFINITY

  for (const decoder of decoders) {
    const decoded = decoder()
    const score = scoreDecodedText(decoded)
    if (score > bestScore) {
      bestScore = score
      bestResult = decoded
    }
  }

  return bestResult
}

function collectCandidateDecoders(buffer: Buffer): Array<() => string> {
  const decoders: Array<() => string> = [
    () => decodeWithTextDecoder(buffer, 'utf-8'),
    () => decodeWithTextDecoder(buffer, 'gb18030'),
    () => decodeWithTextDecoder(buffer, 'gbk'),
    () => decodeWithTextDecoder(buffer, 'big5'),
    () => decodeWithTextDecoder(buffer, 'utf-16le'),
  ]

  if (hasUtf16Bom(buffer, 0xff, 0xfe)) {
    decoders.unshift(() => decodeWithTextDecoder(stripBom(buffer, 2), 'utf-16le'))
  }

  if (hasUtf16Bom(buffer, 0xfe, 0xff)) {
    decoders.unshift(() => decodeWithTextDecoder(stripBom(buffer, 2), 'utf-16be'))
  }

  return decoders
}

function decodeWithTextDecoder(buffer: Buffer, encoding: string): string {
  return new TextDecoder(encoding).decode(buffer).replace(/^\uFEFF/, '')
}

function hasUtf16Bom(buffer: Buffer, firstByte: number, secondByte: number): boolean {
  return buffer.length >= 2 && buffer[0] === firstByte && buffer[1] === secondByte
}

function stripBom(buffer: Buffer, byteLength: number): Buffer {
  return buffer.subarray(byteLength)
}

function scoreDecodedText(value: string): number {
  if (!value) {
    return 0
  }

  let score = 0
  let replacementCount = 0
  let controlCount = 0
  let readableCount = 0
  let cjkCount = 0
  let latinWordCount = 0

  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0
    if (char === '\uFFFD') {
      replacementCount += 1
      score -= 12
      continue
    }

    if (isAllowedWhitespace(char)) {
      readableCount += 1
      score += 0.2
      continue
    }

    if (isSuspiciousControl(codePoint)) {
      controlCount += 1
      score -= 8
      continue
    }

    if (isCjk(codePoint)) {
      cjkCount += 1
      readableCount += 1
      score += 4
      continue
    }

    if (isLatinWordLike(codePoint)) {
      latinWordCount += 1
      readableCount += 1
      score += 2
      continue
    }

    if (isReadablePunctuation(codePoint)) {
      readableCount += 1
      score += 0.5
      continue
    }

    score -= 1
  }

  if (replacementCount > 0 && cjkCount === 0) {
    score -= replacementCount * 8
  }

  if (controlCount > 0) {
    score -= controlCount * 4
  }

  if (readableCount > 0) {
    score += Math.min(readableCount / Math.max(value.length, 1), 1) * 4
  }

  if (cjkCount > 0) {
    score += 8
  } else if (latinWordCount > 0) {
    score += 4
  }

  return score
}

function isAllowedWhitespace(char: string): boolean {
  return char === '\n' || char === '\r' || char === '\t' || char === ' '
}

function isSuspiciousControl(codePoint: number): boolean {
  return (codePoint >= 0 && codePoint <= 0x08)
    || codePoint === 0x0b
    || codePoint === 0x0c
    || (codePoint >= 0x0e && codePoint <= 0x1f)
    || (codePoint >= 0x7f && codePoint <= 0x9f)
}

function isCjk(codePoint: number): boolean {
  return (codePoint >= 0x3400 && codePoint <= 0x4dbf)
    || (codePoint >= 0x4e00 && codePoint <= 0x9fff)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
}

function isLatinWordLike(codePoint: number): boolean {
  return (codePoint >= 0x30 && codePoint <= 0x39)
    || (codePoint >= 0x41 && codePoint <= 0x5a)
    || (codePoint >= 0x61 && codePoint <= 0x7a)
}

function isReadablePunctuation(codePoint: number): boolean {
  return (codePoint >= 0x21 && codePoint <= 0x2f)
    || (codePoint >= 0x3a && codePoint <= 0x40)
    || (codePoint >= 0x5b && codePoint <= 0x60)
    || (codePoint >= 0x7b && codePoint <= 0x7e)
    || (codePoint >= 0x2000 && codePoint <= 0x206f)
    || (codePoint >= 0x3000 && codePoint <= 0x303f)
}

async function extractSpreadsheetText(buffer: Buffer): Promise<ExtractedReferenceText> {
  try {
    const zip = await JSZip.loadAsync(buffer)
    const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string')
    const sharedStrings = sharedStringsXml ? extractTagValues(sharedStringsXml, 't') : []
    const worksheetPaths = Object.keys(zip.files)
      .filter((filePath) => /^xl\/worksheets\/sheet\d+\.xml$/.test(filePath))
      .sort()

    const sheetBlocks: string[] = []
    for (const worksheetPath of worksheetPaths) {
      const worksheetXml = await zip.file(worksheetPath)?.async('string')
      if (!worksheetXml) {
        continue
      }

      const rows = Array.from(worksheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g))
        .map((match) => extractSpreadsheetRow(match[1], sharedStrings))
        .filter(Boolean)
      if (rows.length) {
        sheetBlocks.push(rows.join('\n'))
      }
    }

    return finalizeExtractedText(sheetBlocks.join('\n\n'))
  } catch (error) {
    return failed(error)
  }
}

function extractSpreadsheetRow(rowXml: string, sharedStrings: string[]): string {
  const cellValues = Array.from(rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g))
    .map((match) => {
      const attributes = match[1] ?? ''
      const cellXml = match[2] ?? ''
      const inlineText = extractInlineSpreadsheetText(cellXml)
      if (inlineText) {
        return inlineText
      }

      const rawValue = extractSingleTagValue(cellXml, 'v')
      if (!rawValue) {
        return ''
      }

      const isSharedString = /\bt="s"/.test(attributes)
      if (isSharedString) {
        const index = Number(rawValue)
        return Number.isFinite(index) ? sharedStrings[index] ?? '' : ''
      }

      return decodeXmlEntities(rawValue)
    })
    .map((value) => value.trim())
    .filter(Boolean)

  return cellValues.join(' | ')
}

function extractInlineSpreadsheetText(cellXml: string): string {
  return extractTagValues(cellXml, 't')
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ')
}

async function extractDocxText(buffer: Buffer): Promise<ExtractedReferenceText> {
  try {
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')?.async('string')
    if (!documentXml) {
      return finalizeExtractedText('')
    }

    const blocks = Array.from(documentXml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g))
      .map((match) => extractTagValues(match[1] ?? '', 'w:t').join(' ').trim())
      .filter(Boolean)
    const text = blocks.join('\n')

    return finalizeExtractedText(text)
  } catch (error) {
    return failed(error)
  }
}

export async function extractDocxFullText(buffer: Buffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')?.async('string')
    if (!documentXml) return ''

    const blocks = Array.from(documentXml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g))
      .map((match) => extractTagValues(match[1] ?? '', 'w:t').join(' ').trim())
      .filter(Boolean)

    const headerFooterBlocks = await extractHeaderFooterText(zip)

    return [...blocks, ...headerFooterBlocks].join('\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  } catch {
    return ''
  }
}

async function extractHeaderFooterText(zip: JSZip): Promise<string[]> {
  const paths = Object.keys(zip.files).filter(
    (p) => /^word\/(header|footer)\d*\.xml$/.test(p),
  )
  const blocks: string[] = []
  for (const filePath of paths) {
    const xml = await zip.file(filePath)?.async('string')
    if (!xml) continue
    const text = Array.from(xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g))
      .map((match) => extractTagValues(match[1] ?? '', 'w:t').join(' ').trim())
      .filter(Boolean)
    blocks.push(...text)
  }
  return blocks
}

export async function extractDocxImages(buffer: Buffer): Promise<ExtractedDocxImage[]> {
  try {
    const zip = await JSZip.loadAsync(buffer)
    const imageFiles = Object.keys(zip.files).filter((filePath) => {
      const lower = filePath.toLowerCase()
      if (!lower.startsWith('word/media/')) return false
      const ext = path.extname(lower)
      return SUPPORTED_IMAGE_EXTENSIONS.has(ext)
    })

    const results = await Promise.all(
      imageFiles.map(async (filePath) => {
        const imageBuffer = await zip.file(filePath)?.async('nodebuffer')
        const fileName = filePath.split('/').pop() ?? 'image.png'
        const ext = path.extname(fileName).toLowerCase()
        const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream'
        return {
          fileName,
          contentType,
          buffer: imageBuffer ?? Buffer.alloc(0),
        }
      }),
    )

    return results.filter((img) => img.buffer.length > 0)
  } catch {
    return []
  }
}

function extractTagValues(xml: string, tagName: string): string[] {
  const escapedTagName = tagName.replace(':', '\\:')
  return Array.from(xml.matchAll(new RegExp(`<${escapedTagName}[^>]*>([\\s\\S]*?)<\\/${escapedTagName}>`, 'g')))
    .map((match) => decodeXmlEntities(stripXml(match[1] ?? '')).trim())
    .filter(Boolean)
}

function extractSingleTagValue(xml: string, tagName: string): string {
  return extractTagValues(xml, tagName)[0] ?? ''
}

function stripXml(value: string): string {
  return value.replace(/<[^>]+>/g, '')
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function finalizeExtractedText(value: string): ExtractedReferenceText {
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const excerpt = normalized.slice(0, REFERENCE_TEXT_EXCERPT_LIMIT)

  return {
    status: 'extracted',
    excerpt,
    charCount: normalized.length,
    truncated: normalized.length > excerpt.length,
  }
}

function unsupported(): ExtractedReferenceText {
  return {
    status: 'unsupported',
    excerpt: '',
    charCount: 0,
    truncated: false,
    reason: '暂不支持提取该文件类型的文字内容。',
  }
}

function failed(error: unknown): ExtractedReferenceText {
  return {
    status: 'failed',
    excerpt: '',
    charCount: 0,
    truncated: false,
    reason: error instanceof Error ? error.message : '文字内容提取失败。',
  }
}
