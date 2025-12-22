import React from 'react'; // No need for useCallback anymore directly here
import Header from './components/Header';
import ChatColumn from './components/ChatColumn';
import EditorColumn from './components/EditorColumn';
import PreviewColumn from './components/PreviewColumn';
import { useDiagramStudio } from './hooks/studio/useDiagramStudio';
import { MermaidThemeName, setInlineThemeCommand } from './utils/inlineThemeCommand';
import { MermaidDirection, setInlineDirectionCommand } from './utils/inlineDirectionCommand';
import { MermaidLook, setInlineLookCommand } from './utils/inlineLookCommand';
import { replaceMermaidBlockInMarkdown } from './services/mermaidService';

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
    diagramIntent,
    promptPreviewByMode,
    promptPreviewView,
    editorTab,
    buildDocsEntries,
    buildDocsSelection,
    toggleBuildDocSelection,
    buildDocsSelectionKey,
    buildDocsActivePath,
    setBuildDocsActivePath,
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
    toggleTheme,
    setAnalyzeLanguage,
    togglePreviewFullScreen,
    buildPromptPreview,
    setPromptPreview,
    setPromptPreviewView,
    setEditorTab,
  } = useDiagramStudio();
  const promptPreviewKey = `${mermaidState.code}::${mermaidState.errorMessage ?? ''}::${appState.analyzeLanguage}::${markdownMermaidActiveIndex}`;
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
                isProcessing={isProcessing}
                hasIntent={!!diagramIntent?.content.trim()}
                onSetPromptPreview={setPromptPreview}
                diagramType={appState.diagramType}
                onDiagramTypeChange={setDiagramType}
                mermaidStatus={mermaidState.status}
                onPreviewPrompt={buildPromptPreview}
                diagramMarkers={diagramMarkers}
                diagramStepAnchors={diagramStepAnchors}
                selectedStepId={selectedStepId}
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
                promptPreviewByMode={promptPreviewByMode}
                promptPreviewView={promptPreviewView}
                onPromptPreviewViewChange={setPromptPreviewView}
                activeTab={editorTab}
                buildDocsEntries={buildDocsEntries}
                buildDocsSelection={buildDocsSelection}
                onToggleBuildDoc={toggleBuildDocSelection}
                buildDocsActivePath={buildDocsActivePath}
                onBuildDocsActivePathChange={setBuildDocsActivePath}
                markdownMermaidBlocks={markdownMermaidBlocks}
                markdownMermaidDiagnostics={markdownMermaidDiagnostics}
                markdownMermaidActiveIndex={markdownMermaidActiveIndex}
                onMarkdownMermaidActiveIndexChange={setMarkdownMermaidActiveIndex}
                onActiveTabChange={setEditorTab}
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
            onSetInlineTheme={(nextTheme: MermaidThemeName | null) => {
              applyInlineUpdate((code) => setInlineThemeCommand(code, nextTheme));
            }}
            onSetInlineDirection={(nextDirection: MermaidDirection | null) => {
              applyInlineUpdate((code) => setInlineDirectionCommand(code, nextDirection));
            }}
            onSetInlineLook={(nextLook: MermaidLook | null) => {
              applyInlineUpdate((code) => setInlineLookCommand(code, nextLook));
            }}
            activeEditorTab={editorTab}
            promptPreviewByMode={promptPreviewByMode}
            promptPreviewView={promptPreviewView}
            buildDocsEntries={buildDocsEntries}
            buildDocsActivePath={buildDocsActivePath}
            markdownMermaidBlocks={markdownMermaidBlocks}
            markdownMermaidDiagnostics={markdownMermaidDiagnostics}
            markdownMermaidActiveIndex={markdownMermaidActiveIndex}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
