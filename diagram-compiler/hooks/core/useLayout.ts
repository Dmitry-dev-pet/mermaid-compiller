import { useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { AppState, DiagramType } from '../../types';
import { DEFAULT_APP_STATE } from '../../constants';
import { initializeMermaid } from '../../services/mermaidService';
import { safeParse } from '../../utils';
import { DIAGRAM_TYPES, MAIN_DIAGRAM_TYPES } from '../../utils/diagramTypes';

export const useLayout = () => {
  const [appState, setAppState] = useState<AppState>(() => {
    const parsed = safeParse('dc_app_state', DEFAULT_APP_STATE);
    const nextTypes = Array.isArray(parsed.mainDiagramTypes) ? parsed.mainDiagramTypes : [...MAIN_DIAGRAM_TYPES];
    const sanitized = nextTypes
      .map((t) => (typeof t === 'string' ? (t as DiagramType) : null))
      .filter((t): t is DiagramType => !!t && t !== 'auto' && (DIAGRAM_TYPES as readonly string[]).includes(t));
    return { ...parsed, mainDiagramTypes: sanitized.length ? sanitized : [...MAIN_DIAGRAM_TYPES] };
  });

  // --- Persistence ---
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

  // --- Resizing Logic ---
  const startResize = (index: number) => {
    if (appState.isPreviewFullScreen) return;
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

  const setMainDiagramTypes = useCallback((types: DiagramType[]) => {
    const sanitized = types
      .filter((t): t is DiagramType => t !== 'auto')
      .filter((t) => (DIAGRAM_TYPES as readonly string[]).includes(t));
    setAppState(prev => ({
      ...prev,
      mainDiagramTypes: sanitized.length ? sanitized : [...MAIN_DIAGRAM_TYPES],
    }));
  }, []);

  const toggleTheme = useCallback(() => {
    setAppState(prev => ({ ...prev, theme: prev.theme === 'light' ? 'dark' : 'light' }));
  }, []);

  const setLanguage = useCallback((lang: string) => {
    setAppState(prev => ({ ...prev, language: lang }));
  }, []);

  const setAnalyzeLanguage = useCallback((lang: string) => {
    setAppState(prev => ({ ...prev, analyzeLanguage: lang }));
  }, []);

  const setLLMTimeoutMs = useCallback((timeoutMs: number) => {
    setAppState(prev => ({ ...prev, llmTimeoutMs: timeoutMs }));
  }, []);

  const togglePreviewFullScreen = useCallback(() => {
    setAppState(prev => ({
      ...prev,
      isPreviewFullScreen: !prev.isPreviewFullScreen,
      isResizing: null,
    }));
  }, []);

  return {
    appState,
    setAppState, // Exposed if needed for other direct updates
    startResize,
    setDiagramType,
    setMainDiagramTypes,
    toggleTheme,
    setLanguage,
    setAnalyzeLanguage,
    setLLMTimeoutMs,
    togglePreviewFullScreen,
  };
};
