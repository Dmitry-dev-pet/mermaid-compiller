import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { EditorTab } from '../../types';

type UseStudioTabsOptions = {
  initialEditorTab?: EditorTab;
  initialBuildDocsScope?: 'notebook' | 'diagram';
};

export const useStudioTabs = (options: UseStudioTabsOptions = {}) => {
  const [editorTab, setEditorTab] = useState<EditorTab>(options.initialEditorTab ?? 'code');
  const [buildDocsScope, setBuildDocsScope] = useState<'notebook' | 'diagram'>(
    options.initialBuildDocsScope ?? 'notebook'
  );
  const prevEditorTabRef = useRef<EditorTab>(editorTab);
  const nextBuildDocsScopeRef = useRef<'notebook' | 'diagram' | null>(null);

  const setNextBuildDocsScope = useCallback((scope: 'notebook' | 'diagram' | null) => {
    if (!scope) {
      nextBuildDocsScopeRef.current = null;
      return;
    }
    if (editorTab === 'build_docs') {
      setBuildDocsScope(scope);
      return;
    }
    nextBuildDocsScopeRef.current = scope;
  }, [editorTab, setBuildDocsScope]);

  useLayoutEffect(() => {
    const prev = prevEditorTabRef.current;
    if (editorTab === 'build_docs' && prev !== 'build_docs') {
      const override = nextBuildDocsScopeRef.current;
      if (override) {
        setBuildDocsScope(override);
        nextBuildDocsScopeRef.current = null;
      } else {
        setBuildDocsScope(prev === 'markdown_mermaid' ? 'diagram' : 'notebook');
      }
    }
    prevEditorTabRef.current = editorTab;
  }, [editorTab]);

  return {
    editorTab,
    setEditorTab,
    buildDocsScope,
    setBuildDocsScope,
    setNextBuildDocsScope,
  };
};
