import React from 'react'; // No need for useCallback anymore directly here
import Header from './components/Header';
import ChatColumn from './components/ChatColumn';
import EditorColumn from './components/EditorColumn';
import PreviewColumn from './components/PreviewColumn';
import { useDiagramStudio } from './hooks/useDiagramStudio';

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
    handleRecompile,
    handleFixSyntax,
    handleAnalyze,
    startResize,
    setDiagramType,
    clearMessages,
    toggleTheme,
    setLanguage,
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
        {/* Col 1: Chat */}
        <div style={{ width: `${appState.columnWidths[0]}%` }} className="flex flex-col min-w-[260px]">
           <ChatColumn 
              messages={messages}
              onChat={handleChatMessage}
              onBuild={handleBuildFromPrompt}
              onClear={clearMessages}
              isProcessing={isProcessing}
              diagramType={appState.diagramType}
              onDiagramTypeChange={setDiagramType}
              mermaidStatus={mermaidState.status}
           />
        </div>

        {/* Resizer 1 */}
        <div className="resizer w-1 hover:w-1 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 cursor-col-resize z-10 transition-colors"
             onMouseDown={() => startResize(0)}></div>

        {/* Col 2: Editor */}
        <div style={{ width: `${appState.columnWidths[1]}%` }} className="flex flex-col min-w-[300px]">
           <EditorColumn 
              mermaidState={mermaidState}
              onChange={handleMermaidChange}
              onAnalyze={handleAnalyze}
              onFixSyntax={handleFixSyntax}
              onRecompile={handleRecompile}
              isAIReady={connectionState.status === 'connected' && !!aiConfig.selectedModelId}
              isProcessing={isProcessing}
              language={appState.language}
              onLanguageChange={setLanguage}
           />
        </div>

        {/* Resizer 2 */}
        <div className="resizer w-1 hover:w-1 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 cursor-col-resize z-10 transition-colors"
             onMouseDown={() => startResize(1)}></div>

        {/* Col 3: Preview */}
        <div style={{ width: `${appState.columnWidths[2]}%` }} className="flex flex-col min-w-[300px]">
            <PreviewColumn mermaidState={mermaidState} theme={appState.theme} />
        </div>
      </div>
    </div>
  );
}

export default App;
