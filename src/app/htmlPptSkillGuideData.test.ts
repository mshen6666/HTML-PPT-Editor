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
