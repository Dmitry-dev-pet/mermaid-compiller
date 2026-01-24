import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiagramType, DocsMode } from "../../types";
import {
  fetchDocsEntries,
  formatDocsContext,
  getDocsPaths,
} from "../../services/docsContextService";
import type { DocsEntry } from "../../services/docsContextService";
import { safeParse } from "../../utils";
import { getNotebookPlannerDocsPaths } from "../../services/docsContextService";
import { DOCS_MODE_ORDER } from "../../utils/docsModes";
import { isPromptsVirtualPath } from "../../utils/promptsVirtualPaths";
import { isSystemPromptPath } from "../../utils/systemPrompts";

type DocsSelectionState = {
  mode: DocsMode;
  selections: Record<DocsMode, Record<string, boolean>>;
  activePaths: Record<DocsMode, string>;
  systemPromptRawByMode: Record<DocsMode, boolean>;
};

const PLAN_DEFAULT_DOCS = new Set(
  getNotebookPlannerDocsPaths().map(({ path }) => path),
);
const DEFAULT_DOCS_STATE: DocsSelectionState = {
  mode: "build",
  selections: {
    chat: {},
    build: {},
    analyze: {},
    fix: {},
    plan: {},
  },
  activePaths: {
    chat: "",
    build: "",
    analyze: "",
    fix: "",
    plan: "",
  },
  systemPromptRawByMode: {
    chat: false,
    build: false,
    analyze: false,
    fix: false,
    plan: false,
  },
};

export const useBuildDocs = (diagramType: DiagramType) => {
  const [buildDocsEntries, setBuildDocsEntries] = useState<DocsEntry[]>([]);
  const [buildDocsType, setBuildDocsType] = useState<DiagramType | null>(null);
  const [docsState, setDocsState] = useState<DocsSelectionState>(() => {
    const parsed = safeParse("dc_docs_selection_v2", DEFAULT_DOCS_STATE);
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
  const docsStateRef = useRef(docsState);
  useEffect(() => {
    docsStateRef.current = docsState;
  }, [docsState]);
  const buildDocsRequestRef = useRef(0);

  const ensureDocsSelectionsForEntries = useCallback((entries: DocsEntry[]) => {
    const nextSelections: DocsSelectionState["selections"] = {
      ...docsStateRef.current.selections,
    };
    let changed = false;
    DOCS_MODE_ORDER.forEach((mode) => {
      const modeSelection = { ...nextSelections[mode] };
      entries.forEach((entry) => {
        if (modeSelection[entry.path] === undefined) {
          modeSelection[entry.path] =
            mode === "plan"
              ? PLAN_DEFAULT_DOCS.has(entry.path)
              : mode === "chat"
                ? false
                : true;
          changed = true;
        }
      });
      nextSelections[mode] = modeSelection;
    });
    return { selections: nextSelections, changed };
  }, []);

  const loadBuildDocsEntries = useCallback(
    async (type: DiagramType) => {
      const requestId = ++buildDocsRequestRef.current;
      let entries = await fetchDocsEntries(type);
      if (requestId !== buildDocsRequestRef.current) {
        return {
          entries: [],
          selections: DEFAULT_DOCS_STATE.selections,
          activePaths: DEFAULT_DOCS_STATE.activePaths,
        };
      }
      if (!entries.length) {
        entries = getDocsPaths(type).map(({ path, isOptional }) => ({
          path,
          text: "",
          isOptional,
        }));
      }

      const { selections: nextSelections } =
        ensureDocsSelectionsForEntries(entries);
      const nextActivePaths: DocsSelectionState["activePaths"] = {
        ...docsStateRef.current.activePaths,
      };
      DOCS_MODE_ORDER.forEach((mode) => {
        const prevPath = nextActivePaths[mode];
        // Preserve "virtual" prompt paths (System/Intent/Notebook plan) and
        // system prompt pseudo-files across doc-set reloads (e.g. switching active diagram).
        if (
          prevPath &&
          (isPromptsVirtualPath(prevPath) || isSystemPromptPath(prevPath))
        ) {
          return;
        }
        if (!prevPath || !entries.some((entry) => entry.path === prevPath)) {
          if (mode === "plan") {
            nextActivePaths[mode] =
              entries.find((entry) => PLAN_DEFAULT_DOCS.has(entry.path))
                ?.path ??
              entries[0]?.path ??
              "";
          } else {
            nextActivePaths[mode] = entries[0]?.path ?? "";
          }
        }
      });

      setBuildDocsEntries(entries);
      setBuildDocsType(type);
      setDocsState((prev) => ({
        ...prev,
        selections: nextSelections,
        activePaths: nextActivePaths,
      }));
      return {
        entries,
        selections: nextSelections,
        activePaths: nextActivePaths,
      };
    },
    [ensureDocsSelectionsForEntries],
  );

  const ensureViewerDocsEntries = useCallback(async () => {
    if (buildDocsEntries.length && buildDocsType) {
      return {
        entries: buildDocsEntries,
        selections: docsState.selections,
        activePaths: docsState.activePaths,
      };
    }
    return await loadBuildDocsEntries(buildDocsType ?? diagramType);
  }, [
    buildDocsEntries,
    buildDocsType,
    diagramType,
    docsState.activePaths,
    docsState.selections,
    loadBuildDocsEntries,
  ]);

  const fetchContextDocsEntries = useCallback(async () => {
    if (buildDocsType === diagramType && buildDocsEntries.length) {
      const { selections: nextSelections, changed } =
        ensureDocsSelectionsForEntries(buildDocsEntries);
      if (changed) {
        setDocsState((prev) => ({
          ...prev,
          selections: nextSelections,
        }));
      }
      return { entries: buildDocsEntries, selections: nextSelections };
    }
    let entries = await fetchDocsEntries(diagramType);
    if (!entries.length) {
      entries = getDocsPaths(diagramType).map(({ path, isOptional }) => ({
        path,
        text: "",
        isOptional,
      }));
    }
    const { selections: nextSelections, changed } =
      ensureDocsSelectionsForEntries(entries);
    if (changed) {
      setDocsState((prev) => ({
        ...prev,
        selections: nextSelections,
      }));
    }
    return { entries, selections: nextSelections };
  }, [
    buildDocsEntries,
    buildDocsType,
    diagramType,
    ensureDocsSelectionsForEntries,
  ]);

  const getDocsContext = useCallback(
    async (mode: DocsMode) => {
      const { entries, selections } = await fetchContextDocsEntries();
      const selection = selections[mode] ?? {};
      const selected = entries.filter(
        (entry) => selection[entry.path] !== false,
      );
      return formatDocsContext(selected);
    },
    [fetchContextDocsEntries],
  );

  const getViewerDocsContext = useCallback(
    async (mode: DocsMode) => {
      const { entries, selections } = await ensureViewerDocsEntries();
      const selection = selections[mode] ?? {};
      const selected = entries.filter(
        (entry) => selection[entry.path] !== false,
      );
      return formatDocsContext(selected);
    },
    [ensureViewerDocsEntries],
  );

  const getDocsSelectionSummary = useCallback(
    async (mode: DocsMode) => {
      const { entries, selections } = await fetchContextDocsEntries();
      const selection = selections[mode] ?? {};
      const included = entries.filter(
        (entry) => selection[entry.path] !== false,
      );
      const excluded = entries.filter(
        (entry) => selection[entry.path] === false,
      );
      return {
        total: entries.length,
        included: included.length,
        excluded: excluded.length,
        includedPaths: included.map((entry) => entry.path),
        excludedPaths: excluded.map((entry) => entry.path),
      };
    },
    [fetchContextDocsEntries],
  );

  const toggleBuildDocSelection = useCallback(
    (path: string, isIncluded: boolean) => {
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
    },
    [],
  );

  const setBuildDocsActivePath = useCallback((path: string) => {
    setDocsState((prev) => ({
      ...prev,
      activePaths: {
        ...prev.activePaths,
        [prev.mode]: path,
      },
    }));
  }, []);

  const setBuildDocsActivePathForMode = useCallback(
    (mode: DocsMode, path: string) => {
      setDocsState((prev) => ({
        ...prev,
        activePaths: {
          ...prev.activePaths,
          [mode]: path,
        },
      }));
    },
    [],
  );

  const setDocsMode = useCallback((mode: DocsMode) => {
    setDocsState((prev) => ({ ...prev, mode }));
  }, []);

  const buildDocsSelectionKey = useMemo(() => {
    if (!buildDocsEntries.length) return "";
    return DOCS_MODE_ORDER.map((mode) => {
      const selection = docsState.selections[mode] ?? {};
      const key = buildDocsEntries
        .map(
          (entry) =>
            `${entry.path}:${selection[entry.path] !== false ? "1" : "0"}`,
        )
        .join("|");
      return `${mode}:${key}`;
    }).join("::");
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

  const setBuildDocSelectionForMode = useCallback(
    (mode: DocsMode, path: string, isIncluded: boolean) => {
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
    },
    [],
  );

  const resetDocsSelectionsToDefault = useCallback(() => {
    if (!buildDocsEntries.length) return;
    setDocsState((prev) => {
      const nextSelections: DocsSelectionState["selections"] = {
        ...prev.selections,
      };
      const syntaxDocPath =
        buildDocsEntries.find((entry) =>
          entry.path.startsWith("packages/mermaid/src/docs/syntax/"),
        )?.path ?? "";
      const syntaxReferencePath =
        "packages/mermaid/src/docs/intro/syntax-reference.md";

      for (const mode of DOCS_MODE_ORDER) {
        const modeSelection: Record<string, boolean> = {};
        if (mode === "plan") {
          for (const entry of buildDocsEntries) {
            modeSelection[entry.path] = PLAN_DEFAULT_DOCS.has(entry.path);
          }
        } else if (mode === "chat") {
          for (const entry of buildDocsEntries) {
            modeSelection[entry.path] = false;
          }
        } else {
          const defaultPath = syntaxDocPath || syntaxReferencePath;
          for (const entry of buildDocsEntries) {
            modeSelection[entry.path] = entry.path === defaultPath;
          }
        }
        nextSelections[mode] = modeSelection;
      }
      return {
        ...prev,
        selections: nextSelections,
      };
    });
  }, [buildDocsEntries]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBuildDocsEntries(diagramType);
  }, [diagramType, loadBuildDocsEntries]);

  useEffect(() => {
    localStorage.setItem("dc_docs_selection_v2", JSON.stringify(docsState));
  }, [docsState]);

  return {
    buildDocsEntries,
    buildDocsType,
    buildDocsSelection: docsState.selections[docsState.mode] ?? {},
    buildDocsSelectionKey,
    buildDocsActivePath: docsState.activePaths[docsState.mode] ?? "",
    setBuildDocsActivePath,
    setBuildDocsActivePathForMode,
    docsMode: docsState.mode,
    setDocsMode,
    systemPromptRawByMode: docsState.systemPromptRawByMode,
    setSystemPromptRaw,
    buildDocsSelectionsByMode: docsState.selections,
    setBuildDocSelectionForMode,
    resetDocsSelectionsToDefault,
    ensureBuildDocsEntries: ensureViewerDocsEntries,
    getDocsContext,
    getViewerDocsContext,
    getDocsSelectionSummary,
    loadBuildDocsEntries,
    toggleBuildDocSelection,
  };
};
