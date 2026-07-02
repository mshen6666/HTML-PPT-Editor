import { describe, expect, it } from 'vitest';

import { evaluatePptQualityGate } from './pptQualityGate';

function buildDeckHtml(options: {
  slideCount: number;
  deckName?: string;
  themeName?: string;
  animationName?: string;
  includeRuntime?: boolean;
  includeNotes?: boolean;
}): string {
  const slides = Array.from({ length: options.slideCount }, (_, index) => `
    <section class="slide layout-card" data-slide-id="slide-${index + 1}">
      <article class="card info-block" data-anim="${options.animationName ?? 'fade-up'}">
        <p>第 ${index + 1} 页正文段落</p>
      </article>
      ${options.includeNotes ? '<aside class="speaker-notes">讲者备注</aside>' : ''}
    </section>
  `).join('');

  return `
    <!doctype html>
    <html data-fs-editable-deck="1" data-fs-deck-profile="html-ppt">
      <head>
        <link id="theme-link" href="./themes/${options.themeName ?? 'minimal-white'}.css" />
      </head>
      <body data-deck="${options.deckName ?? 'course-module'}">
        <main class="deck">${slides}</main>
        ${options.includeRuntime ? '<script>window.addEventListener("keydown", function goToSlide() {})</script>' : ''}
      </body>
    </html>
  `;
}

describe('evaluatePptQualityGate', () => {
  it('passes a candidate that matches slide count, template, animation, content styles, and runtime', () => {
    const result = evaluatePptQualityGate({
      prompt: '请基于 course-module 模板，做一套 Java 入门课程，总数5页。每一页PPT的动画特效都采用段落、卡片、普通信息块，正文卡片用 fade-up 轻轻进入，并支持键盘翻页。',
      html: buildDeckHtml({
        slideCount: 5,
        deckName: 'course-module-java',
        themeName: 'minimal-white',
        animationName: 'fade-up',
        includeRuntime: true,
      }),
    });

    expect(result.status).toBe('pass');
    expect(result.statusLabel).toBe('通过');
    expect(result.checks.every((check) => check.status === 'pass')).toBe(true);
  });

  it('fails when an exact slide count requirement is not met', () => {
    const result = evaluatePptQualityGate({
      prompt: '请基于 course-module 模板，生成5页 Java 入门课程，正文卡片用 fade-up。',
      html: buildDeckHtml({
        slideCount: 3,
        deckName: 'course-module',
        animationName: 'fade-up',
      }),
    });

    expect(result.status).toBe('fail');
    expect(result.checks.find((check) => check.id === 'slide-count')?.status).toBe('fail');
    expect(result.checks.find((check) => check.id === 'slide-count')?.detail).toContain('当前 3 页');
  });

  it('prefers the explicit prompt slide count over stale candidate metadata', () => {
    const result = evaluatePptQualityGate({
      prompt: 'Please generate 8 pages for this report.',
      html: buildDeckHtml({
        slideCount: 8,
        deckName: 'course-module',
        animationName: 'fade-up',
      }),
      expectedSlideCount: 16,
    });

    expect(result.checks.find((check) => check.id === 'slide-count')?.status).toBe('pass');
  });

  it('does not read dates as slide counts when the prompt already asks for 10 pages', () => {
    const result = evaluatePptQualityGate({
      prompt: '请生成10页2026 FIFA 世界杯激情盛宴PPT，赛程从2026.6.11开始。',
      html: buildDeckHtml({
        slideCount: 10,
        deckName: 'sports-event',
        themeName: 'cyberpunk-neon',
        animationName: 'fade-up',
      }),
      expectedSlideCount: 10,
    });

    expect(result.checks.find((check) => check.id === 'slide-count')?.status).toBe('pass');
    expect(result.checks.find((check) => check.id === 'slide-count')?.detail).toContain('10 页');
  });

  it('keeps one-page count drift as a review tip instead of a hard block', () => {
    const result = evaluatePptQualityGate({
      prompt: '请生成10页世界杯赛事PPT。',
      html: buildDeckHtml({
        slideCount: 11,
        deckName: 'sports-event',
        themeName: 'cyberpunk-neon',
      }),
    });

    expect(result.checks.find((check) => check.id === 'slide-count')?.status).toBe('warning');
  });

  it('accepts standard html-ppt root attributes with canvas metadata', () => {
    const html = buildDeckHtml({
      slideCount: 3,
      deckName: 'sports-event',
      themeName: 'cyberpunk-neon',
    }).replace(
      '<html data-fs-editable-deck="1" data-fs-deck-profile="html-ppt">',
      '<html lang="zh-CN" data-fs-editable-deck="1" data-fs-deck-profile="html-ppt" data-fs-canvas-width="1280" data-fs-canvas-height="720">',
    );

    const result = evaluatePptQualityGate({
      prompt: '生成3页世界杯PPT。',
      html,
    });

    expect(result.checks.find((check) => check.id === 'html-contract')?.status).toBe('pass');
  });

  it('fails when a named animation is missing from the candidate HTML', () => {
    const result = evaluatePptQualityGate({
      prompt: '请做5页课程 PPT，动效只使用 fade-up。',
      html: buildDeckHtml({
        slideCount: 5,
        animationName: 'rise-in',
      }),
    });

    expect(result.status).toBe('fail');
    expect(result.checks.find((check) => check.id === 'animation-requirements')?.status).toBe('fail');
  });

  it('accepts named animations when the candidate uses anim-* classes', () => {
    const html = buildDeckHtml({
      slideCount: 5,
      animationName: 'rise-in',
    }).replaceAll('class="card info-block" data-anim="rise-in"', 'class="card info-block anim-fade-up"');

    const result = evaluatePptQualityGate({
      prompt: '请做5页课程 PPT，每一页PPT的动画特效都用 fade-up，正文卡片轻轻进入。',
      html,
    });

    expect(result.checks.find((check) => check.id === 'animation-requirements')?.status).toBe('pass');
    expect(result.checks.find((check) => check.id === 'per-slide-animation')?.status).toBe('pass');
  });

  it('warns when named guide resources cannot be confirmed in the candidate HTML', () => {
    const result = evaluatePptQualityGate({
      prompt: '请基于 tech-sharing 模板，并使用 tokyo-night 主题，生成约5页技术分享。',
      html: buildDeckHtml({
        slideCount: 5,
        deckName: 'course-module',
        themeName: 'minimal-white',
      }),
    });

    expect(result.status).toBe('warning');
    expect(result.checks.find((check) => check.id === 'resource-requirements')?.status).toBe('warning');
  });

  it('does not throw on invalid or non-standard HTML and reports contract failure', () => {
    const result = evaluatePptQualityGate({
      prompt: '做5页 PPT。',
      html: '<div>不是标准 HTML PPT</div>',
    });

    expect(result.status).toBe('fail');
    expect(result.checks.find((check) => check.id === 'html-contract')?.status).toBe('fail');
    expect(result.checks.find((check) => check.id === 'slide-count')?.status).toBe('fail');
  });
});
