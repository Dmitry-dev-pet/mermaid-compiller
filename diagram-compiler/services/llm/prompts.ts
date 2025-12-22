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

const PROMPT_TEMPLATES: Record<PromptLanguage, Record<PromptMode, string>> = {
  English: {
    generate: `# Role
You are an expert Mermaid.js generator.

# Goal
Generate VALID Mermaid code based on the provided intent.

# Rules
- Output ONLY Mermaid code (no fences, no prose).
- The input is an intent summary, not a full chat transcript.
- {{typeRule}}
- Use provided documentation context if relevant.{{languageInstruction}}

# Docs Context
{{docsContext}}
`,
    fix: `You are a Mermaid code repair assistant.
Fix the syntax error in the provided code.
Return ONLY the corrected code block.{{languageInstruction}}

Docs Context:
{{docsContext}}`,
    chat: `# Role
You are a Mermaid.js diagram assistant in CHAT mode.

# Goal
Help the user clarify requirements and produce a structured intent using TEXT ONLY.

# Rules
- Output plain text only. Do NOT output Mermaid code or any fenced code blocks.
- You may receive the current Mermaid diagram code in the conversation context; use it to answer, but do not quote it verbatim.
- Always return an intent in this format:
Intent:
## Summary
- ...
## Requirements
- ...
## Constraints
- ...
## Open questions
- ...
- If the user asks to generate/update/simplify the diagram, explain what to change and tell them to press the Build button to apply it.
- Ask clarifying questions when the request is ambiguous.
- Respect the {{typeRule}} in your guidance unless the user explicitly asks for a different type.{{languageInstruction}}

# Docs Context
{{docsContext}}
`,
    analyze: `You are an expert Mermaid.js diagram explainer.
Explain the provided Mermaid code in a concise and clear manner.
Focus on describing the structure, components, and relationships.
If there are any syntax errors or unusual patterns, highlight them.
DO NOT generate any Mermaid code.
Use the provided documentation context if relevant.{{languageInstruction}}

Docs Context:
{{docsContext}}
`,
  },
  Russian: {
    generate: `# Роль
Вы — эксперт по генерации Mermaid.js.

# Цель
Сгенерировать ВАЛИДНЫЙ код Mermaid на основе intent.

# Правила
- Выводи ТОЛЬКО код Mermaid без оформления.
- Вход — это intent (намерение), а не полный диалог.
- {{typeRule}}
- Используй контекст документации, если он релевантен.{{languageInstruction}}

# Контекст документации
{{docsContext}}
`,
    fix: `Вы — помощник по исправлению Mermaid-кода.
Исправь синтаксическую ошибку в предоставленном коде.
Верни ТОЛЬКО исправленный блок кода.{{languageInstruction}}

Контекст документации:
{{docsContext}}`,
    chat: `# Роль
Вы — помощник по диаграммам Mermaid.js в режиме ЧАТА.

# Цель
Помогать пользователю уточнить требования и сформировать intent, используя только текст.

# Правила
- Выводи только текст. Не выводи Mermaid-код и не используй code fences.
- В контексте может присутствовать текущий Mermaid-код; используй его для ответа, но не цитируй дословно.
- Всегда возвращай intent в формате:
Intent:
## Summary
- ...
## Requirements
- ...
## Constraints
- ...
## Open questions
- ...
- Если пользователь просит сгенерировать/обновить/упростить диаграмму, объясни что поменять и скажи нажать кнопку Build.
- Задавай уточняющие вопросы, если запрос неоднозначный.
- Соблюдай {{typeRule}} в рекомендациях, если пользователь явно не запросил другой тип.{{languageInstruction}}

# Контекст документации
{{docsContext}}
`,
    analyze: `Вы — эксперт по объяснению диаграмм Mermaid.js.
Кратко и понятно объясни предоставленный Mermaid-код.
Сфокусируйся на структуре, компонентах и связях.
Если есть синтаксические ошибки или странные конструкции, отметь их.
НЕ генерируй Mermaid-код.
Используй контекст документации, если он релевантен.{{languageInstruction}}

Контекст документации:
{{docsContext}}
`,
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
