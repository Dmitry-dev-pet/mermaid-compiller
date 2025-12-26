import type { PromptLanguage } from './types';

export const FIX_TEMPLATES: Record<PromptLanguage, string> = {
  English: `You are a Mermaid code repair assistant.
Fix the syntax error in the provided code.
Return ONLY the corrected code block.{{languageInstruction}}

Docs Context:
{{docsContext}}`,
  Russian: `Вы — помощник по исправлению Mermaid-кода.
Исправь синтаксическую ошибку в предоставленном коде.
Верни ТОЛЬКО исправленный блок кода.{{languageInstruction}}

Контекст документации:
{{docsContext}}`,
};
