import { describe, expect, it } from 'vitest'

import { extractThemeFromPrompt } from './themeExtractor'

describe('extractThemeFromPrompt', () => {
  it('maps Party/government and Bingtuan institute reports to a non-white formal blueprint direction', () => {
    const result = extractThemeFromPrompt('生成10页党政国企院级汇报风PPT，融合新疆兵团勘测设计院工程科技感')

    expect(result).toEqual(expect.objectContaining({
      themeName: 'blueprint',
      audience: 'executives',
      format: 'live',
    }))
    expect(result.fullDeckName).toBeUndefined()
    expect(result.layoutNames).toEqual(expect.arrayContaining([
      'cover',
      'kpi-grid',
      'process-steps',
      'timeline',
      'thanks',
    ]))
    expect(result.confidence).toBeGreaterThan(0.8)
  })

  it('uses uploaded document excerpts when the user prompt is short and generic', () => {
    const result = extractThemeFromPrompt(
      '根据我上传的文档资料内容，生成10页符合内容相关的PPT',
      '生产技术质量部工作职能专题汇报，内容包括技术管理、质量管控、三标体系、保密安全、信息化建设。',
    )

    expect(result).toEqual(expect.objectContaining({
      themeName: 'blueprint',
      audience: 'executives',
      format: 'live',
    }))
    expect(result.fullDeckName).toBeUndefined()
    expect(result.reasoning).toContain('部门职能/质量技术治理')
  })

  it('does not classify policy and legal documents as tech-sharing decks', () => {
    const result = extractThemeFromPrompt(
      '根据我上传的文档资料内容，生成10页符合内容相关的PPT',
      '中华人民共和国生态环境法典，内容包括生态环境保护、污染防治、法律责任、监督管理、执法监管和政策制度解读。',
    )

    expect(result).toEqual(expect.objectContaining({
      themeName: 'blueprint',
      audience: 'executives',
      format: 'live',
    }))
    expect(result.fullDeckName).toBeUndefined()
    expect(result.themeName).not.toBe('tokyo-night')
    expect(result.fullDeckName).not.toBe('tech-sharing')
    expect(result.reasoning).toContain('法律法规/政策制度解读')
  })

  it('maps World Cup and sports event prompts to a high-energy non-white direction', () => {
    const result = extractThemeFromPrompt('生成10页2026 FIFA 世界杯激情盛宴PPT，包含赛程、球队、看点和决赛展望')

    expect(result).toEqual(expect.objectContaining({
      themeName: 'cyberpunk-neon',
      audience: 'general',
      format: 'live',
    }))
    expect(result.fullDeckName).toBeUndefined()
    expect(result.layoutNames).toEqual(expect.arrayContaining([
      'cover',
      'hero',
      'timeline',
      'comparison',
      'thanks',
    ]))
    expect(result.reasoning).toContain('体育赛事/世界杯活动场景')
  })

  it('keeps explicitly requested html-ppt resources ahead of automatic selection', () => {
    const result = extractThemeFromPrompt(
      '请使用 tokyo-night 主题和 tech-sharing 模板，生成一份院级汇报PPT',
      '生产技术质量部、党政国企、兵团设计院正式汇报',
    )

    expect(result.themeName).toBe('tokyo-night')
    expect(result.fullDeckName).toBe('tech-sharing')
    expect(result.explicitThemeName).toBe(true)
    expect(result.explicitFullDeckName).toBe(true)
  })
})
