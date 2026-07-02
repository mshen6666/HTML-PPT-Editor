const FALLBACK_SCALE = 1;

export const DEFAULT_CANVAS_WIDTH = 1280;
export const DEFAULT_CANVAS_HEIGHT = 720;
export const XHS_CANVAS_WIDTH = 810;
export const XHS_CANVAS_HEIGHT = 1080;

type CanvasDimensions = {
  width: number;
  height: number;
};

type PreviewScaleArgs = {
  frameWidth: number;
  frameHeight: number;
  viewportWidth: number;
  viewportHeight: number;
};

export type PreviewFitMode = 'adaptive' | 'native';

type PreviewStyle = Record<string, string>;

type RuntimePreviewLayoutArgs = PreviewScaleArgs & {
  fitMode: PreviewFitMode;
};

type RuntimePreviewLayout = {
  viewportStyle: PreviewStyle;
  stageShellStyle: PreviewStyle;
  iframeStyle: PreviewStyle;
  previewScale: number;
};

type ThumbnailFrameLayoutArgs = {
  availableWidth: number;
  viewportWidth: number;
  viewportHeight: number;
};

type ThumbnailFrameLayout = {
  shellStyle: PreviewStyle;
  iframeStyle: PreviewStyle;
  previewScale: number;
};

export function calculatePreviewScale({
  frameWidth,
  frameHeight,
  viewportWidth,
  viewportHeight,
}: PreviewScaleArgs): number {
  if (frameWidth <= 0 || frameHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return FALLBACK_SCALE;
  }

  return Math.min(frameWidth / viewportWidth, frameHeight / viewportHeight);
}

export function buildRuntimePreviewLayout({
  frameWidth,
  frameHeight,
  viewportWidth,
  viewportHeight,
  fitMode,
}: RuntimePreviewLayoutArgs): RuntimePreviewLayout {
  const adaptiveScale = calculatePreviewScale({
    frameWidth,
    frameHeight,
    viewportWidth,
    viewportHeight,
  });
  const previewScale = fitMode === 'adaptive' ? adaptiveScale : FALLBACK_SCALE;
  const scaledWidth = viewportWidth * previewScale;
  const scaledHeight = viewportHeight * previewScale;
  const iframeStyle: PreviewStyle = {
    width: `${viewportWidth}px`,
    height: `${viewportHeight}px`,
  };

  if (fitMode === 'adaptive') {
    iframeStyle.transform = `scale(${previewScale})`;
  }

  const viewportStyle: PreviewStyle = {
    overflow: fitMode === 'adaptive' ? 'hidden' : 'auto',
    alignItems: 'flex-start',
    justifyContent: fitMode === 'adaptive' ? 'center' : 'flex-start',
  };

  if (fitMode === 'adaptive') {
    viewportStyle.width = `${scaledWidth}px`;
    viewportStyle.height = `${scaledHeight}px`;
  }

  return {
    viewportStyle,
    stageShellStyle: {
      width: `${scaledWidth}px`,
      height: `${scaledHeight}px`,
      flexShrink: '0',
    },
    iframeStyle,
    previewScale,
  };
}

export function buildThumbnailFrameLayout({
  availableWidth,
  viewportWidth,
  viewportHeight,
}: ThumbnailFrameLayoutArgs): ThumbnailFrameLayout {
  const previewScale = calculatePreviewScale({
    frameWidth: availableWidth,
    frameHeight: Number.MAX_SAFE_INTEGER,
    viewportWidth,
    viewportHeight,
  });
  const scaledWidth = viewportWidth * previewScale;
  const scaledHeight = viewportHeight * previewScale;

  return {
    shellStyle: {
      width: `${formatPixelValue(scaledWidth)}px`,
      height: `${formatPixelValue(scaledHeight)}px`,
    },
    iframeStyle: {
      width: `${viewportWidth}px`,
      height: `${viewportHeight}px`,
      transform: `scale(${previewScale})`,
    },
    previewScale,
  };
}

export function resolveCanvasDimensions(document: Document): CanvasDimensions {
  const root = document.documentElement;
  const explicitWidth = parseCanvasDimension(root.getAttribute('data-fs-canvas-width'));
  const explicitHeight = parseCanvasDimension(root.getAttribute('data-fs-canvas-height'));
  if (explicitWidth && explicitHeight) {
    return {
      width: explicitWidth,
      height: explicitHeight,
    };
  }

  if (looksLikeXhsDeck(document)) {
    return {
      width: XHS_CANVAS_WIDTH,
      height: XHS_CANVAS_HEIGHT,
    };
  }

  return {
    width: DEFAULT_CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
  };
}

export function applyCanvasDimensions(document: Document, dimensions: CanvasDimensions): void {
  document.documentElement.setAttribute('data-fs-canvas-width', String(dimensions.width));
  document.documentElement.setAttribute('data-fs-canvas-height', String(dimensions.height));
}

function parseCanvasDimension(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatPixelValue(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2).replace(/\.?0+$/, '');
}

function looksLikeXhsDeck(document: Document): boolean {
  const bodyClassName = document.body?.className ?? '';
  if (/\bxhs\b|tpl-xhs-|xhs-/.test(bodyClassName)) {
    return true;
  }

  const styles = Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n');

  return /aspect-ratio\s*:\s*3\s*\/\s*4/i.test(styles)
    || /width\s*:\s*810px\s*;\s*height\s*:\s*1080px/i.test(styles);
}
