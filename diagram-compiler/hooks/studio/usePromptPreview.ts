import { useCallback, useState } from 'react';
import type { DiagramIntent, DiagramType, DocsMode, LLMRequestPreview, Message, PromptPreviewMode, PromptPreviewTab, PromptTokenCounts } from '../../types';
import { buildSystemPrompt } from '../../services/llm/prompts';
import { detectLanguage } from '../../utils';
import { validateMermaidDiagramCode } from '../../services/mermaidService';
import { normalizeIntentText } from '../../utils/intent';

type ResolveActiveMermaidContext = () => {
  code: string;
  errorMessage?: string;
  diagramType: DiagramType;
  isValid?: boolean;
};

type UsePromptPreviewArgs = {
  diagramType: DiagramType;
  analyzeLanguage: string;
  appLanguage: string;
  messages: Message[];
  diagramIntent: DiagramIntent | null;
  resolveActiveMermaidContext: ResolveActiveMermaidContext;
  getDocsContext: (mode: DocsMode) => Promise<string>;
};

const DEFAULT_PREVIEW_BY_MODE: Record<PromptPreviewMode, PromptPreviewTab | null> = {
  chat: null,
  build: null,
  analyze: null,
  fix: null,
};

export const usePromptPreview = ({
  diagramType,
  analyzeLanguage,
  appLanguage,
  messages,
  diagramIntent,
  resolveActiveMermaidContext,
  getDocsContext,
}: UsePromptPreviewArgs) => {
  const [promptPreviewByMode, setPromptPreviewByMode] = useState<Record<PromptPreviewMode, PromptPreviewTab | null>>(
    DEFAULT_PREVIEW_BY_MODE
  );

  const resetPromptPreview = useCallback(() => {
    setPromptPreviewByMode(DEFAULT_PREVIEW_BY_MODE);
  }, []);

  const resolvePreviewLanguage = useCallback((inputText: string, relevantMessages: Message[]) => {
    if (analyzeLanguage && analyzeLanguage !== 'auto') {
      return analyzeLanguage;
    }
    if (appLanguage && appLanguage !== 'auto') {
      return appLanguage;
    }
    const basis =
      inputText.trim() ||
      relevantMessages
        .slice()
        .reverse()
        .find((m) => m.role === 'user' && m.content.trim().length > 0)?.content ||
      '';
    return basis ? detectLanguage(basis) : 'English';
  }, [analyzeLanguage, appLanguage]);

  const resolvePreviewAnalyzeLanguage = useCallback((relevantMessages: Message[]) => {
    if (analyzeLanguage && analyzeLanguage !== 'auto') {
      return analyzeLanguage;
    }
    if (appLanguage && appLanguage !== 'auto') {
      return appLanguage;
    }
    return resolvePreviewLanguage('', relevantMessages);
  }, [analyzeLanguage, appLanguage, resolvePreviewLanguage]);

  const getDiagramContextMessage = useCallback((): Message | null => {
    const { code } = resolveActiveMermaidContext();
    if (!code) return null;

    return {
      id: 'preview-diagram-context',
      role: 'user',
      content: `Current Mermaid diagram code (context only; do not output Mermaid code in Chat mode and do not repeat this verbatim):
\`\`\`mermaid
${code}
\`\`\``,
      timestamp: Date.now(),
    };
  }, [resolveActiveMermaidContext]);

  const buildPromptPreview = useCallback(async (mode: PromptPreviewMode, inputText: string): Promise<LLMRequestPreview> => {
    const trimmed = inputText.trim();
    const relevantMessages = messages.filter((m) => m.id !== 'init');

    if (mode === 'analyze' || mode === 'fix') {
      const { code, errorMessage, diagramType: activeDiagramType, isValid } = resolveActiveMermaidContext();
      const docsContext = await getDocsContext(mode);
      const language =
        mode === 'analyze'
          ? resolvePreviewAnalyzeLanguage(relevantMessages)
          : resolvePreviewLanguage(trimmed, relevantMessages);
      const systemPrompt = buildSystemPrompt(mode, {
        diagramType: activeDiagramType,
        docsContext,
        language,
      });
      const systemPromptRedacted = buildSystemPrompt(mode, {
        diagramType: activeDiagramType,
        docsContext: 'Documentation context redacted.',
        language,
      });

      if (!code) {
        return {
          mode,
          diagramType: activeDiagramType,
          language,
          systemPrompt,
          systemPromptRedacted,
          docsContext,
          messages: [],
          error: `No Mermaid diagram available for ${mode}.`,
        };
      }

      if (mode === 'analyze') {
        const analyzeMessage: Message = {
          id: 'preview-analyze-message',
          role: 'user',
          content: `Analyze and explain the following Mermaid code:

\`\`\`mermaid
${code}
\`\`\`
`,
          timestamp: Date.now(),
        };

        return {
          mode,
          diagramType: activeDiagramType,
          language,
          systemPrompt,
          systemPromptRedacted,
          docsContext,
          messages: [analyzeMessage],
        };
      }

      let resolvedError = errorMessage;
      let resolvedValid = isValid;
      if (mode === 'fix' && (!resolvedError || resolvedValid === undefined)) {
        const validation = await validateMermaidDiagramCode(code);
        resolvedError = validation.errorMessage;
        resolvedValid = validation.isValid;
      }

      if (mode === 'fix' && resolvedValid !== false) {
        return {
          mode,
          diagramType: activeDiagramType,
          language,
          systemPrompt,
          systemPromptRedacted,
          docsContext,
          messages: [],
          error: 'Diagram is valid. Nothing to fix.',
        };
      }

      const fixMessage: Message = {
        id: 'preview-fix-message',
        role: 'user',
        content: `Code:


${code}


Error: ${resolvedError || 'Unknown error'}

Fix it.`,
        timestamp: Date.now(),
      };

      return {
        mode,
        diagramType: activeDiagramType,
          language,
          systemPrompt,
          systemPromptRedacted,
          docsContext,
          messages: [fixMessage],
        };
    }

    const docsContext = await getDocsContext(mode);
    const language = resolvePreviewLanguage(trimmed, relevantMessages);
    const promptMode = mode === 'build' ? 'generate' : 'chat';
    const systemPrompt = buildSystemPrompt(promptMode, {
      diagramType,
      docsContext,
      language,
    });
    const systemPromptRedacted = buildSystemPrompt(promptMode, {
      diagramType,
      docsContext: 'Documentation context redacted.',
      language,
    });

    let previewMessages = [...relevantMessages];
    if (mode === 'build') {
      const intentText = normalizeIntentText(trimmed || diagramIntent?.content.trim() || '');
      if (!intentText) {
        return {
          mode,
          diagramType,
          language,
          systemPrompt,
          systemPromptRedacted,
          docsContext,
          messages: [],
          error: 'No intent available. Use Chat first or provide a Build prompt.',
        };
      }
      previewMessages = [{
        id: 'preview-intent-message',
        role: 'user',
        content: `Intent:\n${intentText}`,
        timestamp: Date.now(),
      }];
    } else if (trimmed) {
      previewMessages.push({
        id: 'preview-user-message',
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      });
    }

    const diagramContext = getDiagramContextMessage();
    const llmMessages = diagramContext ? [...previewMessages, diagramContext] : previewMessages;

    return {
      mode,
      diagramType,
      language,
      systemPrompt,
      systemPromptRedacted,
      docsContext,
      messages: llmMessages,
    };
  }, [
    diagramIntent?.content,
    diagramType,
    getDocsContext,
    getDiagramContextMessage,
    messages,
    resolveActiveMermaidContext,
    resolvePreviewAnalyzeLanguage,
    resolvePreviewLanguage,
  ]);

  const setPromptPreview = useCallback((
    mode: PromptPreviewMode,
    title: string,
    redactedContent: string,
    rawContent: string,
    tokenCounts?: PromptTokenCounts,
    systemPrompt?: string,
    systemPromptRedacted?: string,
    language?: string
  ) => {
    setPromptPreviewByMode((prev) => ({
      ...prev,
      [mode]: {
        title,
        content: redactedContent,
        redactedContent,
        rawContent,
        systemPrompt,
        systemPromptRedacted,
        language,
        updatedAt: Date.now(),
        tokenCounts,
      },
    }));
  }, []);

  return {
    buildPromptPreview,
    promptPreviewByMode,
    resetPromptPreview,
    setPromptPreview,
  };
};
