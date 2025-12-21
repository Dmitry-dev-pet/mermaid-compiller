// Simple ID generator
export const generateId = () => Math.random().toString(36).substring(2, 9);

// Helper function to strip Mermaid code blocks from a string (safety-net; prompts should prevent them)
export const stripMermaidCode = (text: string): string => {
  // Remove fenced Mermaid blocks only; do not strip other code fences (users may want to see them).
  const strippedText = text.replace(/```mermaid\s*[\r\n]([\s\S]*?)```/gi, '');
  return strippedText.trim();
};

export const detectLanguage = (text: string): string => {
  const cyrillicPattern = /[а-яА-ЯёЁ]/;
  return cyrillicPattern.test(text) ? 'Russian' : 'English';
};

export const safeParse = <T>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    return { ...fallback, ...JSON.parse(saved) };
  } catch (e) {
    console.error(`Failed to parse ${key} from localStorage`, e);
    return fallback;
  }
};
