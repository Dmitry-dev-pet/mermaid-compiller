import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiagramType } from '../../types';
import { fetchDocsEntries, formatDocsContext } from '../../services/docsContextService';
import type { DocsEntry } from '../../services/docsContextService';

export const useBuildDocs = (diagramType: DiagramType) => {
  const [buildDocsEntries, setBuildDocsEntries] = useState<DocsEntry[]>([]);
  const [buildDocsSelection, setBuildDocsSelection] = useState<Record<string, boolean>>({});
  const [buildDocsType, setBuildDocsType] = useState<DiagramType | null>(null);
  const [buildDocsActivePath, setBuildDocsActivePath] = useState<string>('');
  const buildDocsRequestRef = useRef(0);

  const loadBuildDocsEntries = useCallback(async (type: DiagramType) => {
    const requestId = ++buildDocsRequestRef.current;
    const entries = await fetchDocsEntries(type);
    if (requestId !== buildDocsRequestRef.current) {
      return { entries: [], selection: {} as Record<string, boolean> };
    }

    const nextSelection: Record<string, boolean> = {};
    entries.forEach((entry) => {
      nextSelection[entry.path] = buildDocsSelection[entry.path] ?? true;
    });

    setBuildDocsEntries(entries);
    setBuildDocsSelection(nextSelection);
    setBuildDocsType(type);
    setBuildDocsActivePath((prev) => {
      if (prev && entries.some((entry) => entry.path === prev)) return prev;
      return entries[0]?.path ?? '';
    });
    return { entries, selection: nextSelection };
  }, [buildDocsSelection]);

  const ensureBuildDocsEntries = useCallback(async () => {
    if (buildDocsType === diagramType) {
      return { entries: buildDocsEntries, selection: buildDocsSelection };
    }
    return await loadBuildDocsEntries(diagramType);
  }, [buildDocsEntries, buildDocsSelection, buildDocsType, diagramType, loadBuildDocsEntries]);

  const getBuildDocsContext = useCallback(async () => {
    const { entries, selection } = await ensureBuildDocsEntries();
    const selected = entries.filter((entry) => selection[entry.path] !== false);
    return formatDocsContext(selected);
  }, [ensureBuildDocsEntries]);

  const toggleBuildDocSelection = useCallback((path: string, isIncluded: boolean) => {
    setBuildDocsSelection((prev) => ({
      ...prev,
      [path]: isIncluded,
    }));
  }, []);

  const buildDocsSelectionKey = useMemo(() => {
    if (!buildDocsEntries.length) return '';
    return buildDocsEntries
      .map((entry) => `${entry.path}:${buildDocsSelection[entry.path] !== false ? '1' : '0'}`)
      .join('|');
  }, [buildDocsEntries, buildDocsSelection]);

  useEffect(() => {
    if (buildDocsType === diagramType) return;
    void loadBuildDocsEntries(diagramType);
  }, [buildDocsType, diagramType, loadBuildDocsEntries]);

  return {
    buildDocsEntries,
    buildDocsSelection,
    buildDocsSelectionKey,
    buildDocsActivePath,
    setBuildDocsActivePath,
    ensureBuildDocsEntries,
    getBuildDocsContext,
    loadBuildDocsEntries,
    toggleBuildDocSelection,
  };
};
