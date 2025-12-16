import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { MermaidState } from '../types';

interface PreviewColumnProps {
  mermaidState: MermaidState;
  theme: 'light' | 'dark';
}

const PreviewColumn: React.FC<PreviewColumnProps> = ({ mermaidState, theme }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');

  useEffect(() => {
    const renderDiagram = async () => {
      if (!mermaidState.isValid || !mermaidState.code.trim()) {
        if (!mermaidState.code.trim()) setSvgContent('');
        return;
      }

      if (containerRef.current) {
        try {
          // Unique ID for mermaid container
          const id = `mermaid-${Date.now()}`;
          const { svg } = await mermaid.render(id, mermaidState.code);
          setSvgContent(svg);
        } catch (error) {
          console.error("Render failed", error);
        }
      }
    };

    const timer = setTimeout(renderDiagram, 200); // Debounce render
    return () => clearTimeout(timer);
  }, [mermaidState.code, mermaidState.isValid, theme]);

  return (
    <div className="h-full flex flex-col bg-slate-50/30 dark:bg-slate-900/30">
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        Preview
      </div>
      
      <div className="flex-1 overflow-auto p-8 flex items-center justify-center relative">
        {mermaidState.status === 'invalid' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10">
            <div className="text-center p-6 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg max-w-sm">
              <h3 className="text-red-700 dark:text-red-400 font-medium mb-1">Cannot render diagram</h3>
              <p className="text-xs text-red-600 dark:text-red-300 font-mono text-left bg-white dark:bg-slate-950 p-2 rounded border border-red-100 dark:border-red-900 overflow-auto max-h-32">
                {mermaidState.errorMessage || "Syntax Error"}
              </p>
            </div>
          </div>
        )}

        {!mermaidState.code.trim() && (
          <div className="text-slate-400 dark:text-slate-500 text-sm">No valid diagram to display.</div>
        )}

        {/* The Diagram */}
        <div 
          ref={containerRef}
          className="w-full h-full flex items-center justify-center min-h-[300px]"
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>
    </div>
  );
};

export default PreviewColumn;
