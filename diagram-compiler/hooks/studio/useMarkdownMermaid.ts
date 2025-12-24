import { useEffect, useMemo, useState } from 'react';
import type { EditorTab, MermaidState } from '../../types';
import { extractMermaidBlocksFromMarkdown, validateMermaidDiagramCode } from '../../services/mermaidService';

type MarkdownMermaidDiagnostics = Array<Pick<MermaidState, 'isValid' | 'errorMessage' | 'errorLine' | 'status'>>;

type UseMarkdownMermaidArgs = {
  code: string;
  editorTab: EditorTab;
  setEditorTab: (tab: EditorTab) => void;
};

export const useMarkdownMermaid = ({ code, editorTab, setEditorTab }: UseMarkdownMermaidArgs) => {
  const [markdownMermaidDiagnostics, setMarkdownMermaidDiagnostics] = useState<MarkdownMermaidDiagnostics>([]);
  const [markdownMermaidActiveIndex, setMarkdownMermaidActiveIndex] = useState(0);

  const markdownMermaidBlocks = useMemo(() => {
    return extractMermaidBlocksFromMarkdown(code);
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    const validateBlocks = async () => {
      if (!markdownMermaidBlocks.length) {
        if (!cancelled) setMarkdownMermaidDiagnostics([]);
        return;
      }
      const results = await Promise.all(
        markdownMermaidBlocks.map((block) => validateMermaidDiagramCode(block.code))
      );
      if (cancelled) return;
      setMarkdownMermaidDiagnostics(results);
    };
    void validateBlocks();
    return () => {
      cancelled = true;
    };
  }, [markdownMermaidBlocks]);

  useEffect(() => {
    if (!markdownMermaidBlocks.length) {
      if (markdownMermaidActiveIndex !== 0) {
        queueMicrotask(() => {
          setMarkdownMermaidActiveIndex(0);
        });
      }
      if (editorTab === 'markdown_mermaid') {
        queueMicrotask(() => {
          setEditorTab('code');
        });
      }
      return;
    }
    if (markdownMermaidActiveIndex >= markdownMermaidBlocks.length) {
      queueMicrotask(() => {
        setMarkdownMermaidActiveIndex(0);
      });
    }
  }, [editorTab, markdownMermaidActiveIndex, markdownMermaidBlocks.length, setEditorTab]);

  return {
    markdownMermaidBlocks,
    markdownMermaidDiagnostics,
    markdownMermaidActiveIndex,
    setMarkdownMermaidActiveIndex,
  };
};
