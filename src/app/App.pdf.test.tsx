import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { exportDeckToPdf, loadExportDeckToPdf } = vi.hoisted(() => ({
  exportDeckToPdf: vi.fn(() => Promise.resolve()),
  loadExportDeckToPdf: vi.fn(() => Promise.resolve({ exportDeckToPdf })),
}))

vi.mock('../export-pdf/loadExportDeckToPdf', () => ({
  loadExportDeckToPdf,
}))

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

describe('App PDF export', () => {
  beforeEach(() => {
    exportDeckToPdf.mockClear()
    loadExportDeckToPdf.mockClear()
    vi.restoreAllMocks()
  })

  it('exports the current deck as pdf from the toolbar', async () => {
    const user = userEvent.setup()
    render(<App initialDeckHtml={sampleDeck} />)

    await user.click(screen.getByRole('button', { name: '导出 PDF' }))

    expect(loadExportDeckToPdf).toHaveBeenCalledTimes(1)
    expect(exportDeckToPdf).toHaveBeenCalledTimes(1)
    const firstCall = exportDeckToPdf.mock.calls.at(0)
    expect(firstCall).toBeDefined()
    const exportedHtml = (firstCall as [string] | undefined)?.[0]
    expect(exportedHtml).toContain('data-fs-editable-deck="1"')
    expect(exportedHtml).toContain('data-slide-id="slide-1"')
  })
})
