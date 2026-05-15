import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'

const sampleDeck = `<!doctype html>
<html lang="en" data-fs-editable-deck="1">
  <head>
    <meta charset="UTF-8" />
    <title>示例演示</title>
  </head>
  <body>
    <div class="slides-offset">
      <section class="slide" data-slide-id="slide-1" id="slide-1">
        <div data-node-id="text-hero" data-edit-kind="text">你好，世界</div>
      </section>
    </div>
  </body>
</html>`

describe('App PPTX export', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows intelligent pptx export progress in a side panel and downloads after user confirmation', async () => {
    const user = userEvent.setup()
    let finishExport: () => void = () => undefined
    const exportCanFinish = new Promise<void>((resolve) => {
      finishExport = resolve
    })
    const fetchMock = vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === '/api/agent/pptx-export') {
        expect(init?.method).toBe('POST')
        const body = JSON.parse(String(init?.body))
        expect(body.currentDeckHtml).toContain('data-fs-editable-deck="1"')
        return new Response(new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'status', phase: 'queued', label: '正在排队准备智能导出' })}\n`))
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'status', phase: 'drafting', label: '正在生成可编辑 PPTX' })}\n`))
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'assistant_done', text: '我正在检查页面结构并转换成可编辑对象。' })}\n`))
            await exportCanFinish
            controller.enqueue(encoder.encode(`${JSON.stringify({
              type: 'pptx_export_ready',
              summary: '已生成可编辑 PPTX。',
              artifactRef: {
                artifactId: 'artifact-pptx',
                fileName: 'export.pptx',
                contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                sizeBytes: 10,
              },
              downloadUrl: '/api/agent/sessions/session-a/artifacts/artifact-pptx/download',
            })}\n`))
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'done' })}\n`))
            controller.close()
          },
        }))
      }
      if (url === '/api/agent/sessions/session-a/artifacts/artifact-pptx/download') {
        return new Response('pptx bytes', {
          headers: {
            'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          },
        })
      }
      return new Response('', { status: 404 })
    })
    render(<App initialDeckHtml={sampleDeck} />)

    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pptx')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.fn()
    const anchor = {
      href: '',
      download: '',
      click,
    } as unknown as HTMLAnchorElement
    const realCreateElement = document.createElement.bind(document)
    const createElement = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName.toLowerCase() === 'a') {
        return anchor
      }
      return realCreateElement(tagName, options)
    }) as typeof document.createElement)

    await user.click(screen.getByRole('button', { name: '智能导出 PPTX' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/agent/pptx-export', expect.objectContaining({
        method: 'POST',
      }))
      const dialog = screen.getByRole('dialog', { name: '智能导出 PPTX' })
      expect(within(dialog).getByText('请不要关闭窗口或刷新页面，否则导出会失败。')).toBeInTheDocument()
      expect(within(dialog).getByText('正在排队准备智能导出')).toBeInTheDocument()
      expect(within(dialog).getByText('正在生成可编辑 PPTX')).toBeInTheDocument()
      expect(within(dialog).getByText('我正在检查页面结构并转换成可编辑对象。')).toBeInTheDocument()
    })

    finishExport()

    await waitFor(() => {
      const dialog = screen.getByRole('dialog', { name: '智能导出 PPTX' })
      expect(within(dialog).getAllByText('PPTX 已准备好').length).toBeGreaterThan(0)
      expect(within(dialog).getByText('已生成可编辑 PPTX。')).toBeInTheDocument()
    })
    expect(fetchMock).not.toHaveBeenCalledWith('/api/agent/sessions/session-a/artifacts/artifact-pptx/download')
    expect(click).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '下载 PPTX' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/agent/sessions/session-a/artifacts/artifact-pptx/download')
    })
    expect(click).toHaveBeenCalledTimes(1)
    expect(anchor.download).toBe('export.pptx')
    expect(anchor.href).toBe('blob:pptx')

    createElement.mockRestore()
    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
  })

  it('shows intelligent pptx export errors in the side panel and allows retrying', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
      if (String(input) === '/api/agent/pptx-export') {
        return new Response([
          JSON.stringify({ type: 'status', phase: 'drafting', label: '正在生成可编辑 PPTX' }),
          JSON.stringify({ type: 'error', message: 'PPTX 转换失败：缺少字体资源' }),
        ].join('\n'))
      }
      return new Response('', { status: 404 })
    })
    render(<App initialDeckHtml={sampleDeck} />)

    await user.click(screen.getByRole('button', { name: '智能导出 PPTX' }))

    await waitFor(() => {
      const dialog = screen.getByRole('dialog', { name: '智能导出 PPTX' })
      expect(within(dialog).getByText('导出失败')).toBeInTheDocument()
      expect(within(dialog).getAllByText('PPTX 转换失败：缺少字体资源').length).toBeGreaterThan(0)
      expect(within(dialog).getByRole('button', { name: '重新导出' })).toBeInTheDocument()
    })
    expect(countPptxExportRequests(fetchMock)).toBe(1)

    await user.click(screen.getByRole('button', { name: '重新导出' }))

    await waitFor(() => {
      expect(countPptxExportRequests(fetchMock)).toBe(2)
    })
  })
})

function countPptxExportRequests(fetchMock: { mock: { calls: Array<Parameters<typeof fetch>> } }): number {
  return fetchMock.mock.calls.filter(([input]) => String(input) === '/api/agent/pptx-export').length
}
