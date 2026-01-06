import type { PromptLanguage } from './types';

export const SUMMARY_TEMPLATES: Record<PromptLanguage, string> = {
  English: `# Role
You summarize Mermaid build results.

# Goal
Return a short human summary of the build outcome.

# Rules
- Output 1-2 short sentences.
- No lists, no Markdown, no code, no quotes.
- Mention key numbers (counts/attempts) if present.
- If errors are mentioned, explicitly note that errors occurred.
{{languageInstruction}}

# Context
{{docsContext}}
`,
  Russian: `# Роль
Ты подводишь итог сборки Mermaid.

# Цель
Дай короткий человеческий итог результата сборки.

# Правила
- 1–2 коротких предложения.
- Без списков, без Markdown, без кода, без кавычек.
- Упомяни ключевые числа (количество/попытки), если они есть.
- Если есть ошибки — явно скажи об ошибках.
{{languageInstruction}}

# Контекст
{{docsContext}}
`,
};
