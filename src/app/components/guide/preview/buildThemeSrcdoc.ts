export function buildThemeSrcdoc(params: {
  baseCSS: string
  fontsCSS: string
  themeCSS: string
  slide1HTML: string
}): string {
  const { baseCSS, fontsCSS, themeCSS, slide1HTML } = params

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Theme Preview</title>
<style>${fontsCSS}</style>
<style>${baseCSS}</style>
<style>${themeCSS}</style>
<style>
body.single .slide{padding:clamp(24px,5vw,72px) clamp(32px,6vw,96px)}
.deck-header,.deck-footer,.progress-bar{display:none!important}
</style>
</head>
<body class="single">
<div class="deck">
<section class="slide is-active">
${slide1HTML}
</section>
</div>
</body>
</html>`
}
