export type ModelFamilyKey = 'gpt' | 'claude' | 'gemini' | 'other';

export const GEMINI_CLI_SUPPORTED_MODEL_IDS = new Set<string>([
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
].map((m) => m.toLowerCase()));

const getFamilyKeyFromText = (value: string): ModelFamilyKey => {
  if (/\b(claude|anthropic)\b/.test(value)) return 'claude';
  if (/\b(gpt|openai)\b/.test(value)) return 'gpt';
  if (/\b(gemini|google)\b/.test(value)) return 'gemini';
  return 'other';
};

export const getModelFamilyKey = (model: { id: string; vendor?: string | null; name?: string | null }): ModelFamilyKey => {
  const vendor = typeof model.vendor === 'string' ? model.vendor.trim().toLowerCase() : '';
  const id = model.id.trim().toLowerCase();
  const name = typeof model.name === 'string' ? model.name.trim().toLowerCase() : '';
  const haystack = `${id} ${name}`;
  const fromText = getFamilyKeyFromText(haystack);
  if (fromText !== 'other') return fromText;

  if (vendor === 'openai' || vendor === 'gpt') return 'gpt';
  if (vendor === 'anthropic') return 'claude';
  if (vendor === 'google') return 'gemini';
  return 'other';
};

export const getModelFamilyLabel = (key: ModelFamilyKey) => {
  if (key === 'gpt') return 'GPT';
  if (key === 'claude') return 'Claude';
  if (key === 'gemini') return 'Gemini';
  return 'Other';
};

const geminiModelGroups = [
  {
    label: 'Gemini Flash Series',
    modelIds: ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  },
  {
    label: 'Gemini Pro Series',
    modelIds: ['gemini-3-pro-preview', 'gemini-2.5-pro'],
  },
] as const;

export const getGeminiGroupLabelForModel = (modelId: string, modelName?: string | null): string | null => {
  const normalizedId = modelId.trim().toLowerCase();
  const normalizedName = (modelName ?? '').trim().toLowerCase();
  const group = geminiModelGroups.find((g) => g.modelIds.some((id) => id === normalizedId));
  if (group) return group.label;
  if (normalizedName.includes('flash')) return 'Gemini Flash Series';
  if (normalizedName.includes('pro')) return 'Gemini Pro Series';
  return null;
};

export const averagePercent = (values: Array<number | null>): number | null => {
  let sum = 0;
  let count = 0;
  values.forEach((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const clamped = Math.max(0, Math.min(100, value));
    sum += clamped;
    count += 1;
  });
  if (count === 0) return null;
  return sum / count;
};

export const buildModelTooltip = (args: { modelName: string; vendor?: string | null; owner?: string | null }) => {
  return `Model: ${args.modelName}`;
};
