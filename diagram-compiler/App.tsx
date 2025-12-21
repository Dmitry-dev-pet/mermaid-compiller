import React from 'react'; // No need for useCallback anymore directly here
import Header from './components/Header';
import ChatColumn from './components/ChatColumn';
import EditorColumn from './components/EditorColumn';
import PreviewColumn from './components/PreviewColumn';
import { useDiagramStudio } from './hooks/useDiagramStudio';
import { MermaidThemeName, setInlineThemeCommand } from './utils/inlineThemeCommand';
import { MermaidDirection, setInlineDirectionCommand } from './utils/inlineDirectionCommand';
import { MermaidLook, setInlineLookCommand } from './utils/inlineLookCommand';

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
              handleMermaidChange(setInlineThemeCommand(mermaidState.code, nextTheme));
            }}
            onSetInlineDirection={(nextDirection: MermaidDirection | null) => {
              handleMermaidChange(setInlineDirectionCommand(mermaidState.code, nextDirection));
            }}
            onSetInlineLook={(nextLook: MermaidLook | null) => {
              handleMermaidChange(setInlineLookCommand(mermaidState.code, nextLook));
            }}
            activeEditorTab={editorTab}
            promptPreviewByMode={promptPreviewByMode}
            promptPreviewView={promptPreviewView}
            buildDocsEntries={buildDocsEntries}
            buildDocsActivePath={buildDocsActivePath}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
