type VendorRule = {
  vendor: string;
  match: RegExp;
};

const VENDOR_RULES: VendorRule[] = [
  { vendor: 'gpt', match: /\b(gpt|openai)\b/i },
  { vendor: 'google', match: /\b(google|gemini)\b/i },
  { vendor: 'anthropic', match: /\b(anthropic|claude)\b/i },
  { vendor: 'mistral', match: /\b(mistral|mistralai)\b/i },
  { vendor: 'meta', match: /\b(meta|llama)\b/i },
  { vendor: 'cohere', match: /\b(cohere|command)\b/i },
  { vendor: 'qwen', match: /\b(qwen|alibaba)\b/i },
  { vendor: 'xai', match: /\b(xai|grok)\b/i },
];

export const deriveModelVendor = (modelId: string, modelName?: string): string => {
  const haystack = `${modelId} ${modelName ?? ''}`.toLowerCase();
  for (const rule of VENDOR_RULES) {
    if (rule.match.test(haystack)) return rule.vendor;
  }

  const prefix = modelId.split('/')[0] ?? '';
  const cleaned = prefix.split(':')[0].split('-')[0].trim();
  return cleaned;
};
