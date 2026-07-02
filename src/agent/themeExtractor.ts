/**
 * 主题提取器：从用户提示词和上传资料摘要中智能提取主题、模板和布局配置。
 */

import { fullDeckNameLabels, themeNameLabels } from '../app/htmlPptSkillGuideData'
import type { HtmlPptConfig } from './protocol'

export type ThemeExtractionResult = {
  themeName?: string
  fullDeckName?: string
  layoutNames?: string[]
  audience?: HtmlPptConfig['audience']
  format?: HtmlPptConfig['format']
  explicitThemeName?: boolean
  explicitFullDeckName?: boolean
  confidence: number
  reasoning: string
}

type StyleRule = {
  keywords: string[]
  themeName: string
  fullDeckName?: string
  layoutNames?: string[]
  audience?: HtmlPptConfig['audience']
  format?: HtmlPptConfig['format']
  confidence: number
  reasoning: string
}

const FORMAL_REPORT_LAYOUTS = [
  'cover',
  'toc',
  'three-column',
  'kpi-grid',
  'flow-diagram',
  'process-steps',
  'timeline',
  'roadmap',
  'comparison',
  'table',
  'thanks',
]

/**
 * 从提示词中提取主题配置。referenceText 用于上传文档、知识库摘要等自动选型上下文；
 * 用户显式写出的主题/模板资源名仍只从 prompt 判断，避免资料正文误触发“用户指定”。
 */
export function extractThemeFromPrompt(prompt: string, referenceText = ''): ThemeExtractionResult {
  const promptText = prompt.toLowerCase()
  const combinedText = `${prompt}\n${referenceText}`.toLowerCase()
  const result: ThemeExtractionResult = {
    confidence: 0,
    reasoning: '',
  }

  for (const [key, label] of Object.entries(themeNameLabels)) {
    if (promptText.includes(key.toLowerCase()) || promptText.includes(label.toLowerCase())) {
      result.themeName = key
      result.explicitThemeName = true
      result.confidence += 0.9
      result.reasoning += `检测到用户明确指定主题：${label}; `
      break
    }
  }

  for (const [key, label] of Object.entries(fullDeckNameLabels)) {
    if (promptText.includes(key.toLowerCase()) || promptText.includes(label.toLowerCase())) {
      result.fullDeckName = key
      result.explicitFullDeckName = true
      result.confidence += 0.9
      result.reasoning += `检测到用户明确指定模板：${label}; `
      break
    }
  }

  const inferredRule = inferStyleRule(combinedText)
  if (inferredRule) {
    if (!result.themeName) {
      result.themeName = inferredRule.themeName
    }
    if (!result.fullDeckName && inferredRule.fullDeckName) {
      result.fullDeckName = inferredRule.fullDeckName
    }
    if (!result.layoutNames?.length && inferredRule.layoutNames?.length) {
      result.layoutNames = inferredRule.layoutNames
    }
    if (!result.audience && inferredRule.audience) {
      result.audience = inferredRule.audience
    }
    if (!result.format && inferredRule.format) {
      result.format = inferredRule.format
    }
    result.confidence += inferredRule.confidence
    result.reasoning += inferredRule.reasoning
  }

  result.audience ??= inferAudience(combinedText)
  result.format ??= inferFormat(combinedText)

  return result
}

export function analyzeDocumentAndRecommendTheme(documentSummary: string): ThemeExtractionResult {
  const result = extractThemeFromPrompt('', documentSummary)
  return result.confidence > 0
    ? result
    : {
        confidence: 0.6,
        reasoning: '未识别到明确场景，默认采用通用现场汇报配置; ',
        audience: 'general',
        format: 'live',
      }
}

function inferStyleRule(text: string): StyleRule | null {
  const rules: StyleRule[] = [
    {
      keywords: ['党政', '国企', '央企', '兵团', '新疆兵团', '设计院', '院级汇报', '全院', '正式现场汇报'],
      themeName: 'blueprint',
      layoutNames: FORMAL_REPORT_LAYOUTS,
      audience: 'executives',
      format: 'live',
      confidence: 0.92,
      reasoning: '检测到党政国企/兵团设计院/院级汇报场景，推荐蓝图工程化正式汇报视觉，并由模型选择非白底正式模板骨架; ',
    },
    {
      keywords: ['生产技术质量部', '质量管控', '三标体系', '技术管理', '保密安全', '信息化建设', '工作职能'],
      themeName: 'blueprint',
      layoutNames: FORMAL_REPORT_LAYOUTS,
      audience: 'executives',
      format: 'live',
      confidence: 0.86,
      reasoning: '检测到部门职能/质量技术治理汇报内容，推荐蓝图工程化正式汇报视觉，并由模型选择非白底正式模板骨架; ',
    },
    {
      keywords: ['工程勘察', '工程设计', '勘测设计', '项目管理', '流程管控', '强关联', '出版管理卡', '设计评审'],
      themeName: 'blueprint',
      layoutNames: FORMAL_REPORT_LAYOUTS,
      audience: 'executives',
      format: 'live',
      confidence: 0.82,
      reasoning: '检测到工程管理/流程治理内容，推荐蓝图工程化正式汇报视觉，并由模型选择非白底正式模板骨架; ',
    },
    {
      keywords: ['生态环境法典', '环境法典', '生态环境', '法典', '法律', '法规', '条例', '政策解读', '制度解读', '合规', '监管', '执法'],
      themeName: 'blueprint',
      layoutNames: ['cover', 'toc', 'three-column', 'timeline', 'flow-diagram', 'comparison', 'table', 'thanks'],
      audience: 'executives',
      format: 'live',
      confidence: 0.88,
      reasoning: '检测到法律法规/政策制度解读内容，推荐正式治理型蓝图汇报视觉，并由模型选择非白底正式模板骨架; ',
    },
    {
      keywords: ['世界杯', 'fifa', '足球', '体育', '赛事', '赛程', '冠军', '球迷', '激情盛宴', '运动会', '联赛', '总决赛', 'sports', 'football', 'soccer'],
      themeName: 'cyberpunk-neon',
      layoutNames: ['cover', 'toc', 'hero', 'kpi-grid', 'timeline', 'comparison', 'roadmap', 'thanks'],
      audience: 'general',
      format: 'live',
      confidence: 0.86,
      reasoning: '检测到体育赛事/世界杯活动场景，推荐高饱和赛事转播视觉，使用深色或强对比背景、草坪绿/奖杯金/FIFA蓝等强调色，避免白底商务模板; ',
    },
    {
      keywords: ['技术分享', '技术讲座', '架构', '系统设计', '代码', '开发', '程序', 'tech talk'],
      themeName: 'tokyo-night',
      fullDeckName: 'tech-sharing',
      layoutNames: ['cover', 'toc', 'arch-diagram', 'flow-diagram', 'comparison', 'timeline', 'thanks'],
      audience: 'engineers',
      format: 'live',
      confidence: 0.78,
      reasoning: '检测到技术分享/架构场景，推荐深色技术分享模板; ',
    },
    {
      keywords: ['课程', '教学', '培训', '讲义', '教程', '初学者'],
      themeName: 'aurora',
      fullDeckName: 'course-module',
      layoutNames: ['cover', 'toc', 'two-column', 'process-steps', 'comparison', 'thanks'],
      audience: 'students',
      format: 'live',
      confidence: 0.76,
      reasoning: '检测到课程教学场景，推荐课程模块模板; ',
    },
    {
      keywords: ['产品发布', '新品', '版本发布', '发布会', '品牌', '创意', 'launch'],
      themeName: 'aurora',
      fullDeckName: 'product-launch',
      layoutNames: ['cover', 'hero', 'kpi-grid', 'roadmap', 'comparison', 'thanks'],
      audience: 'general',
      format: 'live',
      confidence: 0.76,
      reasoning: '检测到产品发布/品牌展示场景，推荐极光发布模板; ',
    },
    {
      keywords: ['融资', '路演', '投资', 'pitch', 'vc'],
      themeName: 'pitch-deck-vc',
      fullDeckName: 'pitch-deck',
      layoutNames: ['cover', 'kpi-grid', 'comparison', 'roadmap', 'table', 'thanks'],
      audience: 'executives',
      format: 'live',
      confidence: 0.84,
      reasoning: '检测到融资路演场景，推荐 pitch deck 模板; ',
    },
    {
      keywords: ['商务', '正式', '企业', '管理', '汇报', '领导', '高管', '周报', '月报', '季报', '年报', '复盘'],
      themeName: 'blueprint',
      layoutNames: FORMAL_REPORT_LAYOUTS,
      audience: 'executives',
      format: 'live',
      confidence: 0.72,
      reasoning: '检测到正式商务汇报场景，自动选用非纯白的蓝图汇报视觉，并由模型选择正式模板骨架; ',
    },
    {
      keywords: ['小红书', 'xhs', '社交', '博主', '图文'],
      themeName: 'rainbow-gradient',
      fullDeckName: 'xhs-post',
      layoutNames: ['cover', 'hero', 'two-column', 'thanks'],
      audience: 'consumers',
      format: 'xhs',
      confidence: 0.8,
      reasoning: '检测到小红书/社交图文场景，推荐小红书编辑模板; ',
    },
  ]

  return rules.find((rule) => rule.keywords.some((keyword) => text.includes(keyword.toLowerCase()))) ?? null
}

function inferAudience(text: string): HtmlPptConfig['audience'] {
  if (/高管|领导|管理层|院级|全院|党政|国企|央企|投资人|executives?|vc/i.test(text)) {
    return 'executives'
  }
  if (/工程师|技术|开发|程序员|架构|系统设计|engineers?/i.test(text)) {
    return 'engineers'
  }
  if (/学生|学员|培训|课程|初学者|students?/i.test(text)) {
    return 'students'
  }
  if (/用户|消费者|客户|小红书|社交|consumers?/i.test(text)) {
    return 'consumers'
  }
  return 'general'
}

function inferFormat(text: string): HtmlPptConfig['format'] {
  if (/pdf|打印|导出pdf/i.test(text)) {
    return 'pdf'
  }
  if (/小红书|xhs|社交|发圈/i.test(text)) {
    return 'xhs'
  }
  if (/独立|standalone|离线/i.test(text)) {
    return 'standalone'
  }
  return 'live'
}
