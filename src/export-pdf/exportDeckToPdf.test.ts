import { describe, expect, it, vi } from 'vitest'

import { savePdfBlob } from './exportDeckToPdf'

describe('exportDeckToPdf helpers', () => {
  it('downloads pdf blobs with a pdf extension', () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.fn()
    const anchor = {
      href: '',
      download: '',
      click,
    } as unknown as HTMLAnchorElement
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    savePdfBlob(blob, 'Deck Export')

    expect(anchor.href).toBe('blob:pdf')
    expect(anchor.download).toBe('Deck Export.pdf')
    expect(click).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pdf')

    createElement.mockRestore()
    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
  })
})
