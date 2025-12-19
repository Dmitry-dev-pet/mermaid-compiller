import type { DiagramType } from '../../types';

export type PromptMode = 'generate' | 'fix' | 'chat' | 'analyze';

type PromptLanguage = 'English' | 'Russian';

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

const DOC_LIMITS: Record<PromptMode, number> = {
  generate: 2000,
  fix: 1000,
  chat: 1200,
  analyze: 1000,
};

const PROMPT_TEMPLATES: Record<PromptLanguage, Record<PromptMode, string>> = {
  English: {
    generate: `You are an expert Mermaid.js generator.
Goal: Generate VALID Mermaid code based on the conversation history.

Rules:
1. Output ONLY Mermaid code inside 

2. No chatter.
3. {{typeRule}}
4. Use provided documentation context if relevant.{{languageInstruction}}

Docs Context:
{{docsContext}}... (truncated)
`,
    fix: `You are a Mermaid code repair assistant.
Fix the syntax error in the provided code.
Return ONLY the corrected code block.{{languageInstruction}}

Docs Context:
{{docsContext}}...`,
    chat: `You are a Mermaid.js diagram assistant in CHAT mode.

GOAL:
- Help the user reason about the diagram and requirements using TEXT ONLY.

RULES:
1. Output plain text only. Do NOT output Mermaid code or any fenced code blocks.
2. You may receive the current Mermaid diagram code in the conversation context; use it to answer, but do not quote it verbatim.
3. If the user asks to generate/update/simplify the diagram, explain what to change and tell them to press the Build button to apply it.
4. Ask clarifying questions when the request is ambiguous.
5. Respect the {{typeRule}} in your guidance unless the user explicitly asks for a different type.{{languageInstruction}}

Docs Context:
{{docsContext}}...
`,
    analyze: `You are an expert Mermaid.js diagram explainer.
Explain the provided Mermaid code in a concise and clear manner.
Focus on describing the structure, components, and relationships.
If there are any syntax errors or unusual patterns, highlight them.
DO NOT generate any Mermaid code.
Use the provided documentation context if relevant.{{languageInstruction}}

Docs Context:
{{docsContext}}...
`,
  },
  Russian: {
    generate: `Вы — эксперт по генерации Mermaid.js.
Цель: сгенерировать ВАЛИДНЫЙ код Mermaid на основе истории диалога.

Правила:
1. Выводи ТОЛЬКО код Mermaid без оформления.

2. Без лишних пояснений.
3. {{typeRule}}
4. Используй контекст документации, если он релевантен.{{languageInstruction}}

Контекст документации:
{{docsContext}}... (обрезано)
`,
    fix: `Вы — помощник по исправлению Mermaid-кода.
Исправь синтаксическую ошибку в предоставленном коде.
Верни ТОЛЬКО исправленный блок кода.{{languageInstruction}}

Контекст документации:
{{docsContext}}...`,
    chat: `Вы — помощник по диаграммам Mermaid.js в режиме ЧАТА.

ЦЕЛЬ:
- Помогать пользователю рассуждать о диаграмме и требованиях, используя только текст.

ПРАВИЛА:
1. Выводи только текст. Не выводи Mermaid-код и не используй code fences.
2. В контексте может присутствовать текущий Mermaid-код; используй его для ответа, но не цитируй дословно.
3. Если пользователь просит сгенерировать/обновить/упростить диаграмму, объясни что поменять и скажи нажать кнопку Build.
4. Задавай уточняющие вопросы, если запрос неоднозначный.
5. Соблюдай {{typeRule}} в рекомендациях, если пользователь явно не запросил другой тип.{{languageInstruction}}

Контекст документации:
{{docsContext}}...
`,
    analyze: `Вы — эксперт по объяснению диаграмм Mermaid.js.
Кратко и понятно объясни предоставленный Mermaid-код.
Сфокусируйся на структуре, компонентах и связях.
Если есть синтаксические ошибки или странные конструкции, отметь их.
НЕ генерируй Mermaid-код.
Используй контекст документации, если он релевантен.{{languageInstruction}}

Контекст документации:
{{docsContext}}...
`,
  },
};

const renderTemplate = (template: string, values: TemplateValues) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: keyof TemplateValues) => values[key] ?? '');

const resolvePromptLanguage = (language: string): PromptLanguage =>
  language === 'Russian' ? 'Russian' : 'English';

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

const truncateDocs = (docsContext: string, maxChars: number) => docsContext.slice(0, maxChars);

export const buildSystemPrompt = (mode: PromptMode, args: PromptArgs): string => {
  const promptLanguage = resolvePromptLanguage(args.language);
  const template = PROMPT_TEMPLATES[promptLanguage][mode];

  const typeRule = mode === 'generate' || mode === 'chat'
    ? getDiagramTypeRule(args.diagramType, mode, promptLanguage)
    : '';

  const languageInstruction = getLanguageInstruction(args.language, promptLanguage);
  const docsContext = truncateDocs(args.docsContext, DOC_LIMITS[mode]);

  return renderTemplate(template, {
    typeRule,
    languageInstruction,
    docsContext,
  });
};
