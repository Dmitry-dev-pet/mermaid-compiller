import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { EditorTab } from '../../types';

type UseEditorTabsArgs = {
  activeTab: EditorTab;
  onActiveTabChange: (tab: EditorTab) => void;
  onChange: (code: string) => void;
  mermaidCode: string;
  editorValueRef: MutableRefObject<string>;
};

export const useEditorTabs = ({
  activeTab,
  onActiveTabChange,
  onChange,
  mermaidCode,
  editorValueRef,
}: UseEditorTabsArgs) => {
  const lastNonBuildTabRef = useRef<EditorTab>('code');

  useEffect(() => {
    if (activeTab !== 'build_docs') {
      lastNonBuildTabRef.current = activeTab;
    }
  }, [activeTab]);

  const handleActiveTabChange = useCallback((tab: EditorTab) => {
    const pageScrollTop = window.scrollY;
    if (activeTab === 'code' && tab !== 'code' && editorValueRef.current !== mermaidCode) {
      onChange(editorValueRef.current);
    }
    if (tab === 'build_docs' && activeTab === 'build_docs') {
      onActiveTabChange(lastNonBuildTabRef.current || 'code');
      return;
    }
    if (activeTab === 'build_docs' && tab === 'markdown_mermaid') {
      return;
    }
    if (tab !== 'build_docs') {
      lastNonBuildTabRef.current = tab;
    }
    onActiveTabChange(tab);
    if (pageScrollTop > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: pageScrollTop });
      });
    }
  }, [activeTab, editorValueRef, mermaidCode, onActiveTabChange, onChange]);

  return { handleActiveTabChange };
};
