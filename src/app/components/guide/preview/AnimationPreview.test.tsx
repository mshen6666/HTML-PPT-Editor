import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { htmlPptSkillGuideData } from '../../../htmlPptSkillGuideData'
import { AnimationPreview } from './AnimationPreview'

vi.mock('./useAnimationCSS', () => ({
  useAnimationCSS: () => ({
    cssData: {
      baseCSS: ':root{--bg:#fff;--text-1:#111;--text-2:#333;--text-3:#666;--accent:#f60;--surface:#fff;--surface-2:#f7f7f7;--border:#ddd;--shadow:none;--radius:16px;--radius-lg:24px;--font-sans:sans-serif;--font-display:serif;--font-mono:monospace;--grad:linear-gradient(90deg,#f60,#111)}',
      fontsCSS: '',
      animationsCSS: '.anim-fade-up{animation:fade-up .4s ease both}@keyframes fade-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}',
    },
    loading: false,
  }),
}))

const byName = (name: string) => {
  const animation = htmlPptSkillGuideData.animations.find(item => item.name === name)
  if (!animation) {
    throw new Error(`Missing animation fixture for ${name}`)
  }
  return animation
}

describe('AnimationPreview', () => {
  it('renders an iframe srcdoc content demo for entry animations', () => {
    render(<AnimationPreview animation={byName('fade-up')} />)

    const iframe = screen.getByTitle('fade-up animation preview') as HTMLIFrameElement
    expect(iframe).toBeInTheDocument()
    expect(iframe.srcdoc).toContain('anim-fade-up')
    expect(iframe.srcdoc).toContain('正文卡片')
  })

  it.each([
    ['counter-up', 'metric-val', '营收增长'],
    ['path-draw', '<svg', '服务调用链'],
    ['knowledge-graph', 'Canvas FX', '图谱节点'],
  ])('renders the %s demo scene', (name, sceneMarker, label) => {
    render(<AnimationPreview animation={byName(name)} />)

    const iframe = screen.getByTitle(`${name} animation preview`) as HTMLIFrameElement
    expect(iframe.srcdoc).toContain(`class="scene`)
    expect(iframe.srcdoc).toContain(label)
    expect(iframe.srcdoc).toContain(sceneMarker)
  })
})
