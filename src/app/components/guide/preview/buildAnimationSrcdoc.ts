import type { GuideAnimation } from '../../../htmlPptSkillGuideData'

export function buildAnimationSrcdoc(params: {
  baseCSS: string
  fontsCSS: string
  animationsCSS: string
  animation: GuideAnimation
  loop?: boolean
}): string {
  const { baseCSS, fontsCSS, animationsCSS, animation, loop } = params
  const { demo } = animation
  const items = demo.items ?? []
  const isFX = animation.kind === 'fx'

  const sceneHTML = buildSceneHTML(demo.scene, demo.label, demo.headline, demo.value, items)
  const animClass = isFX ? '' : `anim-${animation.name}`

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${animation.name} Animation Preview</title>
<style>${fontsCSS}</style>
<style>${baseCSS}</style>
<style>${animationsCSS}</style>
<style>
body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:var(--bg);color:var(--text-1);font-family:var(--font-sans)}
.preview-wrap{width:100%;max-width:720px;padding:48px 40px}
.scene{position:relative;display:grid;align-content:center;gap:16px;min-height:280px;padding:32px;border-radius:var(--radius-lg);background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow);overflow:hidden}
.kicker{font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
.display{font-family:var(--font-display);font-size:clamp(28px,4vw,48px);line-height:1;font-weight:800;letter-spacing:-.03em;margin:0}
.lede{font-size:18px;line-height:1.5;color:var(--text-2);margin:0}
.pill-row{display:flex;flex-wrap:wrap;gap:8px}
.pill{display:inline-block;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:600;background:var(--surface-2);color:var(--text-2);border:1px solid var(--border)}
.pill-accent{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);border-color:color-mix(in srgb,var(--accent) 28%,transparent)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;box-shadow:var(--shadow)}
.metric-val{font-family:var(--font-display);font-size:clamp(48px,6vw,72px);font-weight:900;line-height:1;background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.terminal{background:rgba(0,0,0,.88);border-radius:var(--radius);padding:20px;font-family:var(--font-mono);font-size:14px;line-height:1.7;color:#7ef6c8}
.terminal-bar{display:flex;gap:6px;margin-bottom:14px}
.terminal-dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.2)}
.fx-label{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);padding:8px 14px;border-radius:999px;background:var(--surface-2);display:inline-block}
.badge{position:absolute;top:16px;right:16px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;border-radius:999px;background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent)}
${loop ? `.scene,.scene *{animation-iteration-count:infinite!important;animation-fill-mode:none!important}` : ''}
</style>
</head>
<body>
<div class="preview-wrap">
  <div class="scene ${animClass}">
    ${isFX ? '<span class="badge">Canvas FX</span>' : ''}
    ${sceneHTML}
  </div>
</div>
</body>
</html>`
}

function buildSceneHTML(
  scene: string,
  label: string,
  headline: string | undefined,
  value: string | undefined,
  items: string[],
): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  switch (scene) {
    case 'content':
      return `
        <span class="kicker">${esc(label)}</span>
        <h2 class="display">${esc(headline ?? '')}</h2>
        <div class="pill-row">
          ${items.map((i) => `<span class="pill pill-accent">${esc(i)}</span>`).join('')}
        </div>`

    case 'headline':
      return `
        <span class="kicker">${esc(label)}</span>
        <h1 class="display">${esc(value ?? '')}</h1>
        <div class="pill-row">
          ${items.map((i) => `<span class="pill">${esc(i)}</span>`).join('')}
        </div>`

    case 'banner':
      return `
        <div class="card">
          <span class="kicker">${esc(label)}</span>
          <h2 class="display" style="margin-top:8px">${esc(value ?? '')}</h2>
          ${items[0] ? `<p class="lede" style="margin-top:8px">${esc(items[0])}</p>` : ''}
        </div>`

    case 'split':
      return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="card">
            <span class="kicker">${esc(label)}</span>
            <h3 class="display" style="font-size:clamp(20px,3vw,32px);margin-top:8px">${esc(headline ?? '')}</h3>
          </div>
          <div class="card" style="display:grid;gap:10px;align-content:center">
            ${items.map((i) => `<span class="pill">${esc(i)}</span>`).join('')}
          </div>
        </div>`

    case 'list':
      return `
        <span class="kicker">${esc(label)}</span>
        <div style="display:grid;gap:10px">
          ${items.map((i) => `<div class="card" style="padding:14px 18px;font-weight:600">${esc(i)}</div>`).join('')}
        </div>`

    case 'metric':
      return `
        <div style="text-align:center">
          <span class="kicker">${esc(label)}</span>
          <div class="metric-val">${esc(value ?? '')}</div>
          ${items[0] ? `<p class="lede" style="margin-top:8px">${esc(items[0])}</p>` : ''}
        </div>`

    case 'diagram':
      return `
        <span class="kicker">${esc(label)}</span>
        <svg viewBox="0 0 240 100" style="width:100%;max-width:320px;margin:0 auto;display:block">
          <line x1="40" y1="50" x2="118" y2="50" stroke="var(--accent)" stroke-width="3"/>
          <line x1="122" y1="50" x2="200" y2="50" stroke="var(--accent)" stroke-width="3"/>
          <circle cx="32" cy="50" r="14" fill="var(--surface)" stroke="var(--accent)" stroke-width="2.5"/>
          <circle cx="120" cy="50" r="14" fill="var(--surface)" stroke="var(--accent)" stroke-width="2.5"/>
          <circle cx="208" cy="50" r="14" fill="var(--surface)" stroke="var(--accent)" stroke-width="2.5"/>
        </svg>
        <div class="pill-row" style="justify-content:center">
          ${items.map((i) => `<span class="pill">${esc(i)}</span>`).join('')}
        </div>`

    case 'card':
      return `
        <div class="card" style="max-width:360px;margin:0 auto;text-align:center">
          <span class="kicker">${esc(label)}</span>
          <h2 class="display" style="margin-top:8px">${esc(value ?? '')}</h2>
          ${items[0] ? `<p class="lede" style="margin-top:8px;font-size:14px">${esc(items[0])}</p>` : ''}
        </div>`

    case 'marquee':
      return `
        <span class="kicker">${esc(label)}</span>
        <div style="overflow:hidden">
          <div style="display:flex;gap:10px;width:max-content;animation:marquee 10s linear infinite">
            ${[...items, ...items].map((i) => `<span class="pill">${esc(i)}</span>`).join('')}
          </div>
        </div>
        <style>@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}</style>`

    case 'ambient':
      return `
        <div style="position:relative;min-height:200px;display:grid;align-content:end;gap:12px">
          <div style="position:absolute;top:-20px;right:-20px;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,var(--accent),transparent 70%);opacity:.25;filter:blur(20px)"></div>
          <span class="kicker">${esc(label)}</span>
          <h2 class="display">${esc(value ?? '')}</h2>
          ${items[0] ? `<p class="lede">${esc(items[0])}</p>` : ''}
        </div>`

    case 'terminal':
      return `
        <div class="terminal">
          <div class="terminal-bar"><span class="terminal-dot"></span><span class="terminal-dot"></span><span class="terminal-dot"></span></div>
          ${items.map((i) => `<div>${esc(i)}</div>`).join('')}
        </div>`

    case 'fx-stage':
      return `
        <div style="text-align:center">
          <span class="fx-label">${esc(label)}</span>
          <div class="display" style="margin-top:16px;color:var(--accent)">${esc(value ?? '')}</div>
          <div class="pill-row" style="justify-content:center;margin-top:12px">
            ${items.map((i) => `<span class="pill">${esc(i)}</span>`).join('')}
          </div>
        </div>`

    default:
      return `
        <span class="kicker">${esc(label)}</span>
        <h2 class="display">${esc(value ?? headline ?? '')}</h2>`
  }
}
