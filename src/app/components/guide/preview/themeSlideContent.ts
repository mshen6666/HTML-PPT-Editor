import type { GuideTheme } from '../../../htmlPptSkillGuideData'
import { guideThemeCategoryLabels } from '../../../htmlPptSkillGuideData'

export function generateSlideHTML(theme: GuideTheme): { slide1: string } {
  const categoryLabel = guideThemeCategoryLabels[theme.category]
  const tagline = theme.tone.join(' · ')

  const slide1 = `
    <p class="kicker">${categoryLabel}</p>
    <h1 class="h1">${theme.name}</h1>
    <p class="lede">${tagline}</p>
    <div class="row wrap mt-l">
      ${theme.tone.map((t, i) => `<span class="pill${i === 0 ? ' pill-accent' : ''}">${t}</span>`).join('\n      ')}
    </div>`

  return { slide1 }
}
