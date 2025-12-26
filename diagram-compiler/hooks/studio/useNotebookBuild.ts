import { useCallback } from 'react';
import type { DiagramIntent, DiagramType, Message, NotebookPlan } from '../../types';
import { detectLanguage } from '../../utils';
import { normalizeIntentText } from '../../utils/intent';
import { AUTO_FIX_MAX_ATTEMPTS, LLM_TIMEOUT_RETRIES, NOTEBOOK_DIAGRAM_MAX_ATTEMPTS } from '../../constants';
import { extractMermaidBlocksFromMarkdown, extractMermaidCode, replaceMermaidBlockInMarkdown, validateMermaid } from '../../services/mermaidService';
import { fixDiagram, generateDiagram, planNotebook } from '../../services/llmService';
import { runAutoFixLoop } from './autoFix';
import { normalizeNotebookPlan, parseNotebookPlan } from '../../services/notebookPlanService';
import { runLLMRequest } from '../../services/llmRequestRunner';
import { TimeoutError } from '../../services/llmTimeout';
import { formatTimeoutRetryMessage } from './stepMessageUtils';

const NOTEBOOK_STYLE_CONSTRAINT_EN = 'No styling directives or color instructions (no theme/look/init/colors).';
const NOTEBOOK_STYLE_CONSTRAINT_RU = 'Без стилевых директив и цветовых инструкций (без theme/look/init/colors).';

type NotebookBuildDeps = {
  aiConfig: import('../../types').AIConfig;
  appState: import('../../types').AppState;
  connectionState: import('../../types').ConnectionState;
  messages: Message[];
  diagramIntent: DiagramIntent | null;
  addMessage: (role: 'user' | 'assistant', content: string, mode?: Message['mode']) => Message;
  safeAppendTimeStep: (args: {
    type: import('../../services/history/types').TimeStepType;
    messages: Message[];
    meta?: import('../../services/history/types').StepMeta;
    nextMermaid?: Pick<import('../../types').MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'> | null;
    setCurrentRevisionId?: string | null;
  }) => Promise<void>;
  setIsProcessing: (value: boolean) => void;
  setMarkdownMermaidActiveIndex: (value: number) => void;
  setEditorTab: (tab: import('../../types').EditorTab) => void;
  setDiagramTypeAndWait: (type: DiagramType) => Promise<void>;
  setMermaidState: (updater: (prev: import('../../types').MermaidState) => import('../../types').MermaidState) => void;
  getDocsContext: (mode: import('../../types').DocsMode) => Promise<string>;
  loadBuildDocsEntries: (type: DiagramType) => Promise<unknown>;
};

const formatNotebookGlossary = (plan: NotebookPlan, language: string): string => {
  if (!plan.glossary?.length) return '';
  const lines = plan.glossary.map((item) => {
    const term = item.term?.trim() || '';
    if (!term) return '';
    const meaning = item.meaning?.trim();
    const aliases = item.aliases?.filter(Boolean);
    const aliasText = aliases?.length ? ` (${aliases.join(', ')})` : '';
    return `- ${term}${meaning ? `: ${meaning}` : ''}${aliasText}`;
  }).filter(Boolean);
  if (!lines.length) return '';
  const title = language === 'Russian' ? 'Глоссарий' : 'Glossary';
  return `${title}:\n${lines.join('\n')}`;
};

const formatNotebookConstraints = (language: string): string => {
  const title = language === 'Russian' ? 'Ограничения' : 'Constraints';
  const constraint = language === 'Russian' ? NOTEBOOK_STYLE_CONSTRAINT_RU : NOTEBOOK_STYLE_CONSTRAINT_EN;
  return `${title}:\n- ${constraint}`;
};

const formatNotebookChatPrompt = (args: {
  diagram: NotebookPlan['diagrams'][number];
  plan: NotebookPlan;
  language: string;
}): string => {
  const { diagram, plan, language } = args;
  const title = language === 'Russian' ? 'chat.md' : 'chat.md';
  const buildTitle = language === 'Russian' ? 'Входной промпт' : 'Input prompt';
  const glossary = formatNotebookGlossary(plan, language);
  const constraints = formatNotebookConstraints(language);
  return [
    title,
    '',
    `${buildTitle}:`,
    diagram.buildPrompt.trim(),
    '',
    glossary,
    '',
    constraints,
  ].filter((line) => line.trim().length > 0).join('\n');
};

const formatNotebookRawIntent = (args: {
  diagram: NotebookPlan['diagrams'][number];
  plan: NotebookPlan;
  language: string;
}): string => {
  const { diagram, plan, language } = args;
  const constraints = language === 'Russian' ? NOTEBOOK_STYLE_CONSTRAINT_RU : NOTEBOOK_STYLE_CONSTRAINT_EN;
  const payload = {
    title: diagram.title,
    diagramType: diagram.diagramType,
    goal: diagram.goal,
    buildPrompt: diagram.buildPrompt,
    acceptance: diagram.acceptance ?? [],
    glossary: plan.glossary ?? [],
    constraints: [constraints],
  };
  const label = language === 'Russian' ? 'raw-intent.md' : 'raw-intent.md';
  return `${label}\n\n${JSON.stringify(payload, null, 2)}`;
};

const resolveNotebookPrompt = (messages: Message[], diagramIntent: DiagramIntent | null, prompt?: string) => {
  const trimmed = prompt?.trim() ?? '';
  if (trimmed) return { content: trimmed, source: 'build' as const };
  if (diagramIntent?.content.trim()) {
    return { content: diagramIntent.content, source: diagramIntent.source };
  }
  const fallback = messages
    .slice()
    .reverse()
    .find((m) => m.id !== 'init' && m.role === 'user' && m.content.trim().length > 0)?.content;
  if (fallback) return { content: fallback, source: 'fallback' as const };
  return null;
};

const buildNotebookMarkdown = (plan: NotebookPlan) => {
  const title = plan.title?.trim() || 'Diagram notebook';
  const sections = plan.diagrams.map((diagram, index) => {
    const heading = diagram.title?.trim() || `Diagram ${index + 1}`;
    return `## ${heading}\n\n\`\`\`mermaid\n\`\`\``;
  });
  return `# ${title}\n\n${sections.join('\n\n')}\n`;
};

const replaceNotebookBlock = (markdown: string, index: number, code: string) => {
  const blocks = extractMermaidBlocksFromMarkdown(markdown);
  const block = blocks[index];
  if (!block) return markdown;
  return replaceMermaidBlockInMarkdown(markdown, block, code);
};

const requestNotebookPlan = async (args: {
  aiConfig: import('../../types').AIConfig;
  prompt: string;
  requestedN: number | null;
  docs: string;
  language: string;
  addMessage: NotebookBuildDeps['addMessage'];
}): Promise<NotebookPlan> => {
  const plannerMessage: Message = {
    id: `notebook-plan-${Date.now()}`,
    role: 'user',
    content: `userRequest: """${args.prompt}"""\nrequestedN: ${args.requestedN ?? 'null'}`,
    timestamp: Date.now(),
  };
  const rawPlan = await runLLMRequest({
    task: 'planner',
    run: () => planNotebook([plannerMessage], args.aiConfig, args.docs, args.language),
    retries: LLM_TIMEOUT_RETRIES,
    onTimeout: (notice) => {
      args.addMessage(
        'assistant',
        formatTimeoutRetryMessage('Planner', notice.attempt, notice.maxAttempts),
        'build'
      );
    },
  });
  const parsedPlan = parseNotebookPlan(rawPlan);
  const normalized = normalizeNotebookPlan(parsedPlan, args.requestedN);
  if (args.requestedN && normalized.diagrams.length !== args.requestedN) {
    throw new Error(`Planner returned ${normalized.diagrams.length} diagrams; expected ${args.requestedN}.`);
  }
  return normalized;
};

export const useNotebookBuild = (deps: NotebookBuildDeps) => {
  const applyNotebookMarkdown = useCallback((nextMarkdown: string) => {
    deps.setMermaidState((prev) => ({
      ...prev,
      code: nextMarkdown,
      isValid: true,
      lastValidCode: nextMarkdown,
      errorMessage: undefined,
      errorLine: undefined,
      status: nextMarkdown.trim() ? 'valid' : 'empty',
      source: 'compiled',
    }));
  }, [deps]);

  const handleNotebookBuild = useCallback(async (text?: string) => {
    if (deps.connectionState.status !== 'connected') {
      await deps.safeAppendTimeStep({
        type: 'build',
        messages: [deps.addMessage('assistant', "I'm offline. Connect AI to generate diagrams.", 'build')],
        meta: { mode: 'notebook', error: 'offline' },
      });
      return;
    }

    const prompt = resolveNotebookPrompt(deps.messages, deps.diagramIntent, text);
    if (!prompt) {
      await deps.safeAppendTimeStep({
        type: 'build',
        messages: [deps.addMessage('assistant', 'Nothing to build yet. Use Chat to define intent.', 'build')],
        meta: { mode: 'notebook', error: 'no_intent' },
      });
      return;
    }

    const originalDiagramType = deps.appState.diagramType;
    const requestedN = deps.appState.notebookBuildCount ?? null;
    const language = deps.appState.language !== 'auto' ? deps.appState.language : detectLanguage(prompt.content);

    deps.setIsProcessing(true);
    try {
      const docs = await deps.getDocsContext('build');
      const plan = await requestNotebookPlan({
        aiConfig: deps.aiConfig,
        prompt: prompt.content,
        requestedN,
        docs,
        language,
        addMessage: deps.addMessage,
      });

      deps.addMessage('assistant', `Notebook plan: ${plan.diagrams.length} diagrams.`, 'build');

      let currentMarkdown = buildNotebookMarkdown(plan);
      applyNotebookMarkdown(currentMarkdown);
      deps.setMarkdownMermaidActiveIndex(0);
      deps.setEditorTab('markdown_mermaid');

      for (let i = 0; i < plan.diagrams.length; i += 1) {
        const diagram = plan.diagrams[i];
        const blockMessages: Message[] = [];
        const targetDiagramType = diagram.diagramType === 'other' ? originalDiagramType : diagram.diagramType;
        const chatPrompt = formatNotebookChatPrompt({ diagram, plan, language });
        const rawIntent = formatNotebookRawIntent({ diagram, plan, language });

        deps.setMarkdownMermaidActiveIndex(i);
        await deps.setDiagramTypeAndWait(targetDiagramType);
        await deps.loadBuildDocsEntries(targetDiagramType);
        const blockDocs = await deps.getDocsContext('build');

        blockMessages.push(
          deps.addMessage('user', chatPrompt, 'system')
        );
        blockMessages.push(
          deps.addMessage(
            'assistant',
            `Notebook build: блок ${i + 1} из ${plan.diagrams.length} (${targetDiagramType}).`,
            'build'
          )
        );

        let success = false;
        let attempts = 0;
        let lastError = '';
        while (attempts < NOTEBOOK_DIAGRAM_MAX_ATTEMPTS && !success) {
          attempts += 1;
          blockMessages.push(
            deps.addMessage(
              'assistant',
              `Notebook build: блок ${i + 1}, попытка ${attempts}/${NOTEBOOK_DIAGRAM_MAX_ATTEMPTS}...`,
              'build'
            )
          );

          const intentText = normalizeIntentText(diagram.buildPrompt || '');
          if (!intentText) {
            lastError = 'empty_build_prompt';
            blockMessages.push(
              deps.addMessage('assistant', `Attempt ${attempts}: empty build prompt.`, 'build')
            );
            continue;
          }

          try {
            const intentMessage: Message = {
              id: `notebook-intent-${i + 1}-${attempts}`,
              role: 'user',
              content: `Intent:\n${intentText}`,
              timestamp: Date.now(),
            };
            const rawCode = await runLLMRequest({
              task: 'notebook-build',
              run: () => generateDiagram(
                [intentMessage],
                deps.aiConfig,
                targetDiagramType,
                blockDocs,
                language
              ),
              retries: 1,
            });
            const cleanCode = extractMermaidCode(rawCode).trim();
            if (!cleanCode) {
              lastError = 'no_mermaid_code';
              blockMessages.push(
                deps.addMessage('assistant', `Attempt ${attempts}: no Mermaid code returned.`, 'build')
              );
              continue;
            }

            const initialValidation = await validateMermaid(cleanCode, { logError: false });
            const { code: currentCode, validation, attempts: autoFixAttempts } = await runAutoFixLoop({
              initialCode: cleanCode,
              initialValidation,
              maxAttempts: AUTO_FIX_MAX_ATTEMPTS,
              validate: (code) => validateMermaid(code, { logError: false }),
              fix: async (code, errorMessage) => {
                const fixedRaw = await runLLMRequest({
                  task: 'notebook-fix',
                  run: () => fixDiagram(code, errorMessage, deps.aiConfig, blockDocs, language),
                  retries: 1,
                });
                return extractMermaidCode(fixedRaw);
              },
              onIteration: (code) => {
                currentMarkdown = replaceNotebookBlock(currentMarkdown, i, code);
                applyNotebookMarkdown(currentMarkdown);
              },
            });

            currentMarkdown = replaceNotebookBlock(currentMarkdown, i, currentCode);
            applyNotebookMarkdown(currentMarkdown);

            if (validation.isValid) {
              success = true;
              blockMessages.push(
                deps.addMessage(
                  'assistant',
                  `Notebook build: блок ${i + 1} готов.${autoFixAttempts ? ` Auto-fix ${autoFixAttempts}.` : ''}`,
                  'build'
                )
              );
            } else {
              lastError = validation.errorMessage || 'invalid_mermaid';
              blockMessages.push(
                deps.addMessage(
                  'assistant',
                  `Attempt ${attempts}: Mermaid still invalid.${autoFixAttempts ? ` Auto-fix ${autoFixAttempts}.` : ''}`,
                  'build'
                )
              );
            }
          } catch (e: unknown) {
            lastError = e instanceof Error ? e.message : String(e);
            if (e instanceof TimeoutError && attempts < NOTEBOOK_DIAGRAM_MAX_ATTEMPTS) {
              blockMessages.push(
                deps.addMessage(
                  'assistant',
                  formatTimeoutRetryMessage('Notebook build', attempts + 1, NOTEBOOK_DIAGRAM_MAX_ATTEMPTS),
                  'build'
                )
              );
            }
            blockMessages.push(
              deps.addMessage(
                'assistant',
                `Attempt ${attempts} failed (${deps.aiConfig.selectedModelId ? `model=${deps.aiConfig.selectedModelId}` : 'model=unknown'}): ${lastError}`,
                'build'
              )
            );
          }
        }

        if (!success) {
          blockMessages.push(
            deps.addMessage(
              'assistant',
              `Notebook build: блок ${i + 1} невалиден после ${NOTEBOOK_DIAGRAM_MAX_ATTEMPTS} попыток.`,
              'build'
            )
          );
        }

        await deps.safeAppendTimeStep({
          type: 'build',
          messages: blockMessages,
          nextMermaid: {
            code: currentMarkdown,
            isValid: true,
            errorMessage: undefined,
            errorLine: undefined,
          },
          meta: {
            mode: 'notebook',
            blockIndex: i,
            diagramType: targetDiagramType,
            attempts,
            success,
            error: success ? undefined : lastError,
            notebookPlanIntent: rawIntent,
          },
        });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      await deps.safeAppendTimeStep({
        type: 'build',
        messages: [deps.addMessage('assistant', `Notebook build failed: ${message}`, 'build')],
        meta: { mode: 'notebook', error: message },
      });
    } finally {
      await deps.setDiagramTypeAndWait(originalDiagramType);
      deps.setIsProcessing(false);
    }
  }, [
    applyNotebookMarkdown,
    deps,
  ]);

  return { handleNotebookBuild };
};
