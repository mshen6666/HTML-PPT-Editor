import { htmlPptSkillGuideData } from './htmlPptSkillGuideData';

export type PptQualityGateStatus = 'pass' | 'warning' | 'fail';

export type PptQualityGateCheck = {
  id: string;
  label: string;
  status: PptQualityGateStatus;
  detail: string;
};

export type PptQualityGateResult = {
  status: PptQualityGateStatus;
  statusLabel: string;
  summary: string;
  checks: PptQualityGateCheck[];
};

type SlideRequirement =
  | { kind: 'exact'; count: number; approximate: boolean; source: string }
  | { kind: 'range'; min: number; max: number; source: string };

type ResourceKind = 'theme' | 'fullDeck' | 'layout';

type ResourceRequirement = {
  kind: ResourceKind;
  name: string;
};

const statusLabels: Record<PptQualityGateStatus, string> = {
  pass: '通过',
  warning: '需复核',
  fail: '未通过',
};

const resourceKindLabels: Record<ResourceKind, string> = {
  theme: '主题',
  fullDeck: '模板',
  layout: '布局',
};

const contentStyleRequirements = [
  {
    name: '段落',
    promptPattern: /段落|paragraph/i,
    htmlPattern: /<p[\s>]|paragraph|prose|body-text/i,
  },
  {
    name: '卡片',
    promptPattern: /卡片|\bcard\b/i,
    htmlPattern: /\bcard\b|card-|panel|tile/i,
  },
  {
    name: '信息块',
    promptPattern: /信息块|普通信息块|info\s*block|callout/i,
    htmlPattern: /info|block|callout|panel/i,
  },
];

/**
 * PPT 门禁只校验能从 HTML 稳定读取的客观项，避免把主观审美判断写成硬拦截。
 */
export function evaluatePptQualityGate(options: {
  prompt: string;
  html: string;
  expectedSlideCount?: number;
}): PptQualityGateResult {
  const prompt = normalizeText(options.prompt);
  const html = options.html || '';
  const lowerHtml = html.toLowerCase();
  const document = parseHtmlDocument(html);
  const slides = collectSlides(document, html);

  const checks: PptQualityGateCheck[] = [
    evaluateHtmlContract(html, lowerHtml),
    evaluateSlideCount(prompt, slides.length, options.expectedSlideCount),
    evaluateResourceRequirements(prompt, lowerHtml),
    evaluateAnimationRequirements(prompt, lowerHtml),
    evaluateEverySlideAnimation(prompt, slides),
    evaluateRuntimeRequirements(prompt, lowerHtml),
    evaluateContentStyleRequirements(prompt, html),
  ];

  const status = resolveGateStatus(checks);

  return {
    status,
    statusLabel: statusLabels[status],
    summary: buildGateSummary(status, checks),
    checks,
  };
}

function evaluateHtmlContract(html: string, lowerHtml: string): PptQualityGateCheck {
  if (!html.trim()) {
    return {
      id: 'html-contract',
      label: 'HTML PPT 结构',
      status: 'fail',
      detail: '候选 HTML 为空，无法导入或校验。',
    };
  }

  const hasEditableDeck = hasAttributeValue(lowerHtml, 'data-fs-editable-deck', '1');
  const hasHtmlPptProfile = hasAttributeValue(lowerHtml, 'data-fs-deck-profile', 'html-ppt');
  const hasDeckStructure = /<main\b[^>]*class=["'][^"']*\bdeck\b/i.test(html)
    && /<section\b[^>]*class=["'][^"']*\bslide\b/i.test(html);

  if (hasEditableDeck && hasHtmlPptProfile) {
    return {
      id: 'html-contract',
      label: 'HTML PPT 结构',
      status: 'pass',
      detail: '已检测到可编辑 deck 标记和 html-ppt profile。',
    };
  }

  if (hasEditableDeck) {
    return {
      id: 'html-contract',
      label: 'HTML PPT 结构',
      status: 'warning',
      detail: '已检测到可编辑 deck 标记，但缺少 html-ppt profile，建议导入前复核运行时兼容性。',
    };
  }

  if (hasDeckStructure) {
    return {
      id: 'html-contract',
      label: 'HTML PPT 结构',
      status: 'warning',
      detail: '已检测到 deck/slide 页面结构，但缺少可编辑 deck 标记；仍可预览，导入前建议复核元素可编辑性。',
    };
  }

  return {
    id: 'html-contract',
    label: 'HTML PPT 结构',
    status: 'fail',
    detail: '未检测到 data-fs-editable-deck="1"，候选可能不是标准可编辑 HTML PPT。',
  };
}

function evaluateSlideCount(
  prompt: string,
  actualSlideCount: number,
  expectedSlideCount?: number,
): PptQualityGateCheck {
  const requirement = resolveSlideRequirement(prompt, expectedSlideCount);

  if (actualSlideCount <= 0) {
    return {
      id: 'slide-count',
      label: '页面数量',
      status: 'fail',
      detail: '未检测到任何 slide 页面。',
    };
  }

  if (!requirement) {
    return {
      id: 'slide-count',
      label: '页面数量',
      status: 'pass',
      detail: `已检测到 ${actualSlideCount} 页；提示词未指定明确页数。`,
    };
  }

  if (requirement.kind === 'range') {
    const inRange = actualSlideCount >= requirement.min && actualSlideCount <= requirement.max;
    return {
      id: 'slide-count',
      label: '页面数量',
      status: inRange ? 'pass' : 'warning',
      detail: inRange
        ? `页数符合 ${requirement.min}-${requirement.max} 页要求，当前 ${actualSlideCount} 页。`
        : `提示词要求 ${requirement.min}-${requirement.max} 页，当前 ${actualSlideCount} 页，建议复核是否需要重新生成。`,
    };
  }

  if (actualSlideCount === requirement.count) {
    return {
      id: 'slide-count',
      label: '页面数量',
      status: 'pass',
      detail: `页数符合 ${requirement.source}：${actualSlideCount} 页。`,
    };
  }

  const diff = Math.abs(actualSlideCount - requirement.count);
  const status: PptQualityGateStatus = requirement.approximate && diff <= 1
    ? 'pass'
    : requirement.approximate || diff <= 1
      ? 'warning'
      : 'fail';

  return {
    id: 'slide-count',
    label: '页面数量',
    status,
    detail: requirement.approximate
      ? `提示词约 ${requirement.count} 页，当前 ${actualSlideCount} 页。`
      : `提示词要求 ${requirement.count} 页，当前 ${actualSlideCount} 页。`,
  };
}

function evaluateResourceRequirements(prompt: string, lowerHtml: string): PptQualityGateCheck {
  const requirements = findResourceRequirements(prompt);
  if (!requirements.length) {
    return {
      id: 'resource-requirements',
      label: '主题/模板/布局',
      status: 'pass',
      detail: '提示词未点名指南中的主题、模板或布局名称，跳过强制匹配。',
    };
  }

  const missing = requirements.filter((requirement) => !resourceExistsInHtml(lowerHtml, requirement.name));
  if (!missing.length) {
    return {
      id: 'resource-requirements',
      label: '主题/模板/布局',
      status: 'pass',
      detail: `已匹配：${formatResourceRequirements(requirements)}。`,
    };
  }

  return {
    id: 'resource-requirements',
    label: '主题/模板/布局',
    status: 'warning',
    detail: `未能在候选 HTML 中确认：${formatResourceRequirements(missing)}。如模型改写了结构命名，请人工复核视觉是否符合。`,
  };
}

function evaluateAnimationRequirements(prompt: string, lowerHtml: string): PptQualityGateCheck {
  const animationNames = htmlPptSkillGuideData.animations.map((animation) => animation.name);
  const mentionedAnimations = findMentionedNames(prompt, animationNames);

  if (!mentionedAnimations.length) {
    return {
      id: 'animation-requirements',
      label: '动效约束',
      status: 'pass',
      detail: '提示词未点名具体动效名称，跳过具体动效匹配。',
    };
  }

  const missingAnimations = mentionedAnimations.filter((name) => !resourceExistsInHtml(lowerHtml, name));
  if (!missingAnimations.length) {
    return {
      id: 'animation-requirements',
      label: '动效约束',
      status: 'pass',
      detail: `已检测到提示词指定动效：${mentionedAnimations.join('、')}。`,
    };
  }

  return {
    id: 'animation-requirements',
    label: '动效约束',
    status: 'fail',
    detail: `提示词指定动效 ${missingAnimations.join('、')}，但候选 HTML 中未检测到对应标记。`,
  };
}

function evaluateEverySlideAnimation(prompt: string, slides: HTMLElement[]): PptQualityGateCheck {
  if (!requiresEverySlideAnimation(prompt)) {
    return {
      id: 'per-slide-animation',
      label: '每页动效',
      status: 'pass',
      detail: '提示词未要求每一页都有动效。',
    };
  }

  if (!slides.length) {
    return {
      id: 'per-slide-animation',
      label: '每页动效',
      status: 'fail',
      detail: '提示词要求每页动效，但未检测到页面结构。',
    };
  }

  const animatedSlideCount = slides.filter((slide) => hasAnimationMarker(slide.outerHTML)).length;
  if (animatedSlideCount === slides.length) {
    return {
      id: 'per-slide-animation',
      label: '每页动效',
      status: 'pass',
      detail: `已检测到 ${animatedSlideCount}/${slides.length} 页包含动效标记。`,
    };
  }

  return {
    id: 'per-slide-animation',
    label: '每页动效',
    status: animatedSlideCount === 0 ? 'fail' : 'warning',
    detail: `提示词要求每页动效，当前仅检测到 ${animatedSlideCount}/${slides.length} 页包含动效标记。`,
  };
}

function evaluateRuntimeRequirements(prompt: string, lowerHtml: string): PptQualityGateCheck {
  const needsNotes = /speaker\s*notes|\bnotes\b|讲者备注|演讲者备注|备注/i.test(prompt);
  const needsKeyboard = /键盘|快捷键|方向键|翻页|keyboard|runtime|演示窗口/i.test(prompt);

  if (!needsNotes && !needsKeyboard) {
    return {
      id: 'runtime-requirements',
      label: '演示运行能力',
      status: 'pass',
      detail: '提示词未指定 notes、键盘翻页或 runtime 要求。',
    };
  }

  const missing: string[] = [];
  if (needsNotes && !/(speaker-notes|data-notes|class=["'][^"']*notes|<aside[^>]*notes)/i.test(lowerHtml)) {
    missing.push('讲者备注/notes');
  }
  if (needsKeyboard && !/(keydown|keyboard|goToSlide|data-fs-deck-runtime|presenter|slide-index)/i.test(lowerHtml)) {
    missing.push('键盘翻页/runtime');
  }

  if (!missing.length) {
    return {
      id: 'runtime-requirements',
      label: '演示运行能力',
      status: 'pass',
      detail: '已检测到提示词要求的 notes 或键盘/runtime 相关标记。',
    };
  }

  return {
    id: 'runtime-requirements',
    label: '演示运行能力',
    status: 'warning',
    detail: `未能确认：${missing.join('、')}。建议演示预览中人工确认。`,
  };
}

function evaluateContentStyleRequirements(prompt: string, html: string): PptQualityGateCheck {
  const requestedStyles = contentStyleRequirements.filter((item) => item.promptPattern.test(prompt));
  if (!requestedStyles.length) {
    return {
      id: 'content-style',
      label: '内容样式词',
      status: 'pass',
      detail: '提示词未指定段落、卡片或信息块等样式词。',
    };
  }

  const missingStyles = requestedStyles.filter((item) => !item.htmlPattern.test(html));
  if (!missingStyles.length) {
    return {
      id: 'content-style',
      label: '内容样式词',
      status: 'pass',
      detail: `已检测到样式线索：${requestedStyles.map((item) => item.name).join('、')}。`,
    };
  }

  return {
    id: 'content-style',
    label: '内容样式词',
    status: 'warning',
    detail: `提示词提到 ${missingStyles.map((item) => item.name).join('、')}，但候选 HTML 中未检测到稳定样式标记。`,
  };
}

function resolveSlideRequirement(prompt: string, expectedSlideCount?: number): SlideRequirement | null {
  const promptRequirement = resolvePromptSlideRequirement(prompt);
  if (promptRequirement) {
    return promptRequirement;
  }

  if (typeof expectedSlideCount === 'number' && expectedSlideCount > 0) {
    return {
      kind: 'exact',
      count: expectedSlideCount,
      approximate: false,
      source: '候选目标页数',
    };
  }

  return null;
}

function resolvePromptSlideRequirement(prompt: string): SlideRequirement | null {
  const rangeMatch = prompt.match(/(\d{1,2})\s*(?:-|~|—|至|到)\s*(\d{1,2})\s*(?:页|頁|pages?|slides?)/i);
  if (rangeMatch) {
    const first = Number(rangeMatch[1]);
    const second = Number(rangeMatch[2]);
    return {
      kind: 'range',
      min: Math.min(first, second),
      max: Math.max(first, second),
      source: '提示词页数范围',
    };
  }

  const countPatterns = [
    /(?:总数|共|一共|生成|做|制作|输出|创建|准备|整理|控制在|约|大约|大概|generate|create|make|build|produce|output|around|about)\s*(\d{1,2})\s*(?:页|頁|pages?|slides?)(?:左右)?/i,
    /(?:ppt|PPT|演示|幻灯片|slides?|deck)\s*(?:总数|共|一共|生成|做|制作|输出|创建|准备|整理|控制在|约|大约|大概|generate|create|make|build|produce|output|around|about)?\s*(\d{1,2})\s*(?:页|頁|pages?|slides?)(?:左右)?/i,
    /(\d{1,2})\s*(?:页|頁|pages?|slides?)(?:左右)?\s*(?:的|以内|上下)?\s*(?:ppt|PPT|演示|幻灯片|slides?|deck)/i,
  ];
  const countMatch = countPatterns
    .map((pattern) => prompt.match(pattern))
    .find((match): match is RegExpMatchArray => Boolean(match));
  if (countMatch) {
    const matchedText = countMatch[0] || '';
    const approximate = /约|大约|大概|左右|控制在/.test(matchedText);
    return {
      kind: 'exact',
      count: Number(countMatch[1]),
      approximate,
      source: '提示词页数',
    };
  }

  return null;
}

function findResourceRequirements(prompt: string): ResourceRequirement[] {
  const themes = findMentionedNames(prompt, htmlPptSkillGuideData.themes.map((theme) => theme.name))
    .map((name): ResourceRequirement => ({ kind: 'theme', name }));
  const fullDecks = findMentionedNames(prompt, htmlPptSkillGuideData.fullDecks.map((deck) => deck.name))
    .map((name): ResourceRequirement => ({ kind: 'fullDeck', name }));
  const layouts = findMentionedNames(prompt, htmlPptSkillGuideData.layouts.map((layout) => layout.name))
    .map((name): ResourceRequirement => ({ kind: 'layout', name }));

  return [...themes, ...fullDecks, ...layouts];
}

function findMentionedNames(prompt: string, names: string[]): string[] {
  const lowerPrompt = prompt.toLowerCase();
  return names.filter((name) => hasNonNegatedMention(lowerPrompt, name.toLowerCase()));
}

function hasNonNegatedMention(text: string, name: string): boolean {
  let index = text.indexOf(name);
  while (index !== -1) {
    const prefix = text.slice(Math.max(0, index - 10), index);
    if (!/(不要|不用|避免|排除|禁用|不使用|别用)\s*$/.test(prefix)) {
      return true;
    }
    index = text.indexOf(name, index + name.length);
  }

  return false;
}

function formatResourceRequirements(requirements: ResourceRequirement[]): string {
  return requirements
    .map((requirement) => `${resourceKindLabels[requirement.kind]} ${requirement.name}`)
    .join('、');
}

function resourceExistsInHtml(lowerHtml: string, name: string): boolean {
  const lowerName = name.toLowerCase();
  return [
    lowerName,
    lowerName.replace(/-/g, '_'),
    lowerName.replace(/-/g, ' '),
  ].some((marker) => lowerHtml.includes(marker));
}

function hasAnimationMarker(html: string): boolean {
  return /(data-anim|data-fx|anim-|fx-|animation\s*:|animation-delay)/i.test(html);
}

function requiresEverySlideAnimation(prompt: string): boolean {
  return /(每\s*一?\s*页|每页)/.test(prompt) && /动画|动效|animation/i.test(prompt);
}

function collectSlides(document: Document | null, html: string): HTMLElement[] {
  if (document) {
    const sectionSlides = Array.from(document.querySelectorAll<HTMLElement>('section.slide'));
    if (sectionSlides.length) {
      return sectionSlides;
    }

    const dataSlides = Array.from(document.querySelectorAll<HTMLElement>('[data-slide-id]'));
    if (dataSlides.length) {
      return dataSlides;
    }
  }

  return matchSlideSections(html).map((outerHTML) => ({ outerHTML }) as HTMLElement);
}

function matchSlideSections(html: string): string[] {
  const matches = html.match(/<section\b[^>]*(?:class=["'][^"']*\bslide\b[^"']*["']|data-slide-id=)[\s\S]*?<\/section>/gi);
  return matches ?? [];
}

function parseHtmlDocument(html: string): Document | null {
  if (typeof DOMParser === 'undefined') {
    return null;
  }

  try {
    return new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return null;
  }
}

function hasAttributeValue(lowerHtml: string, attributeName: string, expectedValue: string): boolean {
  const safeAttributeName = escapeRegExp(attributeName);
  const safeExpectedValue = escapeRegExp(expectedValue);
  const pattern = new RegExp(`${safeAttributeName}\\s*=\\s*(["'])?${safeExpectedValue}(?:\\1|\\s|>)`, 'i');
  return pattern.test(lowerHtml);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(text: string): string {
  return text.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

function resolveGateStatus(checks: PptQualityGateCheck[]): PptQualityGateStatus {
  if (checks.some((check) => check.status === 'fail')) {
    return 'fail';
  }
  if (checks.some((check) => check.status === 'warning')) {
    return 'warning';
  }
  return 'pass';
}

function buildGateSummary(status: PptQualityGateStatus, checks: PptQualityGateCheck[]): string {
  const failedCount = checks.filter((check) => check.status === 'fail').length;
  const warningCount = checks.filter((check) => check.status === 'warning').length;

  if (status === 'fail') {
    return `门禁未通过：发现 ${failedCount} 项硬性问题，建议调整提示词或重新生成后再导入。`;
  }

  if (status === 'warning') {
    return `门禁需复核：发现 ${warningCount} 项不确定或轻微偏差，建议导入前人工确认。`;
  }

  return '门禁通过：候选结构和明确提示词约束已匹配。';
}
