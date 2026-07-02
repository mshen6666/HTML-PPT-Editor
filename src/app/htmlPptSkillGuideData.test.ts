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
      displayName: '柔和编辑风',
      scenario: '适合：编辑专题、长篇品牌故事、画廊或博物馆、文学提案。',
      visualKeywords: expect.arrayContaining(['文学感', '优雅', '安静', '温暖古典']),
      formality: '高',
      density: '低',
      scheme: '浅色',
    }))
    expect(softEditorial?.promptStarter).toContain('请以「柔和编辑风」模板作为起始视觉系统')
    expect(softEditorial?.promptStarter).not.toContain('beautiful-html-templates')
    expect(softEditorial?.fit).toContain('气质：文学感、优雅、安静')
    expect(softEditorial?.bestFor).toContain('适合：编辑专题')

    expect(neoGridBold).toEqual(expect.objectContaining({
      source: 'beautiful-html-templates',
      displayName: '新网格粗体',
      density: '高',
      scheme: '浅色',
    }))
  })
})

describe('htmlPptSkillGuideData themes', () => {
  it('includes oh-my-ppt reference styles without treating them as built-in css themes', () => {
    expect(htmlPptSkillGuideData.themes).toHaveLength(74)

    const referenceThemes = htmlPptSkillGuideData.themes.filter((theme) => theme.referenceOnly)
    expect(referenceThemes).toHaveLength(38)
    expect(referenceThemes.map((theme) => theme.name)).toEqual(expect.arrayContaining([
      'amber-aurora',
      'blue-white-chart',
      'industrial-kaizen',
      'palace-ink-red',
      'summer-warm-color',
    ]))

    const amberAurora = htmlPptSkillGuideData.themes.find((theme) => theme.name === 'amber-aurora')
    expect(amberAurora).toEqual(expect.objectContaining({
      label: '扁豆紫蜜陀僧 · 国风治愈',
      referenceOnly: true,
      promptHint: expect.stringContaining('参考 oh-my-ppt'),
    }))
  })
})

describe('htmlPptSkillGuideData creation workflows', () => {
  it('documents oh-my-ppt inspired workflows as reusable web creation recipes', () => {
    expect(htmlPptSkillGuideData.creationWorkflows.map((workflow) => workflow.title)).toEqual([
      '一句话快速生成',
      '上传资料后生成',
      '从模板延展新内容',
      '参考截图提取风格',
      '补演讲稿与逐步动效',
    ])

    expect(htmlPptSkillGuideData.creationWorkflows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'oh-my-ppt',
        title: '上传资料后生成',
        promptStarter: expect.stringContaining('请先阅读我上传的资料'),
      }),
      expect.objectContaining({
        title: '补演讲稿与逐步动效',
        bestWhen: expect.stringContaining('现场演讲'),
      }),
    ]))
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
