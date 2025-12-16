import { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { AIConfig, AppState, ConnectionState, MermaidState, Message, DiagramType } from '../types';
import { DEFAULT_AI_CONFIG, DEFAULT_APP_STATE, DEFAULT_MERMAID_STATE, INITIAL_CHAT_MESSAGE } from '../constants';
import { validateMermaid, extractMermaidCode, initializeMermaid } from '../services/mermaidService';
import { fetchModels, generateDiagram, fixDiagram, chat, analyzeDiagram } from '../services/llmService';
import { fetchDocsContext } from '../services/docsContextService';

// Simple ID generator
const generateId = () => Math.random().toString(36).substring(2, 9);

// Helper function to strip Mermaid code blocks from a string
const stripMermaidCode = (text: string): string => {
  // Remove ```mermaid ... ``` blocks
  let strippedText = text.replace(/```mermaid\n([\s\S]*?)```/g, '');
  // Remove generic ``` ... ``` blocks that might contain code
  strippedText = strippedText.replace(/```\n([\s\S]*?)```/g, '');
  return strippedText.trim();
};

const detectLanguage = (text: string): string => {
  const cyrillicPattern = /[а-яА-ЯёЁ]/;
  return cyrillicPattern.test(text) ? 'Russian' : 'English';
};

const safeParse = <T>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    return { ...fallback, ...JSON.parse(saved) };
  } catch (e) {
    console.error(`Failed to parse ${key} from localStorage`, e);
    return fallback;
  }
};

export const useDiagramStudio = () => {
  // --- State ---
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => safeParse('dc_ai_config', DEFAULT_AI_CONFIG));

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    availableModels: []
  });

  const [mermaidState, setMermaidState] = useState<MermaidState>(DEFAULT_MERMAID_STATE);
  
  const [messages, setMessages] = useState<Message[]>([
    { id: 'init', role: 'assistant', content: INITIAL_CHAT_MESSAGE, timestamp: Date.now() }
  ]);

  const [appState, setAppState] = useState<AppState>(() => safeParse('dc_app_state', DEFAULT_APP_STATE));

  const [isProcessing, setIsProcessing] = useState(false);

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('dc_ai_config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  useEffect(() => {
    localStorage.setItem('dc_app_state', JSON.stringify(appState));
  }, [appState]);

  // --- Theme Effect ---
  useLayoutEffect(() => {
    const root = window.document.documentElement;
    if (appState.theme === 'dark') {
      root.classList.add('dark');
      initializeMermaid('dark');
    } else {
      root.classList.remove('dark');
      initializeMermaid('default');
    }
  }, [appState.theme]);

  // --- Logic: AI Service ---
  const connectAI = useCallback(async () => {
    setConnectionState(prev => ({ ...prev, status: 'connecting', error: undefined }));
    try {
      const models = await fetchModels(aiConfig);
      
      if (models.length === 0) {
        throw new Error("No models found. Check endpoint/key.");
      }

      setConnectionState({
        status: 'connected',
        availableModels: models
      });
      
      // Auto-select first model if none selected or current not in list
      if (!aiConfig.selectedModelId || !models.find(m => m.id === aiConfig.selectedModelId)) {
        setAiConfig(prev => ({ ...prev, selectedModelId: models[0].id }));
      }

    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setConnectionState({
        status: 'failed',
        error: message || 'Connection failed',
        availableModels: []
      });
    }
  }, [aiConfig]);

  const disconnectAI = useCallback(() => {
    setConnectionState({ status: 'disconnected', availableModels: [] });
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (aiConfig.openRouterKey || aiConfig.proxyEndpoint) {
        connectAI();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMermaidChange = useCallback((newCode: string) => {
    // 1. Immediate update of code to keep UI responsive and cursor in place
    setMermaidState(prev => ({
      ...prev,
      code: newCode,
      status: 'edited' 
    }));

    // 2. Validate asynchronously without awaiting in the main thread
    validateMermaid(newCode).then(validation => {
       setMermaidState(prev => {
           // Verify we are still validating the latest code to avoid race conditions
           if (prev.code !== newCode) return prev; 
           
           return {
               ...prev,
               isValid: validation.isValid ?? false,
               lastValidCode: validation.lastValidCode ?? prev.lastValidCode,
               errorMessage: validation.errorMessage,
               errorLine: validation.errorLine,
               status: newCode.trim() ? (validation.isValid ? 'valid' : 'invalid') : 'empty',
               source: prev.source === 'compiled' ? 'user-override' : prev.source,
           };
       });
    });
  }, []);

  const handleSendMessage = async (text: string) => {
    const newUserMsg: Message = { id: generateId(), role: 'user', content: text, timestamp: Date.now() };
    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);

    if (connectionState.status !== 'connected') {
        setTimeout(() => {
             setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: "I'm offline. Connect AI to generate diagrams.", timestamp: Date.now() }]);
        }, 500);
        return;
    }

    // Determine language
    let currentLanguage = appState.language;
    if (currentLanguage === 'auto') {
        const detected = detectLanguage(text);
        if (detected) {
            currentLanguage = detected;
            setAppState(prev => ({ ...prev, language: detected }));
        } else {
            currentLanguage = 'English';
        }
    }

    setIsProcessing(true);
    try {
        const docs = await fetchDocsContext(appState.diagramType);
        const relevantMessages = updatedMessages.filter(m => m.id !== 'init');
        const responseText = await chat(relevantMessages, aiConfig, appState.diagramType, docs, currentLanguage);
        const extractedCode = extractMermaidCode(responseText);
        
        if (extractedCode) {
             const validation = await validateMermaid(extractedCode);
             setMermaidState(prev => ({
                ...prev,
                code: extractedCode,
                isValid: validation.isValid ?? false,
                lastValidCode: validation.lastValidCode,
                errorMessage: validation.errorMessage,
                errorLine: validation.errorLine,
                status: validation.isValid ? 'valid' : 'invalid',
                source: 'compiled'
             }));
        }

        setMessages(prev => [...prev, {
            id: generateId(), 
            role: 'assistant', 
            content: stripMermaidCode(responseText),
            timestamp: Date.now()
        }]);

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setMessages(prev => [...prev, {
            id: generateId(), 
            role: 'assistant', 
            content: `Error: ${message}`,
            timestamp: Date.now()
        }]);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleRecompile = async () => {
    if (connectionState.status !== 'connected') {
        alert("Connect AI first!");
        return;
    }
    
    setIsProcessing(true);
    try {
        const docs = await fetchDocsContext(appState.diagramType);
        const language = appState.language === 'auto' ? 'English' : appState.language;
        const relevantMessages = messages.filter(m => m.id !== 'init');
        const rawCode = await generateDiagram(relevantMessages, aiConfig, appState.diagramType, docs, language);
        const cleanCode = extractMermaidCode(rawCode);
        const validation = await validateMermaid(cleanCode);
        
        setMermaidState((prev) => ({
            ...prev,
            code: cleanCode,
            isValid: validation.isValid ?? false,
            lastValidCode: validation.lastValidCode,
            errorMessage: validation.errorMessage,
            errorLine: validation.errorLine,
            status: validation.isValid ? 'valid' : 'invalid',
            source: 'compiled'
        }));

        setMessages(prev => [...prev, {
            id: generateId(), 
            role: 'assistant', 
            content: `Generated ${appState.diagramType} diagram. ${validation.isValid ? 'Valid.' : 'Contains errors.'}`,
            timestamp: Date.now()
        }]);

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        alert(`Generation failed: ${message}`);
        setMessages(prev => [...prev, {
            id: generateId(), 
            role: 'assistant', 
            content: `Error generating diagram: ${message}`,
            timestamp: Date.now()
        }]);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleFixSyntax = async () => {
    if (connectionState.status !== 'connected') return;
    setIsProcessing(true);
    try {
        const docs = await fetchDocsContext(appState.diagramType);
        const language = appState.language === 'auto' ? 'English' : appState.language;
        const fixedRaw = await fixDiagram(mermaidState.code, mermaidState.errorMessage || "Unknown error", aiConfig, docs, language);
        const fixedCode = extractMermaidCode(fixedRaw);
        
        const validation = await validateMermaid(fixedCode);
        setMermaidState(prev => ({
            ...prev,
            code: fixedCode,
            isValid: validation.isValid ?? false,
            lastValidCode: validation.lastValidCode,
            errorMessage: validation.errorMessage,
            errorLine: validation.errorLine,
            status: validation.isValid ? 'valid' : 'invalid',
        }));
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        alert(`Fix failed: ${message}`);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleAnalyze = async () => {
    if (connectionState.status !== 'connected' || !mermaidState.code.trim()) {
        alert("Connect AI and provide Mermaid code first!");
        return;
    }
    setIsProcessing(true);
    try {
        const docs = await fetchDocsContext(appState.diagramType); // Context might be useful for explanation
        const language = appState.language === 'auto' ? 'English' : appState.language;
        const explanation = await analyzeDiagram(mermaidState.code, aiConfig, docs, language);
        
        setMessages(prev => [...prev, {
            id: generateId(), 
            role: 'assistant', 
            content: explanation, 
            timestamp: Date.now()
        }]);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        alert(`Analysis failed: ${message}`);
        setMessages(prev => [...prev, {
            id: generateId(), 
            role: 'assistant', 
            content: `Error analyzing diagram: ${message}`,
            timestamp: Date.now()
        }]);
    } finally {
        setIsProcessing(false);
    }
  };

  // --- Resizing Logic ---
  const startResize = (index: number) => {
    setAppState(prev => ({ ...prev, isResizing: index }));
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (appState.isResizing === null) return;
    const totalWidth = window.innerWidth;
    const newPerc = (e.clientX / totalWidth) * 100;
    
    setAppState(prev => {
        const widths = [...prev.columnWidths] as [number, number, number];
        
        if (prev.isResizing === 0) {
            const w1 = Math.max(20, Math.min(newPerc, 40)); 
            const diff = w1 - widths[0];
            widths[0] = w1;
            widths[1] = widths[1] - diff; 
        } else if (prev.isResizing === 1) {
             const splitPerc = (e.clientX / totalWidth) * 100;
             let w2 = splitPerc - widths[0];
             w2 = Math.max(20, w2);
             if (100 - (widths[0] + w2) < 20) return prev;
             widths[1] = w2;
             widths[2] = 100 - widths[0] - widths[1];
        }
        
        return { ...prev, columnWidths: widths };
    });
  }, [appState.isResizing]);

  const onMouseUp = useCallback(() => {
    setAppState(prev => ({ ...prev, isResizing: null }));
  }, []);

  useEffect(() => {
    if (appState.isResizing !== null) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [appState.isResizing, onMouseMove, onMouseUp]);

  const setDiagramType = useCallback((type: DiagramType) => {
    setAppState(prev => ({ ...prev, diagramType: type }));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const toggleTheme = useCallback(() => {
    setAppState(prev => ({ ...prev, theme: prev.theme === 'light' ? 'dark' : 'light' }));
  }, []);

  const setLanguage = useCallback((lang: string) => {
    setAppState(prev => ({ ...prev, language: lang }));
  }, []);

  return {
    aiConfig,
    setAiConfig,
    connectionState,
    mermaidState,
    messages,
    setMessages,
    appState,
    setAppState,
    isProcessing,
    connectAI,
    disconnectAI,
    handleMermaidChange,
    handleSendMessage,
    handleRecompile,
    handleFixSyntax,
    handleAnalyze,
    startResize,
    setDiagramType,
    clearMessages,
    toggleTheme,
    setLanguage
  };
};
