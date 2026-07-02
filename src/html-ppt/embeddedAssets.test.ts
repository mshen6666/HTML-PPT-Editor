import { describe, expect, it, vi } from 'vitest';

import {
  inlineEmbeddedHtmlPptAssets,
  resolveEmbeddedHtmlPptAssetPath,
  type EmbeddedHtmlPptAssetLoader,
} from './embeddedAssets';

describe('embedded html-ppt assets', () => {
  it('resolves local and embedded html-ppt resource paths to asset paths', () => {
    expect(resolveEmbeddedHtmlPptAssetPath('/app/ppt-server/embedded-skills/html-ppt/assets/base.css')).toBe('assets/base.css');
    expect(resolveEmbeddedHtmlPptAssetPath('ppt-server/embedded-skills/html-ppt/assets/runtime.js')).toBe('assets/runtime.js');
    expect(resolveEmbeddedHtmlPptAssetPath('./assets/animations/animations.css')).toBe('assets/animations/animations.css');
    expect(resolveEmbeddedHtmlPptAssetPath('./themes/corporate-clean.css', { isThemeLink: true })).toBe('assets/themes/corporate-clean.css');
    expect(resolveEmbeddedHtmlPptAssetPath('../secrets.css')).toBeNull();
  });

  it('inlines css and runtime tags while keeping unresolved assets unchanged', async () => {
    const loadAsset = vi.fn<EmbeddedHtmlPptAssetLoader>(async (assetPath) => {
      const assets: Record<string, string> = {
        'assets/fonts.css': '/* html-ppt :: shared webfonts */',
        'assets/base.css': '/* html-ppt :: base.css */',
        'assets/themes/corporate-clean.css': '/* theme: corporate-clean */',
        'assets/runtime.js': '/* html-ppt :: runtime.js */',
      };
      return assets[assetPath] ?? null;
    });

    const html = await inlineEmbeddedHtmlPptAssets(`<!doctype html>
<html data-fs-deck-profile="html-ppt">
  <head>
    <link rel="stylesheet" href="/app/ppt-server/embedded-skills/html-ppt/assets/fonts.css">
    <link rel="stylesheet" href="/app/ppt-server/embedded-skills/html-ppt/assets/base.css">
    <link rel="stylesheet" id="theme-link" href="./themes/corporate-clean.css">
    <link rel="stylesheet" href="/missing/custom.css">
  </head>
  <body data-theme-base="/app/ppt-server/embedded-skills/html-ppt/assets/themes/">
    <script src="/app/ppt-server/embedded-skills/html-ppt/assets/runtime.js"></script>
  </body>
</html>`, loadAsset);

    expect(loadAsset).toHaveBeenCalledWith('assets/fonts.css');
    expect(loadAsset).toHaveBeenCalledWith('assets/base.css');
    expect(loadAsset).toHaveBeenCalledWith('assets/themes/corporate-clean.css');
    expect(loadAsset).toHaveBeenCalledWith('assets/runtime.js');
    expect(html).toContain('<style data-export-inline-source="/app/ppt-server/embedded-skills/html-ppt/assets/base.css">/* html-ppt :: base.css */</style>');
    expect(html).toContain('<style id="theme-link" data-export-inline-source="./themes/corporate-clean.css">/* theme: corporate-clean */</style>');
    expect(html).toContain('<script data-export-inline-source="/app/ppt-server/embedded-skills/html-ppt/assets/runtime.js">/* html-ppt :: runtime.js */</script>');
    expect(html).toContain('href="/missing/custom.css"');
    expect(html).not.toContain('data-theme-base="/app/ppt-server/embedded-skills/html-ppt');
  });
});
