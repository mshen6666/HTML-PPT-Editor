export type EmbeddedHtmlPptAssetLoader = (assetPath: string) => Promise<string | null | undefined>;

const HTML_PPT_CDN_THEME_BASE = 'https://cdn.jsdelivr.net/gh/lewislulu/html-ppt-skill@main/assets/themes/';
const EMBEDDED_SKILL_MARKER = 'embedded-skills/html-ppt/';

export async function inlineEmbeddedHtmlPptAssets(
  html: string,
  loadAsset: EmbeddedHtmlPptAssetLoader,
): Promise<string> {
  let nextHtml = await replaceAsync(html, /<link\b[^>]*>/gi, async (tag) => {
    const rel = readHtmlAttribute(tag, 'rel');
    const href = readHtmlAttribute(tag, 'href');
    if (!rel?.split(/\s+/).some((value) => value.toLowerCase() === 'stylesheet') || !href) {
      return tag;
    }

    const assetPath = resolveEmbeddedHtmlPptAssetPath(href, {
      isThemeLink: readHtmlAttribute(tag, 'id') === 'theme-link',
    });
    if (!assetPath?.endsWith('.css')) {
      return tag;
    }

    const cssText = await loadAsset(assetPath);
    if (!cssText || !isInlineableTextAsset(cssText, 'style')) {
      return tag;
    }

    return buildStyleTag({
      id: readHtmlAttribute(tag, 'id'),
      media: readHtmlAttribute(tag, 'media'),
      source: href,
      cssText,
    });
  });

  nextHtml = await replaceAsync(nextHtml, /<script\b[^>]*\bsrc=(["'])[^"']+\1[^>]*>\s*<\/script>/gi, async (tag) => {
    const src = readHtmlAttribute(tag, 'src');
    if (!src) {
      return tag;
    }

    const assetPath = resolveEmbeddedHtmlPptAssetPath(src);
    if (!assetPath?.endsWith('.js')) {
      return tag;
    }

    const scriptText = await loadAsset(assetPath);
    if (!scriptText || !isInlineableTextAsset(scriptText, 'script')) {
      return tag;
    }

    return buildScriptTag({
      attrs: copyScriptAttributesWithoutSrc(tag),
      source: src,
      scriptText,
    });
  });

  return rewriteEmbeddedThemeBase(nextHtml);
}

export function resolveEmbeddedHtmlPptAssetPath(
  rawUrl: string,
  options: { isThemeLink?: boolean } = {},
): string | null {
  const normalizedUrl = rawUrl
    .trim()
    .replace(/\\/g, '/')
    .replace(/[?#].*$/, '');
  if (!normalizedUrl || /^(data:|blob:|javascript:|about:)/i.test(normalizedUrl)) {
    return null;
  }

  const markerIndex = normalizedUrl.indexOf(EMBEDDED_SKILL_MARKER);
  if (markerIndex >= 0) {
    return normalizeAssetPath(normalizedUrl.slice(markerIndex + EMBEDDED_SKILL_MARKER.length));
  }

  const appPathMatch = normalizedUrl.match(/^\/?app\/ppt-server\/embedded-skills\/html-ppt\/(.+)$/i)
    ?? normalizedUrl.match(/^\/?ppt-server\/embedded-skills\/html-ppt\/(.+)$/i);
  if (appPathMatch?.[1]) {
    return normalizeAssetPath(appPathMatch[1]);
  }

  const localAssetMatch = normalizedUrl.match(/^(?:\.\/|\/)?assets\/(.+)$/i);
  if (localAssetMatch?.[1]) {
    return normalizeAssetPath(`assets/${localAssetMatch[1]}`);
  }

  if (options.isThemeLink) {
    const themeMatch = normalizedUrl.match(/^(?:\.\/|\/)?themes\/([^/]+\.css)$/i);
    if (themeMatch?.[1]) {
      return normalizeAssetPath(`assets/themes/${themeMatch[1]}`);
    }
  }

  return null;
}

function normalizeAssetPath(value: string): string | null {
  const normalized = value.replace(/^\/+/, '').replace(/\/+/g, '/');
  if (!normalized.startsWith('assets/') || normalized.includes('..')) {
    return null;
  }
  return normalized;
}

async function replaceAsync(
  value: string,
  pattern: RegExp,
  replacer: (match: string) => Promise<string>,
): Promise<string> {
  const matches = Array.from(value.matchAll(pattern));
  if (!matches.length) {
    return value;
  }

  const replacements = await Promise.all(matches.map((match) => replacer(match[0])));
  let index = 0;
  return value.replace(pattern, () => replacements[index++] ?? '');
}

function readHtmlAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tag.match(pattern);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function buildStyleTag(args: {
  id: string | null;
  media: string | null;
  source: string;
  cssText: string;
}): string {
  const attrs = [
    args.id ? `id="${escapeHtmlAttribute(args.id)}"` : null,
    args.media ? `media="${escapeHtmlAttribute(args.media)}"` : null,
    `data-export-inline-source="${escapeHtmlAttribute(args.source)}"`,
  ].filter(Boolean).join(' ');
  return `<style ${attrs}>${args.cssText}</style>`;
}

function buildScriptTag(args: {
  attrs: string;
  source: string;
  scriptText: string;
}): string {
  const attrs = [
    args.attrs,
    `data-export-inline-source="${escapeHtmlAttribute(args.source)}"`,
  ].filter(Boolean).join(' ');
  return `<script ${attrs}>${args.scriptText}</script>`;
}

function copyScriptAttributesWithoutSrc(tag: string): string {
  const attrs = tag
    .replace(/^<script\b/i, '')
    .replace(/>\s*<\/script>$/i, '')
    .trim();

  return attrs
    .replace(/\s*\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '')
    .trim();
}

function rewriteEmbeddedThemeBase(html: string): string {
  return html.replace(
    /\bdata-theme-base=(["'])[^"']*embedded-skills\/html-ppt\/assets\/themes\/?\1/gi,
    `data-theme-base="${HTML_PPT_CDN_THEME_BASE}"`,
  );
}

function isInlineableTextAsset(text: string, kind: 'style' | 'script'): boolean {
  const trimmed = text.trimStart().toLowerCase();
  if (
    trimmed.startsWith('<!doctype')
    || trimmed.startsWith('<html')
    || trimmed.startsWith('<head')
    || trimmed.startsWith('<body')
  ) {
    return false;
  }

  return kind === 'style'
    ? !trimmed.startsWith('<script')
    : !trimmed.startsWith('<style');
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
