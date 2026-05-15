import { useMemo } from 'react'
import type { GuideTheme } from '../../../htmlPptSkillGuideData'
import { generateSlideHTML } from './themeSlideContent'
import { buildThemeSrcdoc } from './buildThemeSrcdoc'

type ThemeCSSData = { base: string; fonts: string; theme: string }

interface ThemeSlidePreviewProps {
  theme: GuideTheme
  cssData: ThemeCSSData
}

export function ThemeSlidePreview({ theme, cssData }: ThemeSlidePreviewProps) {
  const srcdoc = useMemo(() => {
    const { slide1 } = generateSlideHTML(theme)
    return buildThemeSrcdoc({
      baseCSS: cssData.base,
      fontsCSS: cssData.fonts,
      themeCSS: cssData.theme,
      slide1HTML: slide1,
    })
  }, [theme, cssData])

  return (
    <iframe
      className="theme-slide-preview-iframe"
      sandbox=""
      title={`${theme.name} preview`}
      srcDoc={srcdoc}
    />
  )
}
