import { useCallback, useMemo } from 'react';
import MarkdownIt from 'markdown-it';
import { MARKDOWN_CALLOUTS } from '../../utils/markdownCallouts';

const applyMarkdownCallouts = (mount: HTMLElement) => {
  for (const type of MARKDOWN_CALLOUTS) {
    const blocks = Array.from(mount.querySelectorAll(`pre > code.language-${type.key}`));

    for (const block of blocks) {
      const text = (block.textContent ?? '').trim();
      if (!text) continue;
      const pre = block.parentElement;
      if (!pre || !pre.parentElement) continue;
      const wrapper = document.createElement('div');
      wrapper.className = `markdown-callout markdown-callout-${type.key}`;
      const title = document.createElement('div');
      title.className = 'markdown-callout-title';
      title.textContent = type.title;
      const body = document.createElement('div');
      body.className = 'markdown-callout-body';
      body.textContent = text;
      wrapper.appendChild(title);
      wrapper.appendChild(body);
      pre.replaceWith(wrapper);
    }
  }
};

export const useMarkdownPreview = (
  markdownSource: string,
  isMarkdownMode: boolean,
  isMarkdownMermaidMode: boolean,
  isBuildDocsMode: boolean
) => {
  const markdownRenderer = useMemo(
    () => new MarkdownIt({ html: false, linkify: true, typographer: false }),
    []
  );

  const markdownHtml = useMemo(() => {
    if (isBuildDocsMode || isMarkdownMermaidMode || !isMarkdownMode) return '';
    return markdownRenderer.render(markdownSource);
  }, [isBuildDocsMode, isMarkdownMermaidMode, isMarkdownMode, markdownRenderer, markdownSource]);

  const renderMarkdown = useCallback(
    (mount: HTMLElement) => {
      if (!isMarkdownMode) return;
      mount.innerHTML = markdownHtml;
      applyMarkdownCallouts(mount);
    },
    [isMarkdownMode, markdownHtml]
  );

  return {
    markdownHtml,
    renderMarkdown,
    markdownRenderer,
  };
};
