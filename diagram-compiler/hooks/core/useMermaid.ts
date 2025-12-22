import { useState, useCallback } from 'react';
import { MermaidState } from '../../types';
import { DEFAULT_MERMAID_STATE } from '../../constants';
import { validateMermaid } from '../../services/mermaidService';

export const useMermaid = () => {
  const [mermaidState, setMermaidState] = useState<MermaidState>(DEFAULT_MERMAID_STATE);

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

  return {
    mermaidState,
    setMermaidState,
    handleMermaidChange
  };
};
