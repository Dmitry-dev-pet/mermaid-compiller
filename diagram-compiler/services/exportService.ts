type ExportViewBox = { x: number; y: number; width: number; height: number };

type DownloadDeps = {
  document?: Document;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  setTimeout?: (callback: () => void, ms: number) => unknown;
};

const MAX_CANVAS_DIMENSION = 8192;
const MAX_INLINE_IMAGES = 24;
const MAX_INLINE_IMAGE_BYTES = 5_000_000;
const INLINE_FETCH_TIMEOUT_MS = 12_000;

const parseViewBox = (value: string | null): ExportViewBox | null => {
  if (!value) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part));

  if (parts.length !== 4) return null;
  const [x, y, width, height] = parts;
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  if (!(width > 0 && height > 0)) return null;
  return { x, y, width, height };
};

const getExportViewBox = (svg: SVGSVGElement): ExportViewBox | null => {
  const viewBox = parseViewBox(svg.getAttribute('viewBox'));
  if (viewBox) return viewBox;

  try {
    const bbox = svg.getBBox();
    if (!(bbox.width > 0 && bbox.height > 0)) return null;
    return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
  } catch {
    return null;
  }
};

export const downloadBlob = (blob: Blob, filename: string, deps: DownloadDeps = {}) => {
  const doc = deps.document ?? globalThis.document;
  const createObjectURL = deps.createObjectURL ?? globalThis.URL?.createObjectURL;
  const revokeObjectURL = deps.revokeObjectURL ?? globalThis.URL?.revokeObjectURL;
  const setTimeoutFn = deps.setTimeout ?? globalThis.setTimeout;

  if (!doc) throw new Error('Document is not available');
  if (!createObjectURL) throw new Error('URL.createObjectURL is not available');
  if (!revokeObjectURL) throw new Error('URL.revokeObjectURL is not available');
  if (!setTimeoutFn) throw new Error('setTimeout is not available');

  const url = createObjectURL(blob);

  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';

  doc.body.appendChild(anchor);
  anchor.click();
  doc.body.removeChild(anchor);

  setTimeoutFn(() => {
    revokeObjectURL(url);
  }, 0);
};

const cloneSvgForExport = (
  svg: SVGSVGElement,
  options: { backgroundColor?: string } = {},
): { svg: SVGSVGElement; viewBox: ExportViewBox } => {
  const viewBox = getExportViewBox(svg);
  if (!viewBox) throw new Error('Cannot determine diagram bounds');

  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  clone.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
  clone.setAttribute('width', `${Math.ceil(viewBox.width)}`);
  clone.setAttribute('height', `${Math.ceil(viewBox.height)}`);

  if (options.backgroundColor) {
    const rect = globalThis.document?.createElementNS('http://www.w3.org/2000/svg', 'rect');
    if (rect) {
      rect.setAttribute('x', `${viewBox.x}`);
      rect.setAttribute('y', `${viewBox.y}`);
      rect.setAttribute('width', `${viewBox.width}`);
      rect.setAttribute('height', `${viewBox.height}`);
      rect.setAttribute('fill', options.backgroundColor);
      clone.insertBefore(rect, clone.firstChild);
    }
  }

  return { svg: clone, viewBox };
};

const serializeSvg = (svg: SVGSVGElement): string => {
  const serializer = new XMLSerializer();
  const markup = serializer.serializeToString(svg);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`;
};

const blobToDataUrl = async (blob: Blob): Promise<string> => {
  const reader = new FileReader();
  return await new Promise<string>((resolve, reject) => {
    reader.onerror = () => reject(new Error('Failed to read image blob'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(blob);
  });
};

const resolveImageUrl = (url: string): string => {
  try {
    return new URL(url, globalThis.location?.href).toString();
  } catch {
    return url;
  }
};

const isSkippableResourceUrl = (url: string): boolean => {
  const trimmed = url.trim();
  return (
    trimmed.length === 0 ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('javascript:')
  );
};

const extractCssUrls = (cssText: string): Array<{ raw: string; startIndex: number; endIndex: number }> => {
  const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  const matches: Array<{ raw: string; startIndex: number; endIndex: number }> = [];
  for (const match of cssText.matchAll(pattern)) {
    const raw = String(match[2] ?? '').trim();
    const index = match.index ?? -1;
    if (!raw || index < 0) continue;
    if (isSkippableResourceUrl(raw)) continue;
    matches.push({ raw, startIndex: index, endIndex: index + match[0].length });
  }
  return matches;
};

const inlineCssUrls = async (cssText: string) => {
  const matches = extractCssUrls(cssText);
  if (matches.length === 0) return cssText;

  const unique = Array.from(new Set(matches.map((m) => m.raw)));
  if (unique.length > MAX_INLINE_IMAGES) {
    throw new Error(`Too many embedded resources to export PNG (${unique.length}); export SVG instead`);
  }

  const replacements = new Map<string, string>();
  for (const rawUrl of unique) {
    const resolved = resolveImageUrl(rawUrl);
    const controller = new AbortController();
    const timer = globalThis.setTimeout?.(() => controller.abort(), INLINE_FETCH_TIMEOUT_MS);
    try {
      const response = await globalThis.fetch(resolved, { mode: 'cors', credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw new Error(`Failed to fetch embedded resource (${response.status})`);
      const blob = await response.blob();
      if (blob.size > MAX_INLINE_IMAGE_BYTES) throw new Error('Embedded resource is too large to inline for PNG export');
      const dataUrl = await blobToDataUrl(blob);
      replacements.set(rawUrl, dataUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot inline embedded resource for PNG export (${message}); export SVG instead`);
    } finally {
      if (timer) globalThis.clearTimeout?.(timer);
    }
  }

  let next = cssText;
  for (const [rawUrl, dataUrl] of replacements) {
    const escaped = rawUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    next = next.replace(new RegExp(`url\\(\\s*(['"]?)${escaped}\\1\\s*\\)`, 'g'), `url("${dataUrl}")`);
  }
  return next;
};

const inlineExternalImages = async (svg: SVGSVGElement) => {
  const fetchFn = globalThis.fetch;
  if (!fetchFn) return;

  const targets: Array<{ kind: 'svg'; element: SVGElement; attr: 'href' | 'xlink:href'; url: string } | { kind: 'html'; element: Element; attr: 'src'; url: string }> =
    [];

  const svgImages = Array.from(svg.querySelectorAll('image'));
  for (const image of svgImages) {
    const href = image.getAttribute('href') ?? image.getAttribute('xlink:href');
    if (!href) continue;
    const trimmed = href.trim();
    if (!trimmed) continue;
    if (isSkippableResourceUrl(trimmed)) continue;
    targets.push({ kind: 'svg', element: image, attr: image.hasAttribute('href') ? 'href' : 'xlink:href', url: resolveImageUrl(trimmed) });
  }

  const htmlImages = Array.from(svg.querySelectorAll('foreignObject img'));
  for (const img of htmlImages) {
    const src = img.getAttribute('src');
    if (!src) continue;
    const trimmed = src.trim();
    if (!trimmed) continue;
    if (isSkippableResourceUrl(trimmed)) continue;
    targets.push({ kind: 'html', element: img, attr: 'src', url: resolveImageUrl(trimmed) });
  }

  if (targets.length === 0) return;
  if (targets.length > MAX_INLINE_IMAGES) {
    throw new Error(`Too many embedded images to export PNG (${targets.length}); export SVG instead`);
  }

  for (const target of targets) {
    const controller = new AbortController();
    const timer = globalThis.setTimeout?.(() => controller.abort(), INLINE_FETCH_TIMEOUT_MS);
    try {
      const response = await fetchFn(target.url, { mode: 'cors', credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw new Error(`Failed to fetch embedded image (${response.status})`);
      const blob = await response.blob();
      if (blob.size > MAX_INLINE_IMAGE_BYTES) throw new Error('Embedded image is too large to inline for PNG export');
      const dataUrl = await blobToDataUrl(blob);
      if (target.kind === 'svg') {
        target.element.setAttribute(target.attr, dataUrl);
        target.element.setAttribute('href', dataUrl);
        target.element.setAttribute('xlink:href', dataUrl);
      } else {
        target.element.setAttribute(target.attr, dataUrl);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot inline embedded image for PNG export (${message}); export SVG instead`);
    } finally {
      if (timer) globalThis.clearTimeout?.(timer);
    }
  }
};

const inlineSvgCssResources = async (svg: SVGSVGElement) => {
  if (!globalThis.fetch) return;

  const elementsWithStyle = Array.from(svg.querySelectorAll<SVGElement>('[style*="url("]'));
  for (const element of elementsWithStyle) {
    const styleText = element.getAttribute('style');
    if (!styleText || !styleText.includes('url(')) continue;
    const nextStyle = await inlineCssUrls(styleText);
    if (nextStyle !== styleText) element.setAttribute('style', nextStyle);
  }

  const styleTags = Array.from(svg.querySelectorAll('style'));
  for (const tag of styleTags) {
    const text = tag.textContent ?? '';
    if (!text.includes('url(')) continue;
    const next = await inlineCssUrls(text);
    if (next !== text) tag.textContent = next;
  }
};

const hasExternalResourceRefs = (svg: SVGSVGElement): boolean => {
  const svgImages = Array.from(svg.querySelectorAll('image'));
  for (const image of svgImages) {
    const href = image.getAttribute('href') ?? image.getAttribute('xlink:href') ?? '';
    if (href && !isSkippableResourceUrl(href)) return true;
  }

  const htmlImages = Array.from(svg.querySelectorAll('foreignObject img'));
  for (const img of htmlImages) {
    const src = img.getAttribute('src') ?? '';
    if (src && !isSkippableResourceUrl(src)) return true;
  }

  const elementsWithStyle = Array.from(svg.querySelectorAll('[style*="url("]'));
  for (const element of elementsWithStyle) {
    const style = element.getAttribute('style') ?? '';
    if (extractCssUrls(style).length > 0) return true;
  }

  const styleTags = Array.from(svg.querySelectorAll('style'));
  for (const tag of styleTags) {
    const text = tag.textContent ?? '';
    if (extractCssUrls(text).length > 0) return true;
  }

  return false;
};

export const exportDiagramAsSvg = async (svg: SVGSVGElement, filenameBase = 'diagram') => {
  const { svg: clone } = cloneSvgForExport(svg);
  const svgText = serializeSvg(clone);

  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, `${filenameBase}.svg`);
};

export const exportDiagramAsPng = async (
  svg: SVGSVGElement,
  options: { filenameBase?: string; backgroundColor?: string; scale?: number } = {},
) => {
  const { filenameBase = 'diagram', backgroundColor, scale = 2 } = options;

  const { svg: clone, viewBox } = cloneSvgForExport(svg, { backgroundColor });
  await inlineExternalImages(clone);
  await inlineSvgCssResources(clone);
  if (hasExternalResourceRefs(clone)) {
    throw new Error('Diagram still references external resources; PNG export would be blocked. Export SVG instead.');
  }
  const svgText = serializeSvg(clone);

  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load SVG as an image'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    const desiredWidth = Math.max(1, Math.ceil(viewBox.width * scale));
    const desiredHeight = Math.max(1, Math.ceil(viewBox.height * scale));
    const desiredMax = Math.max(desiredWidth, desiredHeight);
    const shrinkRatio = desiredMax > MAX_CANVAS_DIMENSION ? MAX_CANVAS_DIMENSION / desiredMax : 1;
    canvas.width = Math.max(1, Math.floor(desiredWidth * shrinkRatio));
    canvas.height = Math.max(1, Math.floor(desiredHeight * shrinkRatio));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is not available');

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    if (backgroundColor) {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(img, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      try {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Failed to encode PNG'));
            return;
          }
          resolve(blob);
        }, 'image/png');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/tainted canvases?/i.test(message)) {
          const hasForeignObject = Boolean(clone.querySelector('foreignObject'));
          reject(
            new Error(
              hasForeignObject
                ? 'PNG export blocked by browser security (tainted canvas). This diagram uses HTML labels; export SVG instead.'
                : 'PNG export blocked by browser security (tainted canvas). The diagram likely embeds external resources; export SVG instead.',
            ),
          );
          return;
        }
        reject(error instanceof Error ? error : new Error(message));
      }
    });

    downloadBlob(pngBlob, `${filenameBase}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
};
