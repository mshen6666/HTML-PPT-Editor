import { inlineEmbeddedHtmlPptAssets } from './embeddedAssets';

const HTML_PPT_CDN_ASSET_BASE = 'https://cdn.jsdelivr.net/gh/lewislulu/html-ppt-skill@main/';

type SharedCssResponse = {
  baseCSS?: string;
  fontsCSS?: string;
  animationsCSS?: string;
  runtimeJS?: string;
};

type ThemeCssResponse = {
  themeMap?: Record<string, string>;
};

let sharedCssPromise: Promise<SharedCssResponse> | null = null;
const themeCssPromises = new Map<string, Promise<string | null>>();

export function inlineEmbeddedHtmlPptAssetsForBrowser(html: string): Promise<string> {
  return inlineEmbeddedHtmlPptAssets(html, loadBrowserEmbeddedHtmlPptAsset);
}

export async function loadBrowserEmbeddedHtmlPptAsset(assetPath: string): Promise<string | null> {
  if (assetPath === 'assets/fonts.css') {
    return (await loadSharedCss()).fontsCSS ?? null;
  }
  if (assetPath === 'assets/base.css') {
    return (await loadSharedCss()).baseCSS ?? null;
  }
  if (assetPath === 'assets/animations/animations.css') {
    return (await loadSharedCss()).animationsCSS ?? null;
  }

  const themeMatch = assetPath.match(/^assets\/themes\/([^/]+)\.css$/);
  if (themeMatch?.[1]) {
    return loadThemeCss(themeMatch[1]);
  }

  if (assetPath === 'assets/runtime.js') {
    return (await loadSharedCss()).runtimeJS
      ?? fetchText(`${HTML_PPT_CDN_ASSET_BASE}${assetPath}`);
  }

  return null;
}

function loadSharedCss(): Promise<SharedCssResponse> {
  sharedCssPromise ??= fetchJson<SharedCssResponse>('/api/agent/html-ppt/guide-preview-shared-css')
    .catch(() => ({}));
  return sharedCssPromise;
}

function loadThemeCss(themeName: string): Promise<string | null> {
  const key = themeName.trim();
  if (!key) {
    return Promise.resolve(null);
  }

  const existing = themeCssPromises.get(key);
  if (existing) {
    return existing;
  }

  const promise = fetchJson<ThemeCssResponse>(
    `/api/agent/html-ppt/css/themes-lite?names=${encodeURIComponent(key)}`,
  )
    .then((payload) => payload.themeMap?.[key] ?? null)
    .catch(() => null);
  themeCssPromises.set(key, promise);
  return promise;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return response.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    const trimmed = text.trimStart().toLowerCase();
    if (
      trimmed.startsWith('<!doctype')
      || trimmed.startsWith('<html')
      || trimmed.startsWith('<head')
      || trimmed.startsWith('<body')
    ) {
      return null;
    }
    return text;
  } catch {
    return null;
  }
}
