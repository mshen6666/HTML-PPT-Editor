import { toJpeg } from 'html-to-image'

import {
  createDeckDocument,
  parseControlledDeck,
  prepareSlideForStaticView,
} from '../deck-contract/deckContract'
import {
  EXPORT_IMAGE_PIXEL_RATIO,
  ensureStaticCaptureStyles,
} from '../export-pptx/exportDeckToPptx'
import {
  createExportFrame,
  EXPORT_LOAD_TIMEOUT_MS,
  type ExportViewportSize,
  waitForAnimationFrames,
  waitForExportSurfaceReady,
} from '../export-runtime/exportFrame'
import { resolveCanvasDimensions } from '../app/previewLayout'

const EXPORT_FILE_NAME = '可编辑演示'
const EXPORT_CAPTURE_TIMEOUT_MS = 20000
const PDF_MIME_TYPE = 'application/pdf'

type PdfPage = {
  imageBytes: Uint8Array
  imageWidth: number
  imageHeight: number
  pageWidth: number
  pageHeight: number
}

export async function exportDeckToPdf(
  html: string,
  options?: {
    onProgress?: (message: string) => void
  },
): Promise<void> {
  const document = createDeckDocument(html)
  const deck = parseControlledDeck(document)
  const canvasDimensions = resolveCanvasDimensions(document)
  const exportFrame = await createExportFrame(html, canvasDimensions, { scripts: 'remove' })
  const exportDocument = exportFrame.contentDocument

  if (!exportDocument) {
    exportFrame.remove()
    throw new Error('PDF 导出环境初始化失败')
  }

  ensureStaticCaptureStyles(exportDocument)
  await waitForExportSurfaceReady(exportDocument, exportDocument.body ?? exportDocument.documentElement, EXPORT_LOAD_TIMEOUT_MS)

  const pages: PdfPage[] = []

  try {
    for (const [index, slideId] of deck.slideOrder.entries()) {
      options?.onProgress?.(`正在导出 PDF（${index + 1}/${deck.slideOrder.length}）…`)
      const slidePage = await exportSlideToPdfPage(exportFrame, slideId, canvasDimensions)
      pages.push(slidePage)
      await waitForAnimationFrames()
    }
  } finally {
    exportFrame.remove()
  }

  if (!pages.length) {
    throw new Error('PDF 导出未生成页面')
  }

  savePdfBlob(buildPdfBlob(pages), createSafeFileName(document.title || EXPORT_FILE_NAME))
}

async function exportSlideToPdfPage(
  exportFrame: HTMLIFrameElement,
  slideId: string,
  canvasDimensions: ExportViewportSize,
): Promise<PdfPage> {
  const exportDocument = exportFrame.contentDocument
  if (!exportDocument) {
    throw new Error('PDF 导出环境初始化失败')
  }

  const slideNode = exportDocument.querySelector<HTMLElement>(`section.slide[data-slide-id="${slideId}"]`)

  if (!slideNode) {
    throw new Error(`未找到要导出的页面 ${slideId}`)
  }

  prepareSlideForStaticView(exportDocument, slideId)
  await waitForExportSurfaceReady(exportDocument, slideNode, EXPORT_LOAD_TIMEOUT_MS)

  const preparedSlideNode =
    exportDocument.querySelector<HTMLElement>(`section.slide[data-slide-id="${slideId}"]`) ?? slideNode
  const captureNode = resolvePdfCaptureNode(exportDocument, preparedSlideNode)
  const imageDataUrl = await captureFullSlideAsJpeg(captureNode, canvasDimensions)
  const imageBytes = decodeDataUrlToBytes(imageDataUrl)

  return {
    imageBytes,
    imageWidth: Math.round(canvasDimensions.width * EXPORT_IMAGE_PIXEL_RATIO),
    imageHeight: Math.round(canvasDimensions.height * EXPORT_IMAGE_PIXEL_RATIO),
    pageWidth: canvasDimensions.width,
    pageHeight: canvasDimensions.height,
  }
}

function resolvePdfCaptureNode(document: Document, fallbackNode: HTMLElement): HTMLElement {
  return document.body ?? fallbackNode
}

async function captureFullSlideAsJpeg(
  captureNode: HTMLElement,
  canvasDimensions: ExportViewportSize,
): Promise<string> {
  return withTimeout(
    toJpeg(captureNode, {
      cacheBust: true,
      pixelRatio: EXPORT_IMAGE_PIXEL_RATIO,
      width: canvasDimensions.width,
      height: canvasDimensions.height,
      quality: 0.96,
      skipFonts: true,
    }),
    EXPORT_CAPTURE_TIMEOUT_MS,
    '整页截图超时',
  )
}

function buildPdfBlob(pages: PdfPage[]): Blob {
  const writer = new PdfWriter()
  const objectCount = 2 + pages.length * 3
  const pageObjectIds: number[] = []

  writer.writeText('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n')

  for (let i = 0; i < pages.length; i += 1) {
    pageObjectIds.push(3 + i * 3)
  }

  writer.startObject(1)
  writer.writeText('<< /Type /Catalog /Pages 2 0 R >>\n')
  writer.endObject()

  writer.startObject(2)
  writer.writeText(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\n`)
  writer.endObject()

  pages.forEach((page, index) => {
    const pageObjectId = pageObjectIds[index]
    const imageObjectId = pageObjectId + 1
    const contentObjectId = pageObjectId + 2
    const imageName = `Im${index + 1}`
    const contentStream = `q ${formatPdfNumber(page.pageWidth)} 0 0 ${formatPdfNumber(page.pageHeight)} 0 0 cm /${imageName} Do Q\n`
    const contentBytes = encodePdfText(contentStream)

    writer.startObject(pageObjectId)
    writer.writeText(
      `<< /Type /Page /Parent 2 0 R /Resources << /XObject << /${imageName} ${imageObjectId} 0 R >> /ProcSet [/PDF /ImageC] >> /MediaBox [0 0 ${formatPdfNumber(page.pageWidth)} ${formatPdfNumber(page.pageHeight)}] /Contents ${contentObjectId} 0 R >>\n`,
    )
    writer.endObject()

    writer.startObject(imageObjectId)
    writer.writeText(
      `<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.imageBytes.length} >>\nstream\n`,
    )
    writer.writeBytes(page.imageBytes)
    writer.writeText('\nendstream\n')
    writer.endObject()

    writer.startObject(contentObjectId)
    writer.writeText(`<< /Length ${contentBytes.length} >>\nstream\n`)
    writer.writeBytes(contentBytes)
    writer.writeText('endstream\n')
    writer.endObject()
  })

  const startXref = writer.length
  writer.writeText(`xref\n0 ${objectCount + 1}\n`)
  writer.writeText('0000000000 65535 f \n')

  for (let i = 1; i <= objectCount; i += 1) {
    writer.writeText(`${String(writer.offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`)
  }

  writer.writeText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`)

  return new Blob(writer.chunks.map((chunk) => chunk.slice()), { type: PDF_MIME_TYPE })
}

function formatPdfNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${Math.round(value * 1000) / 1000}`
}

function createSafeFileName(value: string): string {
  const nextValue = Array.from(value)
    .filter((char) => {
      const codePoint = char.codePointAt(0) ?? 0
      return codePoint > 31 && !'<>:"/\\|?*'.includes(char)
    })
    .join('')
    .trim()
  return nextValue || EXPORT_FILE_NAME
}

export function savePdfBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${fileName}.pdf`
  anchor.click()
  URL.revokeObjectURL(url)
}

function decodeDataUrlToBytes(dataUrl: string): Uint8Array {
  const base64Index = dataUrl.indexOf(',')
  if (base64Index < 0) {
    throw new Error('无效的图片数据')
  }

  const binary = atob(dataUrl.slice(base64Index + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function encodePdfText(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

class PdfWriter {
  readonly chunks: Uint8Array[] = []
  readonly offsets: number[] = [0]
  length = 0

  writeText(text: string): void {
    this.writeBytes(encodePdfText(text))
  }

  writeBytes(bytes: Uint8Array): void {
    this.chunks.push(bytes)
    this.length += bytes.length
  }

  startObject(id: number): void {
    this.offsets[id] = this.length
    this.writeText(`${id} 0 obj\n`)
  }

  endObject(): void {
    this.writeText('endobj\n')
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeout)
        reject(error)
      },
    )
  })
}
