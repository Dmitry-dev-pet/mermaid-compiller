const normalizeColorToken = (raw: string): string | null => {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const lowered = value.toLowerCase();
  if (lowered === 'none' || lowered === 'transparent') return null;
  return value;
};

export const extractMermaidSvgBackgroundColor = (svgMarkup: string): string | null => {
  if (!svgMarkup || !svgMarkup.includes('<svg')) return null;

  // Prefer explicit background rect fills.
  const rectFillMatch =
    svgMarkup.match(/<rect[^>]*class=["']background["'][^>]*fill=["']([^"']+)["'][^>]*>/i)
    ?? svgMarkup.match(/<rect[^>]*id=["']background["'][^>]*fill=["']([^"']+)["'][^>]*>/i);
  if (rectFillMatch?.[1]) return normalizeColorToken(rectFillMatch[1]);

  // Mermaid often uses a `.background { fill: ... }` CSS rule.
  const styleFillMatch = svgMarkup.match(/\.background\s*\{\s*fill\s*:\s*([^;}\n]+)\s*;?/i);
  if (styleFillMatch?.[1]) return normalizeColorToken(styleFillMatch[1]);

  // Fallback: any rect with class background, without fill but with inline style.
  const rectStyleMatch = svgMarkup.match(
    /<rect[^>]*class=["']background["'][^>]*style=["'][^"']*fill\s*:\s*([^;'"\\n]+)[^"']*["'][^>]*>/i
  );
  if (rectStyleMatch?.[1]) return normalizeColorToken(rectStyleMatch[1]);

  return null;
};

