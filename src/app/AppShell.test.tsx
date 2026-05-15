import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from './AppRoutes'

describe('App routing shell', () => {
  const writeText = vi.fn<(value: string) => Promise<void>>()

  beforeEach(() => {
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText,
      },
    })
  })

  afterEach(() => {
    writeText.mockReset()
    vi.unstubAllGlobals()
  })

  it('redirects the root route to the editor without homepage actions', async () => {
    renderWithRoute('/')

    expect(await screen.findByRole('heading', { name: '数智兵设演示文稿生成器' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导入 HTML' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '从空白开始' })).toBeNull()
    expect(screen.queryByRole('button', { name: '从文档创建' })).toBeNull()
    expect(screen.queryByRole('link', { name: '返回首页' })).toBeNull()
    expect(screen.queryByRole('button', { name: '导入 PPTX 编辑' })).toBeNull()
    expect(screen.queryByText('Workflow')).toBeNull()
    expect(screen.queryByText('Capabilities')).toBeNull()
  })

  it('navigates from the root editor to the HTML PPT guide', async () => {
    const user = userEvent.setup()
    renderWithRoute('/')

    expect(await screen.findByRole('heading', { name: '数智兵设演示文稿生成器' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '返回首页' })).toBeNull()

    await user.click(screen.getByRole('link', { name: 'HTML PPT 指南' }))

    expect(screen.getByRole('heading', { name: 'HTML PPT 指南' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回编辑器' })).toHaveAttribute('href', '/editor/new')

    await user.click(screen.getByRole('link', { name: '返回编辑器' }))

    expect(screen.getByRole('heading', { name: '数智兵设演示文稿生成器' })).toBeInTheDocument()
  })

  it('redirects unknown routes to the editor', async () => {
    renderWithRoute('/missing-page')

    expect(await screen.findByRole('heading', { name: '数智兵设演示文稿生成器' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导入 HTML' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '返回首页' })).toBeNull()
  })

  it('preloads launch prompts into the editor session route', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.endsWith('/api/agent/skills')) {
        return new Response(JSON.stringify({ skills: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (/\/api\/agent\/sessions\/[^/]+\/snapshot$/.test(url)) {
        return new Response(JSON.stringify({ snapshot: null }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      }

      throw new Error(`Unexpected fetch request: ${url}`)
    })

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/editor/session-launch',
            state: {
              launchContext: {
                initialComposerText: 'Use the uploaded brief as the primary source and generate a 10-slide deck.',
                focusAgentPanel: true,
              },
            },
          },
        ]}
      >
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '数智兵设演示文稿生成器' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '智能体' })).toHaveAttribute('aria-selected', 'true')
    })

    expect(screen.getByLabelText(/给智能体的需求/i)).toHaveValue(
      'Use the uploaded brief as the primary source and generate a 10-slide deck.',
    )
  })

  it('renders the guide browser directly without landing page', () => {
    renderWithRoute('/html-ppt-skill-guide')

    expect(screen.getByRole('tab', { name: /快速开始/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'HTML PPT 指南' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /返回编辑器/i })).toHaveAttribute('href', '/editor/new')
  })

  it('renders the platform usage guide from the guide tab URL', () => {
    renderWithRoute('/html-ppt-skill-guide?tab=platform-usage')

    expect(screen.getByRole('tab', { name: /平台使用/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: '平台使用说明' })).toBeInTheDocument()
    expect(screen.getByText('推荐使用顺序')).toBeInTheDocument()
    expect(screen.getByText('导入 HTML')).toBeInTheDocument()
    expect(screen.getByText('导出 PDF')).toBeInTheDocument()
    expect(screen.getByText('进入对比模式')).toBeInTheDocument()
    expect(screen.getByText('对象列表')).toBeInTheDocument()
    expect(screen.queryByText('主题 Tokens')).toBeNull()
    expect(screen.queryByText('运行修复')).toBeNull()
  })

  it('filters guide content by category and opens prompt previews with a copy action', async () => {
    const user = userEvent.setup()
    renderWithRoute('/html-ppt-skill-guide?tab=themes')

    expect(screen.getByText('minimal-white')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /动效/i }))
    expect(screen.getByText('fade-up')).toBeInTheDocument()
    expect(screen.getByText('knowledge-graph')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /主题/i }))
    await user.click(screen.getByRole('button', { name: '技术分享' }))
    expect(screen.getByText('tokyo-night')).toBeInTheDocument()
    expect(screen.queryByText('pitch-deck-vc')).toBeNull()

    await user.click(screen.getByRole('tab', { name: /布局/i }))
    await user.click(screen.getByRole('button', { name: '数据图表' }))
    expect(screen.getByText('chart-bar')).toBeInTheDocument()
    expect(screen.queryByText('cover')).toBeNull()

    await user.click(screen.getByRole('tab', { name: /动效/i }))
    await user.click(screen.getByRole('button', { name: 'FX 动效' }))
    expect(screen.getByText('particle-burst')).toBeInTheDocument()
    expect(screen.queryByText('fade-up')).toBeNull()

    await user.click(screen.getByRole('tab', { name: /提示词/i }))
    await user.click(screen.getByRole('button', { name: /基础提示词/i, hidden: true }))

    const previewPanel = await screen.findByRole('dialog', { name: '详情预览' })
    expect(within(previewPanel).getByRole('button', { name: '复制模板' })).toBeInTheDocument()
  }, 15000)

  it('uses a wider preview drawer for animation details', async () => {
    const user = userEvent.setup()
    renderWithRoute('/html-ppt-skill-guide?tab=themes')

    await user.click(screen.getByRole('tab', { name: /动效/i }))
    await user.click(screen.getByRole('button', { name: /fade-up/i }))

    const panel = await screen.findByRole('dialog', { name: '详情预览' })
    expect(getComputedStyle(panel).width).toBe('640px')
  })

  it('reuses the replayable demo shell for theme, template, and layout previews', async () => {
    const user = userEvent.setup()
    renderWithRoute('/html-ppt-skill-guide?tab=themes')

    await user.click(screen.getByRole('button', { name: /minimal-white/i }))
    let previewPanel = await screen.findByRole('dialog', { name: '详情预览' })
    expect(within(previewPanel).getByText(/加载主题预览|预览不可用/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭预览' }))

    await user.click(screen.getByRole('tab', { name: /模板/i }))
    await user.click(screen.getByRole('button', { name: /pitch-deck/i }))
    previewPanel = await screen.findByRole('dialog', { name: '详情预览' })
    expect(within(previewPanel).getByText(/加载模板预览|预览不可用/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭预览' }))

    await user.click(screen.getByRole('tab', { name: /布局/i }))
    await user.click(screen.getByRole('button', { name: /封面cover/i }))
    previewPanel = await screen.findByRole('dialog', { name: '详情预览' })
    expect(within(previewPanel).getByText(/加载布局预览|预览不可用/)).toBeInTheDocument()
  }, 15000)
})

function renderWithRoute(initialRoute: string) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}
