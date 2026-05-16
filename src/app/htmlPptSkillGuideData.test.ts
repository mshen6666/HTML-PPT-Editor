import { describe, expect, it } from 'vitest'

import { htmlPptSkillGuideData } from './htmlPptSkillGuideData'

const allowedScenes = [
  'content',
  'headline',
  'banner',
  'split',
  'list',
  'metric',
  'diagram',
  'card',
  'marquee',
  'ambient',
  'terminal',
  'fx-stage',
] as const

describe('htmlPptSkillGuideData animations', () => {
  it('defines a demo scene for every animation entry', () => {
    expect(htmlPptSkillGuideData.animations).toHaveLength(47)

    for (const animation of htmlPptSkillGuideData.animations) {
      const demo = (animation as { demo?: { scene?: string; label?: string } }).demo

      expect(demo).toBeDefined()
      expect(allowedScenes).toContain(demo?.scene as (typeof allowedScenes)[number])
      expect(demo?.label).toBeTruthy()
    }
  })
})

describe('htmlPptSkillGuideData full deck templates', () => {
  it('includes the vendored beautiful-html-templates catalog as prompt-ready templates', () => {
    expect(htmlPptSkillGuideData.fullDecks).toHaveLength(48)

    const softEditorial = htmlPptSkillGuideData.fullDecks.find((template) => template.name === 'soft-editorial')
    const neoGridBold = htmlPptSkillGuideData.fullDecks.find((template) => template.name === 'neo-grid-bold')

    expect(softEditorial).toEqual(expect.objectContaining({
      source: 'beautiful-html-templates',
      name: 'soft-editorial',
      displayName: 'Soft Editorial',
      scenario: 'editorial feature / longform brand story / gallery or museum / literary pitch',
      visualKeywords: expect.arrayContaining(['literary', 'elegant', 'quiet', 'warm-classical']),
      formality: 'high',
      density: 'low',
      scheme: 'light',
    }))
    expect(softEditorial?.promptStarter).toContain('请以 beautiful-html-templates 的 soft-editorial 模板作为起始视觉系统')
    expect(softEditorial?.fit).toContain('literary, elegant, and unhurried')

    expect(neoGridBold).toEqual(expect.objectContaining({
      source: 'beautiful-html-templates',
      displayName: 'Neo-Grid Bold',
      density: 'high',
      scheme: 'light',
    }))
  })
})

describe('htmlPptSkillGuideData platform usage guide', () => {
  it('documents the recommended order and all major platform modules', () => {
    expect(htmlPptSkillGuideData.usageOrder.map((step) => step.title)).toEqual([
      '准备需求和素材',
      '生成或导入演示',
      '浏览页面并确定结构',
      '编辑内容和对象',
      '调整对象、版式和动效',
      '检查候选并对比',
      '演示预览',
      '导出交付',
    ])

    expect(htmlPptSkillGuideData.platformModules.map((module) => module.title)).toEqual([
      '顶部工具栏',
      '页面模块',
      '编辑模块',
      '智能体模块',
      '画布与对比模块',
      'HTML PPT Skill 资料库',
    ])

    const featureNames = htmlPptSkillGuideData.platformModules.flatMap((module) =>
      module.features.map((feature) => feature.name),
    )

    expect(featureNames).toEqual(expect.arrayContaining([
      '导入 HTML',
      '导出 PDF',
      '智能导出 PPTX',
      '插入图片块',
      '对象列表',
      '富文本内容',
      '进入对比模式',
      '搜索、筛选和预览',
    ]))

    expect(featureNames).not.toContain('保存')
    expect(featureNames).not.toEqual(expect.arrayContaining([
      '主题 Tokens',
      '当前页 HTML',
      '替换当前页',
      '运行修复',
    ]))
  })
})
