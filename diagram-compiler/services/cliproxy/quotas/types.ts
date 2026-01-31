export type CliproxyCodexWindow = {
  id: string;
  label: string;
  usedPercent: number | null;
  resetLabel: string;
};

export type CliproxyCodexQuota = {
  planType?: string | null;
  windows: CliproxyCodexWindow[];
};

export type CliproxyGeminiCliQuota = {
  items: Array<{ id: string; label: string; remainingPercent: number | null; resetLabel: string }>;
};

export type CliproxyQuotasState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  updatedAt?: string;
  error?: string;
  codex?: Record<string, CliproxyCodexQuota>;
  geminiCli?: Record<string, CliproxyGeminiCliQuota>;
  antigravity?: Record<string, CliproxyGeminiCliQuota>;
};
