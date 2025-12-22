import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiagramType, DocsMode } from '../../types';
import { fetchDocsEntries, formatDocsContext, getDocsPaths } from '../../services/docsContextService';
import type { DocsEntry } from '../../services/docsContextService';
import { safeParse } from '../../utils';

type DocsSelectionState = {
  mode: DocsMode;
  selections: Record<DocsMode, Record<string, boolean>>;
  activePaths: Record<DocsMode, string>;
  systemPromptRawByMode: Record<DocsMode, boolean>;
};

const DOCS_MODES: DocsMode[] = ['chat', 'build', 'analyze', 'fix'];
const DEFAULT_DOCS_STATE: DocsSelectionState = {
  mode: 'build',
  selections: {
    chat: {},
    build: {},
    analyze: {},
    fix: {},
  },
  activePaths: {
    chat: '',
    build: '',
    analyze: '',
    fix: '',
  },
  systemPromptRawByMode: {
    chat: false,
    build: false,
    analyze: false,
    fix: false,
  },
};

export const useBuildDocs = (diagramType: DiagramType) => {
  const [buildDocsEntries, setBuildDocsEntries] = useState<DocsEntry[]>([]);
  const [buildDocsType, setBuildDocsType] = useState<DiagramType | null>(null);
  const [docsState, setDocsState] = useState<DocsSelectionState>(() => {
    const parsed = safeParse('dc_docs_selection_v2', DEFAULT_DOCS_STATE);
    return {
      ...DEFAULT_DOCS_STATE,
      ...parsed,
      selections: {
        ...DEFAULT_DOCS_STATE.selections,
        ...parsed.selections,
      },
      activePaths: {
        ...DEFAULT_DOCS_STATE.activePaths,
        ...parsed.activePaths,
      },
      systemPromptRawByMode: {
        ...DEFAULT_DOCS_STATE.systemPromptRawByMode,
        ...parsed.systemPromptRawByMode,
      },
    };
  });
  const buildDocsRequestRef = useRef(0);

  const loadBuildDocsEntries = useCallback(async (type: DiagramType) => {
    const requestId = ++buildDocsRequestRef.current;
    let entries = await fetchDocsEntries(type);
    if (requestId !== buildDocsRequestRef.current) {
      return { entries: [], selections: DEFAULT_DOCS_STATE.selections, activePaths: DEFAULT_DOCS_STATE.activePaths };
    }
    if (!entries.length) {
      entries = getDocsPaths(type).map(({ path, isOptional }) => ({ path, text: '', isOptional }));
    }

    const nextSelections: DocsSelectionState['selections'] = { ...docsState.selections };
    const nextActivePaths: DocsSelectionState['activePaths'] = { ...docsState.activePaths };

    DOCS_MODES.forEach((mode) => {
      const modeSelection = { ...nextSelections[mode] };
      entries.forEach((entry) => {
        if (modeSelection[entry.path] === undefined) {
          modeSelection[entry.path] = true;
        }
      });
      nextSelections[mode] = modeSelection;
      const prevPath = nextActivePaths[mode];
      if (!prevPath || !entries.some((entry) => entry.path === prevPath)) {
        nextActivePaths[mode] = entries[0]?.path ?? '';
      }
    });

    setBuildDocsEntries(entries);
    setBuildDocsType(type);
    setDocsState((prev) => ({
      ...prev,
      selections: nextSelections,
      activePaths: nextActivePaths,
    }));
    return { entries, selections: nextSelections, activePaths: nextActivePaths };
  }, [docsState.activePaths, docsState.selections]);

  const ensureBuildDocsEntries = useCallback(async () => {
    if (buildDocsType === diagramType) {
      return { entries: buildDocsEntries, selections: docsState.selections, activePaths: docsState.activePaths };
    }
    return await loadBuildDocsEntries(diagramType);
  }, [buildDocsEntries, buildDocsType, diagramType, docsState.activePaths, docsState.selections, loadBuildDocsEntries]);

  const getDocsContext = useCallback(async (mode: DocsMode) => {
    const { entries, selections } = await ensureBuildDocsEntries();
    const selection = selections[mode] ?? {};
    const selected = entries.filter((entry) => selection[entry.path] !== false);
    return formatDocsContext(selected);
  }, [ensureBuildDocsEntries]);

  const toggleBuildDocSelection = useCallback((path: string, isIncluded: boolean) => {
    setDocsState((prev) => {
      const mode = prev.mode;
      const nextSelection = { ...prev.selections[mode], [path]: isIncluded };
      return {
        ...prev,
        selections: {
          ...prev.selections,
          [mode]: nextSelection,
        },
      };
    });
  }, []);

  const setBuildDocsActivePath = useCallback((path: string) => {
    setDocsState((prev) => ({
      ...prev,
      activePaths: {
        ...prev.activePaths,
        [prev.mode]: path,
      },
    }));
  }, []);

  const setDocsMode = useCallback((mode: DocsMode) => {
    setDocsState((prev) => ({ ...prev, mode }));
  }, []);

  const buildDocsSelectionKey = useMemo(() => {
    if (!buildDocsEntries.length) return '';
    return DOCS_MODES
      .map((mode) => {
        const selection = docsState.selections[mode] ?? {};
        const key = buildDocsEntries
          .map((entry) => `${entry.path}:${selection[entry.path] !== false ? '1' : '0'}`)
          .join('|');
        return `${mode}:${key}`;
      })
      .join('::');
  }, [buildDocsEntries, docsState.selections]);

  const setSystemPromptRaw = useCallback((mode: DocsMode, isRaw: boolean) => {
    setDocsState((prev) => ({
      ...prev,
      systemPromptRawByMode: {
        ...prev.systemPromptRawByMode,
        [mode]: isRaw,
      },
    }));
  }, []);

  const setBuildDocSelectionForMode = useCallback((mode: DocsMode, path: string, isIncluded: boolean) => {
    setDocsState((prev) => ({
      ...prev,
      selections: {
        ...prev.selections,
        [mode]: {
          ...prev.selections[mode],
          [path]: isIncluded,
        },
      },
    }));
  }, []);

  useEffect(() => {
    if (buildDocsType === diagramType) return;
    void loadBuildDocsEntries(diagramType);
  }, [buildDocsType, diagramType, loadBuildDocsEntries]);

  useEffect(() => {
    localStorage.setItem('dc_docs_selection_v2', JSON.stringify(docsState));
  }, [docsState]);

  return {
    buildDocsEntries,
    buildDocsSelection: docsState.selections[docsState.mode] ?? {},
    buildDocsSelectionKey,
    buildDocsActivePath: docsState.activePaths[docsState.mode] ?? '',
    setBuildDocsActivePath,
    docsMode: docsState.mode,
    setDocsMode,
    systemPromptRawByMode: docsState.systemPromptRawByMode,
    setSystemPromptRaw,
    buildDocsSelectionsByMode: docsState.selections,
    setBuildDocSelectionForMode,
    ensureBuildDocsEntries,
    getDocsContext,
    loadBuildDocsEntries,
    toggleBuildDocSelection,
  };
};
