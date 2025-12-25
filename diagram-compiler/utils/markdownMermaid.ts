export const MERMAID_FENCE_REGEX = /```mermaid(?:-exa.mple)?[^\n]*\n[\s\S]*?\n```/gi;
export const MERMAID_BLOCK_PATTERN = /(```(?:mermaid|mermaid-exa.mple)[^\n]*\r?\n)([\s\S]*?)(```)/g;
export const MERMAID_CODE_BLOCK_SELECTOR =
  'pre > code.language-mermaid, pre > code.language-mermaid-example, pre > code[class^="language-mermaid-exa"]';

export const transformMarkdownMermaid = (
  code: string,
  handlers: { markdown: (value: string) => string; mermaid: (value: string) => string }
) => {
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  MERMAID_FENCE_REGEX.lastIndex = 0;
  while ((match = MERMAID_FENCE_REGEX.exec(code))) {
    const [block] = match;
    const matchIndex = match.index ?? 0;
    result += handlers.markdown(code.slice(lastIndex, matchIndex));

    const openFenceEnd = block.indexOf('\n') + 1;
    const closeFenceStart = block.lastIndexOf('\n```');
    if (openFenceEnd <= 0 || closeFenceStart < openFenceEnd) {
      result += handlers.markdown(block);
    } else {
      const openFence = block.slice(0, openFenceEnd);
      const mermaidBody = block.slice(openFenceEnd, closeFenceStart);
      const closeFence = block.slice(closeFenceStart);
      result += handlers.markdown(openFence);
      result += handlers.mermaid(mermaidBody);
      result += handlers.markdown(closeFence);
    }

    lastIndex = matchIndex + block.length;
  }

  if (lastIndex < code.length) {
    result += handlers.markdown(code.slice(lastIndex));
  }

  return result;
};
