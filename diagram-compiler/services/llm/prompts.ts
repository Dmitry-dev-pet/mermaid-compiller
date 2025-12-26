import type { DiagramType } from '../../types';
import type { PromptLanguage } from './prompts/types';
import { ANALYZE_TEMPLATES } from './prompts/analyze';
import { CHAT_TEMPLATES } from './prompts/chat';
import { CHAT_NOTEBOOK_TEMPLATES } from './prompts/chatNotebook';
import { FIX_TEMPLATES } from './prompts/fix';
import { GENERATE_TEMPLATES } from './prompts/generate';
import { PLAN_NOTEBOOK_TEMPLATES } from './prompts/planNotebook';

export type PromptMode = 'generate' | 'fix' | 'chat' | 'chat_notebook' | 'analyze' | 'plan_notebook';

type PromptArgs = {
  diagramType?: DiagramType;
  docsContext: string;
  language: string;
};

type TemplateValues = {
  typeRule: string;
  languageInstruction: string;
  docsContext: string;
};

const PROMPT_TEMPLATES: Record<PromptLanguage, Record<PromptMode, string>> = {
  English: {
    generate: GENERATE_TEMPLATES.English,
    fix: FIX_TEMPLATES.English,
    chat: CHAT_TEMPLATES.English,
    chat_notebook: CHAT_NOTEBOOK_TEMPLATES.English,
    analyze: ANALYZE_TEMPLATES.English,
    plan_notebook: PLAN_NOTEBOOK_TEMPLATES.English,
  },
  Russian: {
    generate: GENERATE_TEMPLATES.Russian,
    fix: FIX_TEMPLATES.Russian,
    chat: CHAT_TEMPLATES.Russian,
    chat_notebook: CHAT_NOTEBOOK_TEMPLATES.Russian,
    analyze: ANALYZE_TEMPLATES.Russian,
    plan_notebook: PLAN_NOTEBOOK_TEMPLATES.Russian,
  },
};

const renderTemplate = (template: string, values: TemplateValues) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: keyof TemplateValues) => values[key] ?? '');

const resolvePromptLanguage = (language: string): PromptLanguage => {
  const normalized = language.trim().toLowerCase();
  if (normalized.includes('ru') || normalized.includes('рус')) return 'Russian';
  if (normalized.includes('en') || normalized.includes('анг')) return 'English';
  return language === 'Russian' ? 'Russian' : 'English';
};

const shouldIncludeLanguageInstruction = (language: string) => language !== 'auto';

const getLanguageInstruction = (language: string, promptLanguage: PromptLanguage) => {
  if (!shouldIncludeLanguageInstruction(language)) return '';
  return promptLanguage === 'Russian'
    ? '\nВАЖНО: отвечай на русском.'
    : '\nIMPORTANT: Respond in English.';
};

const getDiagramTypeRule = (
  diagramType: DiagramType | undefined,
  mode: 'generate' | 'chat',
  promptLanguage: PromptLanguage
) => {
  if (diagramType) {
    if (promptLanguage === 'Russian') {
      return mode === 'generate'
        ? `Вы ДОЛЖНЫ создать диаграмму типа ${diagramType}.`
        : `Предпочитаемый тип диаграммы: ${diagramType}.`;
    }

    return mode === 'generate'
      ? `You MUST generate a ${diagramType} diagram.`
      : `Preferred Diagram Type: ${diagramType}.`;
  }

  return promptLanguage === 'Russian'
    ? "Если тип не указан, используй 'flowchart TD'."
    : "Default to 'flowchart TD' if unspecified.";
};

export const buildSystemPrompt = (mode: PromptMode, args: PromptArgs): string => {
  const promptLanguage = resolvePromptLanguage(args.language);
  const template = PROMPT_TEMPLATES[promptLanguage][mode];

  const typeRule = mode === 'generate' || mode === 'chat'
    ? getDiagramTypeRule(args.diagramType, mode, promptLanguage)
    : '';

  const languageInstruction = getLanguageInstruction(args.language, promptLanguage);
  const docsContext = args.docsContext;

  return renderTemplate(template, {
    typeRule,
    languageInstruction,
    docsContext,
  });
};
