import React from 'react';
import Editor from 'react-simple-code-editor';

interface CodeEditorPanelProps {
  lineNumbersRef: React.RefObject<HTMLDivElement>;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  lineNumbers: number[];
  errorLine: number | null;
  onScroll: () => void;
  editorValue: string;
  onValueChange: (value: string) => void;
  highlight: (code: string) => string;
  isReadOnly: boolean;
}

const CodeEditorPanel: React.FC<CodeEditorPanelProps> = ({
  lineNumbersRef,
  scrollContainerRef,
  lineNumbers,
  errorLine,
  onScroll,
  editorValue,
  onValueChange,
  highlight,
  isReadOnly,
}) => {
  return (
    <div className="flex-1 relative flex overflow-hidden">
      <div
        ref={lineNumbersRef}
        className="w-10 bg-slate-50 dark:bg-[#21252b] border-r border-slate-200 dark:border-[#181a1f] text-right pr-2 pt-4 text-xs font-mono text-slate-400 dark:text-slate-500 select-none overflow-hidden"
      >
        {lineNumbers.map((n) => (
          <div
            key={n}
            className={`h-5 leading-5 ${
              errorLine !== null && n === errorLine
                ? 'text-red-600 dark:text-red-400 font-bold bg-red-100 dark:bg-red-900/20'
                : ''
            }`}
          >
            {n}
          </div>
        ))}
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto bg-slate-50 dark:bg-[#282c34]"
      >
        <Editor
          value={editorValue}
          onValueChange={onValueChange}
          highlight={highlight}
          padding={16}
          textareaClassName={`focus:outline-none ${isReadOnly ? 'cursor-default' : ''}`}
          readOnly={isReadOnly}
          style={{
            fontFamily: '"Fira code", "Fira Mono", monospace',
            fontSize: 12,
            backgroundColor: 'transparent',
            minHeight: '100%',
            lineHeight: '20px',
          }}
        />
      </div>
    </div>
  );
};

export default CodeEditorPanel;
