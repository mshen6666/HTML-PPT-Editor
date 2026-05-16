import { beautifulHtmlTemplates } from './beautifulHtmlTemplateCatalog'

export type GuideSectionId =
  | 'quick-start'
  | 'platform-usage'
  | 'themes'
  | 'full-decks'
  | 'layouts'
  | 'animations'
  | 'prompts'

export type GuideThemeCategory = 'business' | 'tech' | 'creator' | 'academic' | 'experimental'

export type GuideTheme = {
  name: string
  category: GuideThemeCategory
  tone: string[]
  useCases: string
  promptHint: string
}

export type GuideFullDeck = {
  name: string
  displayName?: string
  source?: 'html-ppt' | 'beautiful-html-templates'
  scenario: string
  visualKeywords: string[]
  fit: string
  promptStarter: string
  tagline?: string
  mood?: string[]
  tone?: string[]
  occasion?: string[]
  formality?: string
  density?: string
  scheme?: string
  bestFor?: string
  avoidFor?: string
  slideCount?: number
}

export type GuideLayoutCategory =
  | 'cover-transition'
  | 'structure'
  | 'content'
  | 'data'
  | 'flow'
  | 'comparison'
  | 'closing'

export type GuideLayout = {
  name: string
  category: GuideLayoutCategory
  informationType: string
  usageAdvice: string
}

export type GuideAnimationDemoScene =
  | 'content'
  | 'headline'
  | 'banner'
  | 'split'
  | 'list'
  | 'metric'
  | 'diagram'
  | 'card'
  | 'marquee'
  | 'ambient'
  | 'terminal'
  | 'fx-stage'

export type GuideAnimationDemo = {
  scene: GuideAnimationDemoScene
  label: string
  headline?: string
  value?: string
  items?: string[]
}

export type GuideAnimation = {
  name: string
  kind: 'css' | 'fx'
  group: string
  effect: string
  bestFor: string
  promptHint: string
  caution: string
  demo: GuideAnimationDemo
}

export type PromptPattern = {
  id: string
  title: string
  goal: string
  template: string
  shortExample: string
  longExample: string
}

export type PlatformUsageStep = {
  title: string
  description: string
}

export type PlatformModuleFeature = {
  name: string
  description: string
}

export type PlatformModule = {
  title: string
  purpose: string
  features: PlatformModuleFeature[]
  tip: string
}

export type GuideCatalog = {
  overviewBlurb: string
  audience: string[]
  quickStart: Array<{ title: string; description: string }>
  usageOrder: PlatformUsageStep[]
  platformModules: PlatformModule[]
  sections: Array<{ id: GuideSectionId; title: string; summary: string }>
  themes: GuideTheme[]
  fullDecks: GuideFullDeck[]
  layouts: GuideLayout[]
  animations: GuideAnimation[]
  promptPatterns: PromptPattern[]
}

export const guideThemeCategoryLabels: Record<'all' | GuideThemeCategory, string> = {
  all: '全部',
  business: '商务正式',
  tech: '技术分享',
  creator: '轻内容 / 小红书',
  academic: '学术 / 报告',
  experimental: '赛博 / 实验风',
}

export const guideLayoutCategoryLabels: Record<'all' | GuideLayoutCategory, string> = {
  all: '全部',
  'cover-transition': '封面 / 过渡',
  structure: '目录 / 结构',
  content: '内容表达',
  data: '数据图表',
  flow: '流程 / 时间线',
  comparison: '对比 / 决策',
  closing: '收尾页',
}

export const guideAnimationKindLabels: Record<'all' | GuideAnimation['kind'], string> = {
  all: '全部',
  css: 'CSS 入场动画',
  fx: 'FX 动效',
}

// 主题中文名称映射
export const themeNameLabels: Record<string, string> = {
  'minimal-white': '极简白',
  'editorial-serif': '编辑衬线',
  'soft-pastel': '柔和粉',
  'sharp-mono': '锐利等宽',
  'arctic-cool': '北极冷调',
  'sunset-warm': '落日暖色',
  'catppuccin-latte': '拿铁猫',
  'catppuccin-mocha': '摩卡猫',
  'dracula': '德古拉',
  'tokyo-night': '东京之夜',
  'nord': '北欧',
  'solarized-light': '日光白',
  'gruvbox-dark': '复古暗',
  'rose-pine': '玫瑰松',
  'neo-brutalism': '新粗野主义',
  'glassmorphism': '玻璃拟态',
  'bauhaus': '包豪斯',
  'swiss-grid': '瑞士网格',
  'terminal-green': '终端绿',
  'xiaohongshu-white': '小红书白',
  'rainbow-gradient': '彩虹渐变',
  'aurora': '极光',
  'blueprint': '蓝图',
  'memphis-pop': '孟菲斯波普',
  'cyberpunk-neon': '赛博霓虹',
  'y2k-chrome': 'Y2K镀铬',
  'retro-tv': '复古电视',
  'japanese-minimal': '日式极简',
  'vaporwave': '蒸汽波',
  'midcentury': '中世纪现代',
  'corporate-clean': '商务简洁',
  'academic-paper': '学术论文',
  'news-broadcast': '新闻播报',
  'pitch-deck-vc': '融资路演',
  'magazine-bold': '杂志粗体',
  'engineering-whiteprint': '工程白图',
}

// 模板中文名称映射
export const fullDeckNameLabels: Record<string, string> = {
  'course-module': '课程模块',
  'dir-key-nav-minimal': '极简导航',
  'graphify-dark-graph': '深色图谱',
  'hermes-cyber-terminal': '赛博终端',
  'knowledge-arch-blueprint': '知识架构',
  'obsidian-claude-gradient': '黑曜渐变',
  'pitch-deck': '融资路演',
  'product-launch': '产品发布',
  'tech-sharing': '技术分享',
  'testing-safety-alert': '测试告警',
  'weekly-report': '周报汇报',
  'xhs-pastel-card': '小红书彩卡',
  'xhs-post': '小红书图文',
  'xhs-white-editorial': '小红书白底',
}

// 布局中文名称映射
export const layoutNameLabels: Record<string, string> = {
  'cover': '封面',
  'section-divider': '章节分隔',
  'big-quote': '大引语',
  'toc': '目录',
  'bullets': '要点列表',
  'two-column': '双栏',
  'three-column': '三栏',
  'image-hero': '大图主视觉',
  'image-grid': '图片网格',
  'code': '代码',
  'terminal': '终端',
  'chart-bar': '柱状图',
  'chart-line': '折线图',
  'chart-pie': '饼图',
  'chart-radar': '雷达图',
  'kpi-grid': 'KPI网格',
  'stat-highlight': '数据高亮',
  'table': '表格',
  'flow-diagram': '流程图',
  'process-steps': '步骤流程',
  'timeline': '时间线',
  'roadmap': '路线图',
  'gantt': '甘特图',
  'mindmap': '思维导图',
  'arch-diagram': '架构图',
  'comparison': '对比',
  'diff': '差异',
  'pros-cons': '优缺点',
  'todo-checklist': '待办清单',
  'cta': '行动号召',
  'thanks': '感谢页',
}

// 动效中文名称映射
export const animationNameLabels: Record<string, string> = {
  'fade-up': '淡入上升',
  'fade-down': '淡入下降',
  'fade-left': '左侧淡入',
  'fade-right': '右侧淡入',
  'rise-in': '升起入场',
  'drop-in': '落下入场',
  'zoom-pop': '缩放弹出',
  'blur-in': '模糊清晰',
  'glitch-in': '故障入场',
  'typewriter': '打字机',
  'neon-glow': '霓虹发光',
  'shimmer-sweep': '高光扫过',
  'gradient-flow': '渐变流动',
  'stagger-list': '列表依次',
  'counter-up': '数字累加',
  'path-draw': '路径绘制',
  'morph-shape': '形状变形',
  'parallax-tilt': '视差倾斜',
  'card-flip-3d': '卡片翻转',
  'cube-rotate-3d': '立方旋转',
  'page-turn-3d': '翻页效果',
  'perspective-zoom': '透视缩放',
  'marquee-scroll': '无限滚动',
  'kenburns': '缓慢缩放',
  'confetti-burst': '彩屑爆发',
  'spotlight': '聚光灯',
  'ripple-reveal': '涟漪揭示',
  'particle-burst': '粒子爆发',
  'confetti-cannon': '礼炮彩带',
  'firework': '烟花效果',
  'starfield': '星空穿梭',
  'matrix-rain': '矩阵雨',
  'knowledge-graph': '知识图谱',
  'neural-net': '神经网络',
  'constellation': '星座连线',
  'orbit-ring': '轨道环绕',
  'galaxy-swirl': '星系旋流',
  'word-cascade': '文字瀑布',
  'letter-explode': '字母飞入',
  'chain-react': '链式反应',
  'magnetic-field': '磁场拖尾',
  'data-stream': '数据流',
  'gradient-blob': '渐变云团',
  'sparkle-trail': '闪光轨迹',
  'shockwave': '冲击波',
  'typewriter-multi': '多行打字',
  'counter-explosion': '计数爆发',
}

const animationDemo = {
  content: (label: string, headline: string, items: string[] = []): GuideAnimationDemo => ({
    scene: 'content',
    label,
    headline,
    items,
  }),
  headline: (label: string, value: string, items: string[] = []): GuideAnimationDemo => ({
    scene: 'headline',
    label,
    value,
    items,
  }),
  banner: (label: string, value: string, items: string[] = []): GuideAnimationDemo => ({
    scene: 'banner',
    label,
    value,
    items,
  }),
  split: (label: string, headline: string, items: string[] = []): GuideAnimationDemo => ({
    scene: 'split',
    label,
    headline,
    items,
  }),
  list: (label: string, items: string[] = []): GuideAnimationDemo => ({
    scene: 'list',
    label,
    items,
  }),
  metric: (label: string, value: string, items: string[] = []): GuideAnimationDemo => ({
    scene: 'metric',
    label,
    value,
    items,
  }),
  diagram: (label: string, headline: string, items: string[] = []): GuideAnimationDemo => ({
    scene: 'diagram',
    label,
    headline,
    items,
  }),
  card: (label: string, value: string, items: string[] = []): GuideAnimationDemo => ({
    scene: 'card',
    label,
    value,
    items,
  }),
  marquee: (label: string, items: string[] = []): GuideAnimationDemo => ({
    scene: 'marquee',
    label,
    items,
  }),
  ambient: (label: string, value: string, items: string[] = []): GuideAnimationDemo => ({
    scene: 'ambient',
    label,
    value,
    items,
  }),
  terminal: (label: string, items: string[] = []): GuideAnimationDemo => ({
    scene: 'terminal',
    label,
    items,
  }),
  fxStage: (label: string, value: string, items: string[] = []): GuideAnimationDemo => ({
    scene: 'fx-stage',
    label,
    value,
    items,
  }),
}

const sections = [
  { id: 'quick-start', title: '如何开始', summary: '用最短路径解释第一次使用时应该如何选主题、选模板、补动效和整理 prompt。' },
  { id: 'platform-usage', title: '平台使用说明', summary: '按实际编辑流程说明顶部工具栏、页面、编辑、智能体、画布和资料库的每个功能。' },
  { id: 'themes', title: '主题 Themes', summary: '36 个主题按风格分组，不只列名字，还说明适合的内容气质和提示词写法。' },
  { id: 'full-decks', title: '完整模板 Full-decks', summary: '14 个完整 deck 模板，适合作为整套演示的起始骨架。' },
  { id: 'layouts', title: '单页布局 Layouts', summary: '31 个单页布局按用途整理，便于按页面目标快速选型。' },
  { id: 'animations', title: '动效 Animations', summary: '区分 CSS 入场动画和 FX 动效，说明什么时候该用、什么时候不该堆。' },
  { id: 'prompts', title: '提示词怎么写', summary: '把”怎么说”拆成可复用句式，而不是只给一串很长的示例 prompt。' },
] as const

const quickStart = [
  { title: '1. 先说清内容与受众', description: '先交代 deck 是做给谁看的、要讲什么、目标页数大概多少。skill 的默认流程会先围绕 audience 和 deck scope 建立风格判断。' },
  { title: '2. 明确主题或先给 2-3 个候选', description: '如果你没有明确审美，优先说“偏技术分享”“偏投资汇报”“偏小红书图文”这类风格方向，再让 agent 在主题库里收敛。' },
  { title: '3. 优先选择 full-deck 或现成布局', description: '不要让 agent 完全从零排版。先指定整套 full-deck，或者告诉它正文页要用哪几类单页布局，能显著提升稳定性。' },
  { title: '4. 动效最后加，不要一开始堆满', description: '先让结构、信息层级和主题成立，再为关键页补 1-2 种动画节奏。skill 官方也强调单页不要混用太多动画类型。' },
  { title: '5. 生成后回看 notes、快捷键和导出链路', description: '确认是否需要 speaker notes、theme cycle、overview、deep-link 和 render 到 PNG / HTML 的流程说明，保证使用闭环完整。' },
] as const

const themes: GuideTheme[] = [
  { name: 'minimal-white', category: 'academic', tone: ['极简', '留白', '克制'], useCases: '学术报告、内部复盘、需要压低装饰噪音的内容。', promptHint: '适合写“极简白底、弱装饰、强调结构和文字节奏”。' },
  { name: 'editorial-serif', category: 'academic', tone: ['杂志感', '正文感', '文气'], useCases: '人文主题、长文叙事、文化类分享。', promptHint: '适合写“编辑部排版、正文阅读感、书卷气”。' },
  { name: 'soft-pastel', category: 'creator', tone: ['柔和', '轻甜', '友好'], useCases: '轻内容、品牌故事、小红书图文。', promptHint: '适合写“柔和粉彩、轻盈卡片、友好语气”。' },
  { name: 'sharp-mono', category: 'experimental', tone: ['等宽', '理性', '硬朗'], useCases: '工程说明、命令行风内容、技术速查。', promptHint: '适合写“等宽字、硬边界、理工感界面”。' },
  { name: 'arctic-cool', category: 'experimental', tone: ['冷静', '清透', '科技'], useCases: '平台能力介绍、分析型汇报。', promptHint: '适合写“冰冷科技感、冷色、清爽分层”。' },
  { name: 'sunset-warm', category: 'creator', tone: ['暖色', '故事感', '亲和'], useCases: '品牌分享、轻营销、社区活动。', promptHint: '适合写“落日暖色、温和氛围、轻故事感”。' },
  { name: 'catppuccin-latte', category: 'experimental', tone: ['柔和', '社区感', '现代'], useCases: '开发者社群分享、设计系统说明。', promptHint: '适合写“社区友好、拿铁色、现代卡片”。' },
  { name: 'catppuccin-mocha', category: 'tech', tone: ['深色', '开发者', '柔和对比'], useCases: '技术演讲、终端类主题。', promptHint: '适合写“Mocha 深色、开发者演示、可读性优先”。' },
  { name: 'dracula', category: 'tech', tone: ['经典深色', '高对比', '代码感'], useCases: '代码示例、技术路线说明。', promptHint: '适合写“Dracula 深色主题、代码强视觉、发光强调”。' },
  { name: 'tokyo-night', category: 'tech', tone: ['夜色', '现代技术', '稳定'], useCases: '默认技术分享主题。', promptHint: '适合写“Tokyo Night、现代工程分享、冷色夜间 UI”。' },
  { name: 'nord', category: 'tech', tone: ['北欧冷调', '安静', '清晰'], useCases: '结构化技术汇报、架构说明。', promptHint: '适合写“北欧冷调、克制、信息清晰”。' },
  { name: 'solarized-light', category: 'academic', tone: ['经典', '耐读', '长文友好'], useCases: '教学型 deck、笔记型内容。', promptHint: '适合写“Solarized Light、长文耐读、笔记感”。' },
  { name: 'gruvbox-dark', category: 'experimental', tone: ['复古终端', '颗粒感', '暖深色'], useCases: '终端风案例、工具链说明。', promptHint: '适合写“Gruvbox Dark、复古开发者氛围”。' },
  { name: 'rose-pine', category: 'experimental', tone: ['柔和深色', '审美向', '梦幻'], useCases: '创意型产品分享、设计演示。', promptHint: '适合写“Rose Pine、柔和深色、梦幻层次”。' },
  { name: 'neo-brutalism', category: 'experimental', tone: ['厚边框', '高冲击', '反精致'], useCases: '强调态度、年轻化产品发布。', promptHint: '适合写“Neo Brutalism、大边框、强撞色、厚重按钮”。' },
  { name: 'glassmorphism', category: 'experimental', tone: ['玻璃', '通透', '浮层'], useCases: '未来感、界面展示、产品发布。', promptHint: '适合写“Glassmorphism、半透明面板、漂浮层次”。' },
  { name: 'bauhaus', category: 'experimental', tone: ['几何', '强构成', '海报感'], useCases: '设计史、概念展示、艺术类主题。', promptHint: '适合写“Bauhaus 几何构成、海报感、原色秩序”。' },
  { name: 'swiss-grid', category: 'business', tone: ['网格', '秩序', '专业'], useCases: '正式商业汇报、咨询风 deck。', promptHint: '适合写“Swiss Grid、强对齐、专业信息板”。' },
  { name: 'terminal-green', category: 'tech', tone: ['终端', '黑绿', '命令行'], useCases: '安全、基础设施、CLI 演示。', promptHint: '适合写“Terminal Green、黑底绿字、终端启动感”。' },
  { name: 'xiaohongshu-white', category: 'creator', tone: ['白净', '精致', '内容平台'], useCases: '小红书图文、轻品牌传播。', promptHint: '适合写“小红书白底排版、轻精致、博主内容感”。' },
  { name: 'rainbow-gradient', category: 'creator', tone: ['彩色', '年轻', '吸睛'], useCases: '活动宣传、年轻品牌介绍。', promptHint: '适合写“彩虹渐变、年轻活力、强社交媒体感”。' },
  { name: 'aurora', category: 'experimental', tone: ['流动渐变', '柔光', '未来'], useCases: 'AI、未来技术、品牌封面。', promptHint: '适合写“Aurora 渐变、柔光、未来品牌视觉”。' },
  { name: 'blueprint', category: 'tech', tone: ['蓝图', '工程图', '系统设计'], useCases: '架构图、系统说明、组件关系。', promptHint: '适合写“Blueprint 蓝图、工程图线框、系统结构”。' },
  { name: 'memphis-pop', category: 'creator', tone: ['图形装饰', '俏皮', '活跃'], useCases: '社区活动、创意工作坊。', promptHint: '适合写“Memphis Pop、几何装饰、俏皮但可读”。' },
  { name: 'cyberpunk-neon', category: 'experimental', tone: ['霓虹', '赛博', '高反差'], useCases: 'AI 发布、黑客风、未来概念。', promptHint: '适合写“Cyberpunk Neon、霓虹光、赛博夜景”。' },
  { name: 'y2k-chrome', category: 'experimental', tone: ['镀铬', 'Y2K', '夸张'], useCases: '潮流主题、风格型封面。', promptHint: '适合写“Y2K Chrome、镀铬标题、00 年代数字感”。' },
  { name: 'retro-tv', category: 'experimental', tone: ['复古屏幕', '扫描线', '怀旧'], useCases: '媒体史、复古品牌表达。', promptHint: '适合写“Retro TV、扫描线、怀旧屏幕质感”。' },
  { name: 'japanese-minimal', category: 'academic', tone: ['克制', '留白', '东方秩序'], useCases: '设计讲解、文化类介绍。', promptHint: '适合写“Japanese Minimal、极简留白、东方式秩序”。' },
  { name: 'vaporwave', category: 'experimental', tone: ['梦幻', '粉紫', '复古网络'], useCases: '概念海报、实验性封面。', promptHint: '适合写“Vaporwave、梦幻渐变、复古互联网气质”。' },
  { name: 'midcentury', category: 'experimental', tone: ['中世纪现代', '温暖', '设计感'], useCases: '品牌故事、设计叙事。', promptHint: '适合写“Midcentury、暖色木感、现代主义海报”。' },
  { name: 'corporate-clean', category: 'business', tone: ['正式', '干净', '管理层'], useCases: '高管汇报、业务复盘、正式客户沟通。', promptHint: '适合写“Corporate Clean、正式商务、清晰层级”。' },
  { name: 'academic-paper', category: 'academic', tone: ['论文感', '严谨', '正文优先'], useCases: '研究报告、课程讲授。', promptHint: '适合写“Academic Paper、论文风、严谨信息密度”。' },
  { name: 'news-broadcast', category: 'business', tone: ['媒体播报', '版头', '节奏快'], useCases: '新闻式总结、行业速览。', promptHint: '适合写“News Broadcast、新闻字幕条、媒体播报节奏”。' },
  { name: 'pitch-deck-vc', category: 'business', tone: ['投资人', '叙事', '结论先行'], useCases: '融资 deck、商业介绍。', promptHint: '适合写“Pitch Deck VC、融资叙事、商业结论优先”。' },
  { name: 'magazine-bold', category: 'creator', tone: ['杂志封面', '大字号', '强图文'], useCases: '品牌海报、内容平台封面。', promptHint: '适合写“Magazine Bold、大字标题、封面感强图文”。' },
  { name: 'engineering-whiteprint', category: 'tech', tone: ['工程', '白底蓝线', '可读'], useCases: '技术白皮书、系统说明。', promptHint: '适合写“Engineering Whiteprint、工程白皮书、蓝线图解”。' },
]

const embeddedFullDecks: GuideFullDeck[] = [
  { name: 'course-module', scenario: '课程与教学模块', visualKeywords: ['分段教学', '讲义感', '结构清楚'], fit: '适合课程单元、培训讲义、入门教学。', promptStarter: '请基于 course-module 模板，做一套面向初学者的课程模块型 HTML 演示。' },
  { name: 'dir-key-nav-minimal', scenario: '极简导航型 deck', visualKeywords: ['极简', '键盘导航', '低装饰'], fit: '适合演讲现场、快速说明、导航层级少的 deck。', promptStarter: '请基于 dir-key-nav-minimal 模板，做一套极简键盘导航风格的技术分享。' },
  { name: 'graphify-dark-graph', scenario: '图谱 / 数据关系', visualKeywords: ['深色', '图网络', '数据关系'], fit: '适合知识图谱、关系网络、数据连接型内容。', promptStarter: '请基于 graphify-dark-graph 模板，做一套强调图谱关系和连接结构的演示。' },
  { name: 'hermes-cyber-terminal', scenario: '赛博终端风', visualKeywords: ['终端', '赛博', '黑绿发光'], fit: '适合安全、CLI、系统监控、黑客风主题。', promptStarter: '请基于 hermes-cyber-terminal 模板，做一套终端赛博风的安全演示。' },
  { name: 'knowledge-arch-blueprint', scenario: '知识架构与系统蓝图', visualKeywords: ['蓝图', '结构图', '系统层'], fit: '适合知识体系、架构说明、方法论梳理。', promptStarter: '请基于 knowledge-arch-blueprint 模板，做一套知识架构蓝图式演示。' },
  { name: 'obsidian-claude-gradient', scenario: '深色渐变叙事', visualKeywords: ['深色渐变', 'AI 产品', '品牌感'], fit: '适合 AI、产品故事、风格化介绍。', promptStarter: '请基于 obsidian-claude-gradient 模板，做一套有深色渐变品牌感的 AI 产品演示。' },
  { name: 'pitch-deck', scenario: '融资 / 商业 pitch', visualKeywords: ['商业叙事', '问题到方案', '投资人'], fit: '适合创业介绍、商业模式、融资沟通。', promptStarter: '请基于 pitch-deck 模板，做一套面向投资人的商业介绍。' },
  { name: 'product-launch', scenario: '产品发布会', visualKeywords: ['发布节奏', '亮点揭示', '舞台感'], fit: '适合新品发布、版本发布、能力亮点。', promptStarter: '请基于 product-launch 模板，做一套产品发布会风格的 HTML 演示。' },
  { name: 'tech-sharing', scenario: '技术分享', visualKeywords: ['工程结构', '代码', '架构'], fit: '适合技术讲座、内部分享、方案讲解。', promptStarter: '请基于 tech-sharing 模板，做一套给工程师看的技术分享 deck。' },
  { name: 'testing-safety-alert', scenario: '测试 / 安全告警', visualKeywords: ['告警条', '高风险', '检测'], fit: '适合测试质量、安全提醒、事故复盘。', promptStarter: '请基于 testing-safety-alert 模板，做一套强调测试和风险提示的演示。' },
  { name: 'weekly-report', scenario: '周报 / 进展汇报', visualKeywords: ['里程碑', '风险', '节奏盘点'], fit: '适合团队周报、项目例会、阶段同步。', promptStarter: '请基于 weekly-report 模板，做一套清晰的项目周报演示。' },
  { name: 'xhs-pastel-card', scenario: '小红书柔和彩卡', visualKeywords: ['粉彩卡片', '轻内容', '社区感'], fit: '适合社媒图文、博主风案例、轻教育内容。', promptStarter: '请基于 xhs-pastel-card 模板，做一套小红书柔和彩卡风图文 deck。' },
  { name: 'xhs-post', scenario: '3:4 小红书图文', visualKeywords: ['竖版', '内容平台', '图文页'], fit: '适合竖版内容传播和社交平台发布。', promptStarter: '请基于 xhs-post 模板，做一套适合小红书发布的 3:4 图文内容。' },
  { name: 'xhs-white-editorial', scenario: '小红书白底 editorial', visualKeywords: ['白底', '博主', '编辑感'], fit: '适合轻精致品牌、生活方式、内容分享。', promptStarter: '请基于 xhs-white-editorial 模板，做一套白底 editorial 风的小红书图文演示。' },
]

const fullDecks: GuideFullDeck[] = [
  ...embeddedFullDecks,
  ...beautifulHtmlTemplates.map((template): GuideFullDeck => ({
    ...template,
    source: 'beautiful-html-templates',
  })),
]

const layouts: GuideLayout[] = [
  { name: 'cover', category: 'cover-transition', informationType: '大标题封面', usageAdvice: '适合作为整套 deck 的第一屏，先定主题气质，再放一句核心副标题。' },
  { name: 'section-divider', category: 'cover-transition', informationType: '章节切换', usageAdvice: '适合章节之间建立节奏，标题要短，不要把正文塞到 divider 上。' },
  { name: 'big-quote', category: 'cover-transition', informationType: '大引语 / 观点', usageAdvice: '适合用一句话定调，不适合承载很多补充说明。' },
  { name: 'toc', category: 'structure', informationType: '目录页', usageAdvice: '适合长 deck 的导航页，目录层级保持在 3-5 项最稳。' },
  { name: 'bullets', category: 'structure', informationType: '要点列表', usageAdvice: '适合概念说明与结论归纳，建议搭配 stagger-list 动画。' },
  { name: 'two-column', category: 'content', informationType: '双栏表达', usageAdvice: '适合左文右图、左结论右证据这类平衡布局。' },
  { name: 'three-column', category: 'content', informationType: '三栏对照', usageAdvice: '适合三阶段、三特性、三方案并列陈述。' },
  { name: 'image-hero', category: 'content', informationType: '大图主视觉', usageAdvice: '适合产品展示、品牌封面或强调视觉氛围的页。' },
  { name: 'image-grid', category: 'content', informationType: '图片矩阵', usageAdvice: '适合案例集、图库式对比、品牌素材墙。' },
  { name: 'code', category: 'content', informationType: '代码片段', usageAdvice: '适合技术 deck 中展示关键代码或伪代码，不要放整段长代码。' },
  { name: 'terminal', category: 'content', informationType: '终端输出', usageAdvice: '适合 CLI、日志、Agent 启动信息或安全演示。' },
  { name: 'chart-bar', category: 'data', informationType: '柱状对比', usageAdvice: '适合多项指标横向对比，强调排名和差异。' },
  { name: 'chart-line', category: 'data', informationType: '趋势折线', usageAdvice: '适合时间维度趋势变化，配时间线或阶段说明更清楚。' },
  { name: 'chart-pie', category: 'data', informationType: '占比结构', usageAdvice: '适合比例分布，但类别不宜太多。' },
  { name: 'chart-radar', category: 'data', informationType: '多维能力雷达', usageAdvice: '适合能力模型、产品维度评价。' },
  { name: 'kpi-grid', category: 'data', informationType: 'KPI 指标宫格', usageAdvice: '适合运营、增长、业务周报。' },
  { name: 'stat-highlight', category: 'data', informationType: '单一核心数据', usageAdvice: '适合只想放大一个最重要数字的页面。' },
  { name: 'table', category: 'data', informationType: '表格数据', usageAdvice: '适合决策信息、参数清单、版本比较。' },
  { name: 'flow-diagram', category: 'flow', informationType: '流程关系', usageAdvice: '适合从输入到输出的处理链路。' },
  { name: 'process-steps', category: 'flow', informationType: '步骤拆解', usageAdvice: '适合教学或产品流程说明，每步保持一句话结论。' },
  { name: 'timeline', category: 'flow', informationType: '时间线', usageAdvice: '适合历史演化、项目阶段、版本节奏。' },
  { name: 'roadmap', category: 'flow', informationType: '路线图', usageAdvice: '适合未来计划、里程碑和发布节奏。' },
  { name: 'gantt', category: 'flow', informationType: '甘特图', usageAdvice: '适合排期管理和交付节奏说明。' },
  { name: 'mindmap', category: 'flow', informationType: '思维导图', usageAdvice: '适合概念发散、主题拆解和知识梳理。' },
  { name: 'arch-diagram', category: 'flow', informationType: '架构图', usageAdvice: '适合系统组件、层次结构和依赖关系说明。' },
  { name: 'comparison', category: 'comparison', informationType: '左右比较', usageAdvice: '适合方案 A/B、前后版本、旧新能力对比。' },
  { name: 'diff', category: 'comparison', informationType: '差异清单', usageAdvice: '适合改版前后或策略变化的重点差异。' },
  { name: 'pros-cons', category: 'comparison', informationType: '优缺点权衡', usageAdvice: '适合决策会、路线选择、方案权衡。' },
  { name: 'todo-checklist', category: 'comparison', informationType: '待办与检查项', usageAdvice: '适合实施清单、上线前核对和项目跟踪。' },
  { name: 'cta', category: 'closing', informationType: '行动号召', usageAdvice: '适合作为决策推动页，给出明确下一步动作。' },
  { name: 'thanks', category: 'closing', informationType: '结束页', usageAdvice: '适合演讲结束、感谢页或联系方式页。' },
]

const animations: GuideAnimation[] = [
  { name: 'fade-up', kind: 'css', group: 'Directional fades', effect: '从下向上位移并淡入。', bestFor: '段落、卡片、普通信息块。', promptHint: '可以写“正文卡片用 fade-up 轻轻进入”。', caution: '不要和太多强烈动画混用。', demo: animationDemo.content('正文卡片', '结构先行', ['重点摘要', '辅助说明']) },
  { name: 'fade-down', kind: 'css', group: 'Directional fades', effect: '从上向下落入并淡入。', bestFor: '头图条、banner、上方提示。', promptHint: '适合写“标题条或顶部 callout 用 fade-down”。', caution: '只适合少量大元素。', demo: animationDemo.banner('顶部提示', '更新已同步') },
  { name: 'fade-left', kind: 'css', group: 'Directional fades', effect: '从左侧滑入。', bestFor: '双栏页左栏。', promptHint: '适合写“左栏信息从左侧进入”。', caution: '与右栏动画保持对应关系。', demo: animationDemo.split('左栏信息', '问题定义', ['当前瓶颈', '目标边界']) },
  { name: 'fade-right', kind: 'css', group: 'Directional fades', effect: '从右侧滑入。', bestFor: '双栏页右栏。', promptHint: '适合写“右栏图像或说明从右侧进入”。', caution: '和 fade-left 配对时最好节奏一致。', demo: animationDemo.split('右栏说明', '方案补充', ['证据图', '关键收益']) },
  { name: 'rise-in', kind: 'css', group: 'Dramatic entries', effect: '大幅上升并去模糊。', bestFor: '封面标题、主标题。', promptHint: '适合写“封面标题用 rise-in 作为进场”。', caution: '同页只保留 1 个主角元素。', demo: animationDemo.headline('封面标题', 'NEXT WAVE') },
  { name: 'drop-in', kind: 'css', group: 'Dramatic entries', effect: '从上方落入并略带缩放。', bestFor: '告警条、重要提示。', promptHint: '适合写“告警条 drop-in 强调危险感”。', caution: '容易显得戏剧化，慎用。', demo: animationDemo.banner('风险告警', 'Latency spike') },
  { name: 'zoom-pop', kind: 'css', group: 'Dramatic entries', effect: '缩放弹出。', bestFor: 'CTA、关键数字、按钮。', promptHint: '适合写“核心数字用 zoom-pop 做强调”。', caution: '只在少量高价值元素上使用。', demo: animationDemo.metric('核心数字', '+240%', ['转化提升']) },
  { name: 'blur-in', kind: 'css', group: 'Dramatic entries', effect: '模糊逐渐清晰。', bestFor: '封面、视觉化揭示。', promptHint: '适合写“封面主视觉 blur-in 展开”。', caution: '正文小字不适合。', demo: animationDemo.ambient('视觉揭示', 'Aurora layer', ['soft reveal']) },
  { name: 'glitch-in', kind: 'css', group: 'Dramatic entries', effect: '抖动与裁切故障式入场。', bestFor: '赛博、故障、error state。', promptHint: '适合写“错误态标题 glitch-in”。', caution: '风格很强，只在赛博主题中用。', demo: animationDemo.banner('错误态标题', 'SYSTEM ALERT') },
  { name: 'typewriter', kind: 'css', group: 'Text effects', effect: '逐字打字机显示。', bestFor: '一句话标语、终端句子。', promptHint: '适合写“副标题用 typewriter 打字出现”。', caution: '长段文本会拖慢节奏。', demo: animationDemo.terminal('终端句子', ['> agent ready_', '> waiting for prompt']) },
  { name: 'neon-glow', kind: 'css', group: 'Text effects', effect: '文字霓虹呼吸光。', bestFor: '深色技术主题、终端风标题。', promptHint: '适合写“深色页标题加 neon-glow 呼吸光”。', caution: '浅色主题里会显得突兀。', demo: animationDemo.headline('发光标题', 'NEON NODE') },
  { name: 'shimmer-sweep', kind: 'css', group: 'Text effects', effect: '高光扫过。', bestFor: '品牌字样、金属感按钮。', promptHint: '适合写“品牌字样做 shimmer-sweep”。', caution: '大面积使用会廉价。', demo: animationDemo.card('高光按钮', 'Premium access', ['hover highlight']) },
  { name: 'gradient-flow', kind: 'css', group: 'Text effects', effect: '渐变流动。', bestFor: '品牌词、主视觉文案。', promptHint: '适合写“主标题文字做 gradient-flow 渐变流动”。', caution: '正文不适合持续渐变。', demo: animationDemo.headline('品牌词', 'Gradient Flow') },
  { name: 'stagger-list', kind: 'css', group: 'Lists & numbers', effect: '子元素依次上升出现。', bestFor: '列表、网格、步骤。', promptHint: '适合写“列表项用 stagger-list 依次出现”。', caution: '列表过长时会拖慢演示节奏。', demo: animationDemo.list('步骤列表', ['选主题', '排结构', '补动效', '导出']) },
  { name: 'counter-up', kind: 'css', group: 'Lists & numbers', effect: '数字从 0 累加到目标值。', bestFor: 'KPI、增长数据。', promptHint: '适合写“核心数字使用 counter-up”。', caution: '确保数字真的是主角。', demo: animationDemo.metric('营收增长', '1248', ['周同比']) },
  { name: 'path-draw', kind: 'css', group: 'SVG / geometry', effect: '路径描边绘制。', bestFor: '箭头、架构连线、流程图。', promptHint: '适合写“图中的连线使用 path-draw”。', caution: '只适合 SVG 几何元素。', demo: animationDemo.diagram('服务调用链', 'Reasoning path', ['ingest', 'route', 'answer']) },
  { name: 'morph-shape', kind: 'css', group: 'SVG / geometry', effect: '形状路径变形。', bestFor: '背景形状、装饰块。', promptHint: '适合写“背景抽象形状轻微 morph-shape”。', caution: '不应干扰正文内容。', demo: animationDemo.ambient('背景形状', 'Soft morph', ['organic layer']) },
  { name: 'parallax-tilt', kind: 'css', group: '3D & perspective', effect: '悬停时 3D 倾斜。', bestFor: '产品卡片、主视觉卡片。', promptHint: '适合写“主卡片 hover 有 parallax-tilt”。', caution: '只适合少量可交互元素。', demo: animationDemo.card('主视觉卡片', 'Product card', ['hover tilt']) },
  { name: 'card-flip-3d', kind: 'css', group: '3D & perspective', effect: '3D 翻卡。', bestFor: '前后对比、before/after。', promptHint: '适合写“对比卡片做 card-flip-3d”。', caution: '信息密集页慎用。', demo: animationDemo.card('前后对照', 'Before / After', ['flip reveal']) },
  { name: 'cube-rotate-3d', kind: 'css', group: '3D & perspective', effect: '像立方体侧面旋入。', bestFor: '章节切换页。', promptHint: '适合写“章节页使用 cube-rotate-3d”。', caution: '强风格动画，一页一个就够。', demo: animationDemo.card('章节切换', 'Section 02', ['turn the cube']) },
  { name: 'page-turn-3d', kind: 'css', group: '3D & perspective', effect: '翻页式 3D 展开。', bestFor: '叙事型、编辑感内容。', promptHint: '适合写“叙事章节页带 page-turn-3d 感”。', caution: '过度使用会干扰阅读。', demo: animationDemo.card('叙事翻页', 'Editorial spread', ['page turn']) },
  { name: 'perspective-zoom', kind: 'css', group: '3D & perspective', effect: '从景深远处拉近。', bestFor: '封面开场。', promptHint: '适合写“封面主标题 perspective-zoom 开场”。', caution: '正文区不适合。', demo: animationDemo.headline('封面开场', 'Launch Story') },
  { name: 'marquee-scroll', kind: 'css', group: 'Ambient / continuous', effect: '无限横向滚动。', bestFor: 'logo 墙、客户条、标签带。', promptHint: '适合写“客户 logo 条做 marquee-scroll”。', caution: '只让一条带滚动，别全页都动。', demo: animationDemo.marquee('客户标识', ['NOVA', 'MESH', 'PULSE', 'ORBIT', 'STACK', 'LUMA']) },
  { name: 'kenburns', kind: 'css', group: 'Ambient / continuous', effect: '图片慢速平移缩放。', bestFor: '封面背景图。', promptHint: '适合写“背景大图用 kenburns 缓慢运动”。', caution: '文字层必须保持稳定清晰。', demo: animationDemo.ambient('背景大图', 'City lights', ['slow zoom']) },
  { name: 'confetti-burst', kind: 'css', group: 'Ambient / continuous', effect: '彩屑爆发。', bestFor: '感谢页、庆祝页。', promptHint: '适合写“thanks 页使用 confetti-burst”。', caution: '仅适合庆祝场景。', demo: animationDemo.ambient('庆祝时刻', 'Launch complete', ['celebration']) },
  { name: 'spotlight', kind: 'css', group: 'Ambient / continuous', effect: '聚光灯式揭示。', bestFor: '大 reveal 时刻。', promptHint: '适合写“某个重点模块用 spotlight 揭示”。', caution: '一页最多一个 spotlight 焦点。', demo: animationDemo.ambient('重点揭示', 'Key insight', ['spotlight']) },
  { name: 'ripple-reveal', kind: 'css', group: 'Ambient / continuous', effect: '涟漪式展开。', bestFor: '章节切换、主题揭示。', promptHint: '适合写“章节过渡使用 ripple-reveal”。', caution: '不要和强烈缩放类动画同页叠加。', demo: animationDemo.ambient('章节过渡', 'New chapter', ['ripple']) },
  { name: 'particle-burst', kind: 'fx', group: 'Canvas FX', effect: '中心粒子爆发并循环。', bestFor: '数据揭示、强调时刻。', promptHint: '适合写“指标页背景加 particle-burst”。', caution: '需要明确高度容器，不要遮挡正文。', demo: animationDemo.fxStage('粒子爆发', '42%', ['KPI', 'burst', 'reveal']) },
  { name: 'confetti-cannon', kind: 'fx', group: 'Canvas FX', effect: '双侧彩带礼炮。', bestFor: '庆祝、成功页。', promptHint: '适合写“收尾页加 confetti-cannon”。', caution: '正式商务页通常不适用。', demo: animationDemo.fxStage('礼炮庆祝', 'SUCCESS', ['ship', 'celebrate', 'done']) },
  { name: 'firework', kind: 'fx', group: 'Canvas FX', effect: '烟花持续升空与爆炸。', bestFor: '发布会、节庆型封面。', promptHint: '适合写“发布页背景用 firework”。', caution: '信息密集页不要用。', demo: animationDemo.fxStage('发布舞台', 'LIVE', ['launch', 'night', 'spark']) },
  { name: 'starfield', kind: 'fx', group: 'Canvas FX', effect: '3D 星野穿梭。', bestFor: '太空、未来、AI 背景。', promptHint: '适合写“封面背景使用 starfield”。', caution: '只做氛围底层，不要抢主标题。', demo: animationDemo.fxStage('深空背景', 'STARFIELD', ['AI', 'future', 'orbit']) },
  { name: 'matrix-rain', kind: 'fx', group: 'Canvas FX', effect: '矩阵雨字符流。', bestFor: '安全、数据、黑客风。', promptHint: '适合写“安全主题背景加 matrix-rain”。', caution: '可读性容易受影响。', demo: animationDemo.fxStage('矩阵雨', '0101', ['hex', 'trace', 'green']) },
  { name: 'knowledge-graph', kind: 'fx', group: 'Canvas FX', effect: '带标签的力导向知识图谱。', bestFor: 'RAG、图数据库、知识网络。', promptHint: '适合写“知识图谱页使用 knowledge-graph”。', caution: '需要留足视区，不要把正文压到图上。', demo: animationDemo.fxStage('图谱节点', 'Graph', ['entity', 'relation', 'evidence']) },
  { name: 'neural-net', kind: 'fx', group: 'Canvas FX', effect: '神经网络脉冲传播。', bestFor: '模型架构、ML 流程。', promptHint: '适合写“模型结构页加 neural-net 背景”。', caution: '只在 AI/ML 语境中使用。', demo: animationDemo.fxStage('神经脉冲', 'Model', ['input', 'hidden', 'output']) },
  { name: 'constellation', kind: 'fx', group: 'Canvas FX', effect: '星点漂移并连线。', bestFor: '安静的科技氛围背景。', promptHint: '适合写“封面用 constellation 做轻科技背景”。', caution: '比 knowledge-graph 更适合做底层氛围。', demo: animationDemo.fxStage('星点连线', 'Signal', ['nodes', 'links', 'drift']) },
  { name: 'orbit-ring', kind: 'fx', group: 'Canvas FX', effect: '多层轨道环绕。', bestFor: '分层系统、核心与外围关系。', promptHint: '适合写“系统分层页使用 orbit-ring”。', caution: '不适合复杂正文区。', demo: animationDemo.fxStage('轨道分层', 'Core', ['layer 1', 'layer 2', 'layer 3']) },
  { name: 'galaxy-swirl', kind: 'fx', group: 'Canvas FX', effect: '星系螺旋旋转。', bestFor: '封面、引子、故事开头。', promptHint: '适合写“封面背景使用 galaxy-swirl”。', caution: '主要用于氛围，不是信息图。', demo: animationDemo.fxStage('星系旋流', 'Galaxy', ['spiral', 'dust', 'intro']) },
  { name: 'word-cascade', kind: 'fx', group: 'Canvas FX', effect: '关键词从上落下并堆叠。', bestFor: '概念云、关键词集合。', promptHint: '适合写“关键词页使用 word-cascade”。', caution: '适合概念词，不适合完整句子。', demo: animationDemo.fxStage('关键词雨', 'Agents', ['reasoning', 'tools', 'memory']) },
  { name: 'letter-explode', kind: 'fx', group: 'Canvas FX', effect: '标题字母从四周飞入。', bestFor: '大标题、品牌词。', promptHint: '适合写“主标题配 letter-explode 入场”。', caution: '一页只做一次主标题特效。', demo: animationDemo.fxStage('标题飞入', 'EXPLODE', ['title', 'entry', 'impact']) },
  { name: 'chain-react', kind: 'fx', group: 'Canvas FX', effect: '链式脉冲依次传递。', bestFor: '流水线、顺序执行。', promptHint: '适合写“流程页用 chain-react 表示链路”。', caution: '要和流程内容同方向。', demo: animationDemo.fxStage('链式传递', 'Pipeline', ['step 1', 'step 2', 'step 3']) },
  { name: 'magnetic-field', kind: 'fx', group: 'Canvas FX', effect: '粒子沿曲线运动并拖尾。', bestFor: '抽象能量流、品牌氛围。', promptHint: '适合写“背景层用 magnetic-field 营造能量流”。', caution: '只能做背景陪衬。', demo: animationDemo.fxStage('能量拖尾', 'Flux', ['field', 'motion', 'trail']) },
  { name: 'data-stream', kind: 'fx', group: 'Canvas FX', effect: '二进制与 hex 数据流滚动。', bestFor: '数据、API、系统流。', promptHint: '适合写“数据安全页用 data-stream”。', caution: '和正文对比要足够。', demo: animationDemo.fxStage('数据流', 'API', ['json', 'event', 'stream']) },
  { name: 'gradient-blob', kind: 'fx', group: 'Canvas FX', effect: '渐变 blob 漂移。', bestFor: '柔和 hero 背景。', promptHint: '适合写“hero 区背景用 gradient-blob”。', caution: '比粒子类更适合轻主题。', demo: animationDemo.fxStage('渐变云团', 'Glow', ['soft', 'hero', 'depth']) },
  { name: 'sparkle-trail', kind: 'fx', group: 'Canvas FX', effect: '跟随指针或自动摆动的闪光轨迹。', bestFor: '互动感页面、轻量展示。', promptHint: '适合写“交互区域加入 sparkle-trail”。', caution: '静态演示里存在感会偏强。', demo: animationDemo.fxStage('闪光轨迹', 'Spark', ['cursor', 'shine', 'trace']) },
  { name: 'shockwave', kind: 'fx', group: 'Canvas FX', effect: '冲击波扩散。', bestFor: '告警、发布、重点揭示。', promptHint: '适合写“关键里程碑出现时 shockwave 一次”。', caution: '重复太多会廉价。', demo: animationDemo.fxStage('冲击扩散', 'Impact', ['pulse', 'ring', 'alert']) },
  { name: 'typewriter-multi', kind: 'fx', group: 'Canvas FX', effect: '多行终端打字机同时输出。', bestFor: 'Agent、终端、启动日志。', promptHint: '适合写“终端页加入 typewriter-multi 日志”。', caution: '更适合技术/赛博主题。', demo: animationDemo.terminal('多行日志', ['> booting graph runtime', '> syncing 28 nodes', '> agent ready_']) },
  { name: 'counter-explosion', kind: 'fx', group: 'Canvas FX', effect: '数字计数到目标后爆发粒子。', bestFor: '增长指标、纪录刷新。', promptHint: '适合写“核心 KPI 用 counter-explosion”。', caution: '只适合单一超级重点数字。', demo: animationDemo.metric('爆发计数', '2400', ['records set']) },
]

const promptPatterns: PromptPattern[] = [
  { id: 'basic', title: '基础提示词', goal: '先把题目、受众、风格目标和输出形式说清楚，让 agent 不用先猜你要什么。', template: '请基于 html-ppt-skill，做一套 {受众} 使用的 {主题} HTML 演示，整体风格偏 {风格气质}，页数约 {页数范围} 页，输出要适合键盘翻页和静态展示。', shortExample: '请基于 html-ppt-skill，做一套给工程师看的 AI Agent 技术分享 HTML 演示，整体风格偏 tokyo-night，页数约 10 页。', longExample: '请基于 html-ppt-skill，做一套给工程师看的 AI Agent 技术分享 HTML 演示，整体风格偏 tokyo-night，结构克制、信息密度高、适合现场讲解，控制在 10 页左右，优先使用现成模板而不是从零排版。' },
  { id: 'audience', title: '按受众指定', goal: '受众会直接影响主题、版式密度和语言风格。', template: '受众是 {工程师/管理层/VC/学生/小红书读者}，所以页面风格要 {更理性/更正式/更轻内容/更易懂}，请优先选择匹配的主题和布局。', shortExample: '受众是管理层，所以页面风格要更正式，优先选择 corporate-clean 或 swiss-grid 一类主题。', longExample: '受众是第一次接触这个主题的学生，所以语言要更容易懂，先用课程型结构推进，目录、步骤页和流程图比复杂图表更重要。' },
  { id: 'theme', title: '按主题指定', goal: '当你已经确定视觉方向时，直接点名主题比“做高级一点”更有效。', template: '请使用 {themeName} 主题，页面颜色、字重、背景和强调色都围绕这个主题展开，不要偏离成别的审美方向。', shortExample: '请使用 pitch-deck-vc 主题，整体保持投资人 deck 的节奏和专业感。', longExample: '请使用 xiaohongshu-white 主题，整体保持白底、轻编辑感和内容平台气质，文字不要太学术，图片和留白要更精致。' },
  { id: 'full-deck', title: '按完整模板指定', goal: '整套 deck 最稳的方式，是直接要求某个 full-deck 做骨架。', template: '请以 {fullDeckName} 作为整套 deck 的起始模板，在它的结构语言上替换内容，不要完全从零创建新的页面体系。', shortExample: '请以 tech-sharing 作为整套 deck 的起始模板，做一套工程团队内部分享。', longExample: '请以 product-launch 作为整套 deck 的起始模板，首页要有发布会氛围，中间页用亮点揭示、数据页和 CTA 收束，不要做成普通报告样式。' },
  { id: 'layout-animation', title: '按布局与动效指定', goal: '当你已经想好某几页要怎么排时，直接指定 layout 和 animation 会更稳定。', template: '请包含这些页面：{layoutA}、{layoutB}、{layoutC}。其中 {关键页} 使用 {animationName}，但整页动效种类控制在 1-2 种。', shortExample: '请包含 cover、toc、chart-bar、thanks，其中封面用 rise-in，列表页用 stagger-list。', longExample: '请包含 cover、process-steps、arch-diagram、kpi-grid 和 thanks。封面标题用 rise-in，步骤列表用 stagger-list，KPI 数字用 counter-up，其他页面不要再叠加额外强动效。' },
  { id: 'polished', title: '完整版长提示词', goal: '适合第一次就想把主题、模板、受众、节奏、动效都一次性交代清楚。', template: '请基于 html-ppt-skill，做一套 {受众} 使用的 {话题} HTML 演示，优先采用 {fullDeckName} 模板和 {themeName} 主题。页面包含 {关键布局列表}，整体风格 {风格形容词列表}。动效只保留 {1-2 个动效名称}，并遵循 notes 与 keyboard runtime 规则。', shortExample: '请基于 html-ppt-skill，做一套给工程师看的多 agent 协作技术分享，优先采用 tech-sharing 模板和 tokyo-night 主题。', longExample: '请基于 html-ppt-skill，做一套给工程师看的多 agent 协作技术分享 HTML 演示，优先采用 tech-sharing 模板和 tokyo-night 主题。页面包含 cover、toc、process-steps、arch-diagram、kpi-grid、thanks。整体风格克制、工程感强、信息密度高。动效只保留 rise-in 和 stagger-list，不要堆满炫技效果，并遵循 notes、keyboard runtime 和导出链路约束。' },
]

const usageOrder: PlatformUsageStep[] = [
  { title: '准备需求和素材', description: '先确定演示主题、受众、页数、风格方向和要引用的图片或资料。需求越具体，智能体生成的候选越稳定。' },
  { title: '生成或导入演示', description: '可以在智能体里从零生成，也可以用顶部的导入 HTML 把已有 deck 放进编辑器继续修改。' },
  { title: '浏览页面并确定结构', description: '先在页面模块检查分页顺序，必要时上移、下移、复制或删除页面，把整体叙事顺序排稳。' },
  { title: '编辑内容和对象', description: '进入编辑模块选择节点，修改文字、插槽、图片、位置尺寸和图层。先改主内容，再处理细节。' },
  { title: '调整对象、版式和动效', description: '通过对象列表、富文本、位置图层和动效参数完成日常编辑，主题配置不放在当前编辑面板里。' },
  { title: '检查候选并对比', description: '智能体生成候选后，先看摘要、预览和来源，再进入对比模式决定导入、下载或丢弃。' },
  { title: '演示预览', description: '用演示窗口检查翻页、讲者备注、黑屏白屏、概览和现场展示节奏。' },
  { title: '导出交付', description: '确认画布无明显溢出后，按用途导出独立 HTML、图片式 PDF 或智能 PPTX 文件。' },
]

const platformModules: PlatformModule[] = [
  {
    title: '顶部工具栏',
    purpose: '处理全局入口、文件进出、导出和演示预览。',
    features: [
      { name: 'HTML PPT 指南', description: '进入资料库，查看平台使用说明、主题、模板、布局、动效、提示词和原则。' },
      { name: '导入 HTML', description: '选择本地 HTML 文件并载入编辑器。系统会尝试适配普通 HTML 为可编辑演示结构。' },
      { name: '导出 HTML', description: '导出可独立打开的 HTML 演示文件。导出前会等待字体、图片和指定节点，并冻结动画状态。' },
      { name: '导出 PDF', description: '把当前演示按页面截图导出为图片式 PDF，适合直接交付和分享。' },
      { name: '智能导出 PPTX', description: '调用智能体生成可编辑 PPTX，适合需要 PowerPoint 源文件继续协作的场景。' },
      { name: '演示', description: '打开演示窗口，支持方向键翻页、计时、讲者备注、下一页提示、黑屏、白屏和概览。' },
    ],
    tip: '导出会使用当前编辑器中的最新内容；如果浏览器拦截演示窗口，需要允许弹窗后重试。',
  },
  {
    title: '页面模块',
    purpose: '管理整套演示的分页和当前编辑页。',
    features: [
      { name: '页面列表', description: '显示全部页面，点击页面名称即可切换画布和编辑目标。' },
      { name: '上移 / 下移', description: '调整当前页面在整套演示中的顺序。第一页不能上移，最后一页不能下移。' },
      { name: '复制页面', description: '复制当前页，适合复用同一版式继续改内容。' },
      { name: '删除页面', description: '删除当前页。只有一页时不能删除，避免演示变成空文档。' },
      { name: '插入图片块', description: '从本地选择图片并插入当前页，图片会按画布尺寸自动居中和缩放。' },
    ],
    tip: '建议先用页面模块整理结构，再进入编辑模块做细节修改。',
  },
  {
    title: '编辑模块',
    purpose: '修改当前页里的可编辑对象、版式和动效。',
    features: [
      { name: '对象列表', description: '列出当前页可编辑对象。点击画布对象或列表项后，右侧区域会显示对应编辑项。' },
      { name: '富文本内容', description: '像 WPS 一样直接调整文字、段落、加粗、斜体、下划线和颜色。' },
      { name: '文本格式', description: '调整字体、字号、字重、加粗、斜体、下划线、对齐、文字颜色、行高和字距。' },
      { name: '组件插槽', description: '编辑模板组件内的插槽文案，适合修改卡片、列表、标签等结构化内容。' },
      { name: '图片编辑', description: '替换图片、删除图片，或修改图片替代文本。' },
      { name: '锁定 / 隐藏', description: '锁定节点可避免误操作；隐藏节点可临时从画布中移除但保留结构。' },
      { name: '位置和图层', description: '对浮动对象精确设置 X、Y、宽、高，也可以置顶、置底、上移一层或下移一层。' },
      { name: '动效', description: '对支持动效的节点启用或关闭动画，并设置时长和延迟。' },
    ],
    tip: '日常编辑优先使用对象列表、富文本和插槽，减少用户直接处理 HTML 结构的负担。',
  },
  {
    title: '智能体模块',
    purpose: '用对话生成或改写演示，并管理候选结果。',
    features: [
      { name: '从零生成', description: '从空白结构开始生成一套新演示。适合还没有现成 deck 的场景。' },
      { name: '对话修改当前演示', description: '把当前演示作为上下文，让智能体围绕现有内容继续改写和迭代。' },
      { name: '参考资料', description: '上传本地资料作为生成依据。已上传资料会以标签形式显示。' },
      { name: '给智能体的需求', description: '输入要生成或修改的目标，例如页数、主题、受众、风格和必须包含的内容。' },
      { name: '继续回答智能体', description: '当智能体追问缺失信息时，在这里补充回答或填写表单选项。' },
      { name: '生成候选', description: '发送需求并等待智能体返回候选。生成期间会显示当前阶段和进度。' },
      { name: '终止生成', description: '中止正在进行的生成任务，适合发现需求写错或不想继续等待时使用。' },
      { name: '摘要', description: '查看当前状态和所选生成模式。' },
      { name: '对话记录', description: '查看你和智能体的过程输出，也可以清除记录并重置上下文。' },
      { name: '候选', description: '查看候选摘要、前几页预览、来源和后续操作。' },
      { name: '进入对比模式', description: '在主工作区并排查看当前演示和 HTML 候选。' },
      { name: '导入编辑器', description: '把 HTML 候选导入当前编辑器并继续修改。' },
      { name: '下载 HTML 候选', description: '不导入编辑器，直接把候选保存为本地 HTML 文件。' },
      { name: '丢弃草稿', description: '放弃当前候选并回到普通编辑状态。' },
      { name: '清空当前 HTML', description: '清空当前页面内容并保留最小 deck 结构。此操作会先弹出确认。' },
    ],
    tip: '生成前把受众、页数、场景和风格写清楚；候选出来后先对比，再决定导入或下载。',
  },
  {
    title: '画布与对比模块',
    purpose: '预览当前页面、查看状态，并在需要时检查候选差异。',
    features: [
      { name: '当前页预览', description: '画布使用 iframe 运行当前 HTML，并只显示当前选中的 slide。' },
      { name: '状态提示', description: '展示导入、导出、生成、修复和错误等即时状态。' },
      { name: '画布尺寸', description: '显示当前 deck 的宽高以及预览缩放比例。' },
      { name: '自适应', description: '让画布自动缩放到可视区域，适合日常编辑和快速检查。' },
      { name: '原尺寸', description: '按真实画布尺寸显示，适合检查细节和溢出。' },
      { name: '内容可能超出画布', description: '当运行时测量到内容超过画布宽高时显示诊断提示。' },
      { name: '拖动所选对象', description: '选择浮动对象后，可直接在画布上拖动位置。' },
      { name: '缩放所选对象', description: '拖动四角控制点等比缩放图片或浮动对象。' },
      { name: '候选对比', description: '进入对比模式后，左侧保留当前演示，右侧显示智能体 HTML 候选。' },
      { name: '退出对比模式', description: '关闭候选并排预览，回到普通编辑画布。' },
    ],
    tip: '导出前建议切到原尺寸看一遍，确认文字、图片和动效没有压出画布。',
  },
  {
    title: 'HTML PPT Skill 资料库',
    purpose: '帮助你选择更稳定的主题、模板、布局、动效和提示词写法。',
    features: [
      { name: '概览', description: '了解 html-ppt-skill 是什么、适合谁，以及可用主题、模板、布局和动效数量。' },
      { name: '快速开始', description: '按五步理解如何先定受众、再选主题或模板、最后补动效。' },
      { name: '主题', description: '按商务、技术、轻内容、学术和实验风浏览主题，并查看适合场景。' },
      { name: '模板', description: '查看完整 deck 模板，适合作为整套演示的起始骨架。' },
      { name: '布局', description: '按封面、结构、内容、数据、流程、对比和收尾选择单页版式。' },
      { name: '动效', description: '区分 CSS 入场动画和 FX 动效，了解适用场景和注意事项。' },
      { name: '提示词', description: '复制可复用提示词模式，让智能体更快理解你的目标。' },
      { name: '原则', description: '查看使用 html-ppt-skill 时最容易踩坑的规则。' },
      { name: '搜索、筛选和预览', description: '用搜索框和分类筛选快速定位资料，点击卡片查看详情或预览。' },
    ],
    tip: '不确定怎么写需求时，先到资料库选一个模板、主题和 1 到 2 个关键布局，再回到智能体输入需求。',
  },
]

export const htmlPptSkillGuideData: GuideCatalog = {
  overviewBlurb:
    'html-ppt-skill 是一套以静态 HTML/CSS/JS 为核心的演示生产体系。它不是单一模板，而是一整套主题、布局、动效、运行时和导出流程的组合，最适合用“先选骨架，再补内容，再加动效”的方式使用。',
  audience: [
    '第一次接触 html-ppt-skill 的使用者',
    '想快速理解有哪些模板、主题和动效可用的人',
    '需要把 prompt 写得更稳定、更可复用的内容创作者与工程师',
  ],
  quickStart: [...quickStart],
  usageOrder,
  platformModules,
  sections: [...sections],
  themes,
  fullDecks,
  layouts,
  animations,
  promptPatterns,
}
