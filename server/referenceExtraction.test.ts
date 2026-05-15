// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { extractReferenceText } from './referenceExtraction'

describe('extractReferenceText', () => {
  it('extracts utf-8 plain text references', async () => {
    const result = await extractReferenceText({
      buffer: Buffer.from('# Launch Brief\n\nUse the Safety AI positioning.', 'utf8'),
      contentType: 'text/markdown',
      ext: '.md',
    })

    expect(result).toEqual({
      status: 'extracted',
      excerpt: '# Launch Brief\n\nUse the Safety AI positioning.',
      charCount: 46,
      truncated: false,
    })
  })

  it('falls back to gb18030 when plain text bytes are not valid utf-8', async () => {
    const result = await extractReferenceText({
      buffer: Buffer.from('bcbeb6c8b8b4c5cc0ad3aacad5d4f6b3a420343225', 'hex'),
      contentType: 'text/plain',
      ext: '.txt',
    })

    expect(result).toEqual({
      status: 'extracted',
      excerpt: '季度复盘\n营收增长 42%',
      charCount: 13,
      truncated: false,
    })
  })
})
