import type { MermaidMarkdownBlock } from '../services/mermaidService';

export const computeMarkdownBlockScrollTops = (
  code: string,
  blocks: MermaidMarkdownBlock[],
  lineHeight: number,
  padding: number
): number[] => {
  if (!code || blocks.length === 0) return [];
  const scrollTops: number[] = [];
  let line = 0;
  let pos = 0;
  for (const block of blocks) {
    const target = Math.max(0, Math.min(block.start, code.length));
    for (let i = pos; i < target; i += 1) {
      if (code[i] === '\n') line += 1;
    }
    pos = target;
    const lineTop = line * lineHeight;
    scrollTops.push(Math.max(0, lineTop - padding));
  }
  return scrollTops;
};

export const resolveActiveMarkdownBlockIndex = (
  offsets: number[],
  scrollTop: number,
  threshold = 1
): number | null => {
  if (!offsets.length) return null;
  let activeIndex = 0;
  for (let i = 0; i < offsets.length; i += 1) {
    const offset = offsets[i];
    if (typeof offset !== 'number') continue;
    if (offset <= scrollTop + threshold) {
      activeIndex = i;
    } else {
      break;
    }
  }
  return activeIndex;
};
