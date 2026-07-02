import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GuideTheme } from '../../../htmlPptSkillGuideData'
import { ThemeCard } from './ThemeCard'

const referenceTheme: GuideTheme = {
  name: 'amber-aurora',
  label: '扁豆紫蜜陀僧 · 国风治愈',
  category: 'creator',
  tone: ['自然', '有机'],
  useCases: '文旅宣传。',
  promptHint: '参考 oh-my-ppt 风格。',
  referenceOnly: true,
}

describe('ThemeCard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads oh-my-ppt preview html for reference-only themes', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('/api/agent/html-ppt/oh-my-ppt-style-preview-parts?names=amber-aurora')
      return {
        ok: true,
        json: async () => ({
          previewMap: {
            'amber-aurora': '<!doctype html><html><body><section>amber preview</section></body></html>',
          },
        }),
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ThemeCard theme={referenceTheme} viewMode="grid" onClick={() => {}} />)

    const iframe = await screen.findByTitle('扁豆紫蜜陀僧 · 国风治愈 thumbnail')
    expect(iframe).toHaveAttribute('srcdoc', expect.stringContaining('amber preview'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })
})
