// Simple ID generator
export const generateId = () => Math.random().toString(36).substring(2, 9);

// Helper function to strip Mermaid code blocks from a string
export const stripMermaidCode = (text: string): string => {
  // Remove ```mermaid ... ``` blocks
  let strippedText = text.replace(/```mermaid\n([\s\S]*?)```/g, '');
  // Remove generic ``` ... ``` blocks that might contain code
  strippedText = strippedText.replace(/```\n([\s\S]*?)```/g, '');
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


