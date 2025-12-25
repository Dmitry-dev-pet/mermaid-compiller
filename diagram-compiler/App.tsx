import React, { useCallback, useRef, useState } from 'react'; // No need for useCallback anymore directly here
import Header from './components/Header';
import ChatColumn from './components/ChatColumn';
import EditorColumn from './components/EditorColumn';
import PreviewColumn from './components/PreviewColumn';
import { useDiagramStudio } from './hooks/studio/useDiagramStudio';
import { ScrollSyncMeasure, ScrollSyncPayload } from './hooks/studio/useScrollSync';
import { MermaidThemeName, setInlineThemeCommand } from './utils/inlineThemeCommand';
import { MermaidDirection, setInlineDirectionCommand } from './utils/inlineDirectionCommand';
import { MermaidLook, setInlineLookCommand } from './utils/inlineLookCommand';
import {
  isMarkdownLike,
  replaceMermaidBlockInMarkdown,
  setLookForMarkdownMermaidBlocks,
  setThemeForMarkdownMermaidBlocks,
} from './services/mermaidService';

function App() {
  const {
    aiConfig,
    setAiConfig,
    connectionState,
    mermaidState,
    messages,
    appState,
    isProcessing,
    connectAI,
    disconnectAI,
    handleMermaidChange,
    handleChatMessage,
    handleBuildFromPrompt,
    handleFixSyntax,
    handleAnalyze,
    handleManualSnapshot,
    diagramMarkers,
    diagramStepAnchors,
    selectedStepId,
    projects,
    activeProjectId,
    diagramIntent,
    promptPreviewByMode,
    editorTab,
    buildDocsEntries,
    buildDocsSelection,
    toggleBuildDocSelection,
    buildDocsSelectionKey,
    buildDocsActivePath,
    setBuildDocsActivePath,
    docsMode,
    setDocsMode,
    systemPromptRawByMode,
    setSystemPromptRaw,
    buildDocsSelectionsByMode,
    setBuildDocSelectionForMode,
    markdownMermaidBlocks,
    markdownMermaidDiagnostics,
    markdownMermaidActiveIndex,
    setMarkdownMermaidActiveIndex,
    detectedDiagramType,
    goToDiagramStep,
    startResize,
    setDiagramType,
    clearMessages,
    startNewProject,
    openProject,
    renameProject,
    removeProject,
    undoRemoveProject,
    deleteUndoMs,
    toggleTheme,
    setAnalyzeLanguage,
    togglePreviewFullScreen,
    toggleScrollSync,
    buildPromptPreview,
    setPromptPreview,
    setEditorTab,
    startMarkdownNotebook,
    appendMarkdownMermaidBlock,
    interactionRecorder,
  } = useDiagramStudio();
  const buildDocsSystemPrompts = {
    chat: {
      raw: promptPreviewByMode.chat?.systemPrompt ?? '',
      redacted: promptPreviewByMode.chat?.systemPromptRedacted ?? '',
    },
    build: {
      raw: promptPreviewByMode.build?.systemPrompt ?? '',
      redacted: promptPreviewByMode.build?.systemPromptRedacted ?? '',
    },
    analyze: {
      raw: promptPreviewByMode.analyze?.systemPrompt ?? '',
      redacted: promptPreviewByMode.analyze?.systemPromptRedacted ?? '',
    },
    fix: {
      raw: promptPreviewByMode.fix?.systemPrompt ?? '',
      redacted: promptPreviewByMode.fix?.systemPromptRedacted ?? '',
    },
  };
  const scrollSyncSourceRef = useRef<ScrollSyncPayload['source'] | null>(null);
  const [scrollSyncPayload, setScrollSyncPayload] = useState<ScrollSyncPayload | null>(null);
  const [hoveredMarkdownIndex, setHoveredMarkdownIndex] = useState<number | null>(null);
  const promptPreviewKey = `${mermaidState.code}::${mermaidState.errorMessage ?? ''}::${appState.analyzeLanguage}::${appState.language}::${markdownMermaidActiveIndex}`;
  const applyInlineUpdate = (updateCode: (code: string) => string) => {
    if (editorTab === 'markdown_mermaid' && markdownMermaidBlocks.length) {
      const activeBlock = markdownMermaidBlocks[markdownMermaidActiveIndex];
      if (activeBlock) {
        const nextBlockCode = updateCode(activeBlock.code);
        const nextMarkdown = replaceMermaidBlockInMarkdown(mermaidState.code, activeBlock, nextBlockCode);
        handleMermaidChange(nextMarkdown);
        return;
      }
    }
    handleMermaidChange(updateCode(mermaidState.code));
  };

  const computeScrollRatio = (scrollTop: number, scrollHeight: number, clientHeight: number) => {
    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    return Math.max(0, Math.min(1, scrollTop / maxScroll));
  };

  const handleEditorScrollSync = useCallback((payload: ScrollSyncMeasure) => {
    if (!appState.isScrollSyncEnabled) return;
    if (scrollSyncSourceRef.current === 'preview') {
      scrollSyncSourceRef.current = null;
      return;
    }
    scrollSyncSourceRef.current = 'editor';
    const ratio = computeScrollRatio(payload.scrollTop, payload.scrollHeight, payload.clientHeight);
    if (typeof payload.blockIndex === 'number') {
      setScrollSyncPayload({ source: 'editor', mode: 'block', blockIndex: payload.blockIndex, ratio, nonce: Date.now() });
      return;
    }
    setScrollSyncPayload({ source: 'editor', mode: 'ratio', ratio, nonce: Date.now() });
  }, [appState.isScrollSyncEnabled]);

  const handlePreviewScrollSync = useCallback((payload: ScrollSyncMeasure) => {
    if (!appState.isScrollSyncEnabled) return;
    if (scrollSyncSourceRef.current === 'editor' && typeof payload.blockIndex !== 'number') {
      scrollSyncSourceRef.current = null;
      return;
    }
    scrollSyncSourceRef.current = 'preview';
    const ratio = computeScrollRatio(payload.scrollTop, payload.scrollHeight, payload.clientHeight);
    if (typeof payload.blockIndex === 'number') {
      setScrollSyncPayload({ source: 'preview', mode: 'block', blockIndex: payload.blockIndex, ratio, nonce: Date.now() });
      return;
    }
    setScrollSyncPayload({ source: 'preview', mode: 'ratio', ratio, nonce: Date.now() });
  }, [appState.isScrollSyncEnabled]);

  // Resizing logic is now entirely within useDiagramStudio,
  // so onMouseMove and onMouseUp are not needed directly in App.tsx
  // and their useEffect for event listeners is also gone from here.

  return (
    <div className="flex flex-col h-screen text-slate-800 dark:text-slate-100 font-sans bg-white dark:bg-slate-950 transition-colors">
      <Header 
        aiConfig={aiConfig}
        connectionState={connectionState}
        onConfigChange={setAiConfig}
        onConnect={connectAI}
        onDisconnect={disconnectAI}
        theme={appState.theme}
        onToggleTheme={toggleTheme}
        interactionRecorder={interactionRecorder}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {!appState.isPreviewFullScreen && (
          <>
            {/* Col 1: Chat */}
            <div style={{ width: `${appState.columnWidths[0]}%` }} className="flex flex-col min-w-[260px]">
              <ChatColumn 
                messages={messages}
                onChat={handleChatMessage}
                onBuild={handleBuildFromPrompt}
                onClear={clearMessages}
                onNewProject={startNewProject}
                onNewMarkdownNotebook={startMarkdownNotebook}
                isProcessing={isProcessing}
                hasIntent={!!diagramIntent?.content.trim()}
                onSetPromptPreview={setPromptPreview}
                diagramType={appState.diagramType}
                onDiagramTypeChange={setDiagramType}
                onPreviewPrompt={buildPromptPreview}
                diagramMarkers={diagramMarkers}
                diagramStepAnchors={diagramStepAnchors}
                selectedStepId={selectedStepId}
                projects={projects}
                activeProjectId={activeProjectId}
                onOpenProject={openProject}
                onRenameProject={renameProject}
                onDeleteProject={removeProject}
                onUndoDeleteProject={undoRemoveProject}
                deleteUndoMs={deleteUndoMs}
                onSelectDiagramStep={goToDiagramStep}
                buildDocsSelectionKey={buildDocsSelectionKey}
                promptPreviewKey={promptPreviewKey}
                detectedDiagramType={detectedDiagramType}
              />
            </div>

            {/* Resizer 1 */}
            <div
              className="resizer w-1 hover:w-1 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 cursor-col-resize z-10 transition-colors"
              onMouseDown={() => startResize(0)}
            ></div>

            {/* Col 2: Editor */}
            <div style={{ width: `${appState.columnWidths[1]}%` }} className="flex flex-col min-w-[300px]">
              <EditorColumn 
                mermaidState={mermaidState}
                onChange={handleMermaidChange}
                onAnalyze={handleAnalyze}
                onFixSyntax={handleFixSyntax}
                onSnapshot={handleManualSnapshot}
                isAIReady={connectionState.status === 'connected' && !!aiConfig.selectedModelId}
                isProcessing={isProcessing}
                analyzeLanguage={appState.analyzeLanguage}
                onAnalyzeLanguageChange={setAnalyzeLanguage}
                appLanguage={appState.language}
                promptPreviewByMode={promptPreviewByMode}
                activeTab={editorTab}
                buildDocsEntries={buildDocsEntries}
                buildDocsSelection={buildDocsSelection}
                onToggleBuildDoc={toggleBuildDocSelection}
                buildDocsSelectionsByMode={buildDocsSelectionsByMode}
                onToggleBuildDocForMode={setBuildDocSelectionForMode}
                buildDocsActivePath={buildDocsActivePath}
                onBuildDocsActivePathChange={setBuildDocsActivePath}
                docsMode={docsMode}
                onDocsModeChange={setDocsMode}
                systemPromptRawByMode={systemPromptRawByMode}
                onSystemPromptRawChange={setSystemPromptRaw}
                markdownMermaidBlocks={markdownMermaidBlocks}
                markdownMermaidDiagnostics={markdownMermaidDiagnostics}
                markdownMermaidActiveIndex={markdownMermaidActiveIndex}
                onMarkdownMermaidActiveIndexChange={setMarkdownMermaidActiveIndex}
                onActiveTabChange={setEditorTab}
                onAppendMarkdownMermaidBlock={appendMarkdownMermaidBlock}
                isScrollSyncEnabled={appState.isScrollSyncEnabled}
                scrollSyncPayload={scrollSyncPayload}
                onScrollSync={handleEditorScrollSync}
                hoveredMarkdownIndex={hoveredMarkdownIndex}
              />
            </div>

            {/* Resizer 2 */}
            <div
              className="resizer w-1 hover:w-1 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 cursor-col-resize z-10 transition-colors"
              onMouseDown={() => startResize(1)}
            ></div>
          </>
        )}

        {/* Col 3: Preview */}
        <div
          style={appState.isPreviewFullScreen ? undefined : { width: `${appState.columnWidths[2]}%` }}
          className={`flex flex-col ${appState.isPreviewFullScreen ? 'flex-1 min-w-0' : 'min-w-[300px]'}`}
        >
          <PreviewColumn
            mermaidState={mermaidState}
            theme={appState.theme}
            isFullScreen={appState.isPreviewFullScreen}
            onToggleFullScreen={togglePreviewFullScreen}
            isScrollSyncEnabled={appState.isScrollSyncEnabled}
            onToggleScrollSync={toggleScrollSync}
            scrollSyncPayload={scrollSyncPayload}
            onScrollSync={handlePreviewScrollSync}
            onSetInlineTheme={(nextTheme: MermaidThemeName | null) => {
              if (editorTab !== 'markdown_mermaid' && markdownMermaidBlocks.length && isMarkdownLike(mermaidState.code)) {
                const nextMarkdown = setThemeForMarkdownMermaidBlocks(mermaidState.code, nextTheme);
                handleMermaidChange(nextMarkdown);
                return;
              }
              applyInlineUpdate((code) => setInlineThemeCommand(code, nextTheme));
            }}
            onSetInlineDirection={(nextDirection: MermaidDirection | null) => {
              applyInlineUpdate((code) => setInlineDirectionCommand(code, nextDirection));
            }}
            onSetInlineLook={(nextLook: MermaidLook | null) => {
              if (editorTab !== 'markdown_mermaid' && markdownMermaidBlocks.length && isMarkdownLike(mermaidState.code)) {
                const nextMarkdown = setLookForMarkdownMermaidBlocks(mermaidState.code, nextLook);
                handleMermaidChange(nextMarkdown);
                return;
              }
              applyInlineUpdate((code) => setInlineLookCommand(code, nextLook));
            }}
            activeEditorTab={editorTab}
            buildDocsSystemPrompts={buildDocsSystemPrompts}
            systemPromptRawByMode={systemPromptRawByMode}
            buildDocsEntries={buildDocsEntries}
            buildDocsActivePath={buildDocsActivePath}
            markdownMermaidBlocks={markdownMermaidBlocks}
            markdownMermaidDiagnostics={markdownMermaidDiagnostics}
            markdownMermaidActiveIndex={markdownMermaidActiveIndex}
            onMarkdownMermaidActiveIndexChange={setMarkdownMermaidActiveIndex}
            onActiveEditorTabChange={setEditorTab}
            hoveredMarkdownIndex={hoveredMarkdownIndex}
            onHoverMarkdownIndex={setHoveredMarkdownIndex}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
