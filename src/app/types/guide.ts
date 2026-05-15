import type {
  GuideTheme,
  GuideFullDeck,
  GuideLayout,
  GuideAnimation,
  PromptPattern,
  PlatformModule,
  PlatformUsageStep,
  GuideThemeCategory,
  GuideLayoutCategory,
} from '../htmlPptSkillGuideData'

export type GuideTabId =
  | 'quick-start'
  | 'platform-usage'
  | 'themes'
  | 'templates'
  | 'layouts'
  | 'animations'
  | 'prompts'

export type GuideItemType = 'theme' | 'template' | 'layout' | 'animation' | 'prompt'

export type GuideItem =
  | { type: 'theme'; data: GuideTheme }
  | { type: 'template'; data: GuideFullDeck }
  | { type: 'layout'; data: GuideLayout }
  | { type: 'animation'; data: GuideAnimation }
  | { type: 'prompt'; data: PromptPattern }

export type GuideFilters = {
  themeCategory?: GuideThemeCategory
  layoutCategory?: GuideLayoutCategory
  animationKind?: 'css' | 'fx'
}

export type ViewMode = 'grid' | 'list'

export interface GuideTab {
  id: GuideTabId
  label: string
  count?: number
}

export type { PlatformModule, PlatformUsageStep }
