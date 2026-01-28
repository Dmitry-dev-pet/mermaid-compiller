import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Check,
  X,
  Wifi,
  WifiOff,
  Loader2,
  Filter,
  LogOut,
  Timer,
  Eye,
  EyeOff,
} from 'lucide-react';
import { AIConfig, CliproxyFilters, ConnectionState, ModelParams, OpenRouterFilters } from '../../types';
import { DEFAULT_AI_CONFIG } from '../../constants';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { RadioGroup, RadioOption } from '../ui/Radio';
import { Select } from '../ui/Select';

type AiControlPlaneMenuProps = {
  aiConfig: AIConfig;
  modelParams: ModelParams | null;
  onModelParamsChange: React.Dispatch<React.SetStateAction<ModelParams | null>>;
  connectionState: ConnectionState;
  onConfigChange: React.Dispatch<React.SetStateAction<AIConfig>>;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
  llmTimeoutMs: number;
  onLLMTimeoutMsChange: (timeoutMs: number) => void;
};

type CliproxyAuthFile = {
  id: string;
  provider: string;
  name?: string;
  label?: string;
  status?: string;
  email?: string;
  disabled?: boolean;
  unavailable?: boolean;
  runtimeOnly?: boolean;
  authIndex?: string;
  idToken?: unknown;
  metadata?: unknown;
  attributes?: unknown;
  account?: unknown;
  planType?: unknown;
};

const normalizeCliproxyBase = (endpoint: string) => endpoint.trim().replace(/\/v1\/?$/, '').replace(/\/$/, '');

const formatMonthDayTime = (date: Date) => date.toLocaleString(void 0, {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const formatUnixSeconds = (seconds: number) => {
  const dt = new Date(seconds * 1000);
  if (Number.isNaN(dt.getTime())) return '-';
  return formatMonthDayTime(dt);
};

const toTrimmedString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value.toString();
  return null;
};

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseJsonObject = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === 'object') return Array.isArray(value) ? null : (value as Record<string, unknown>);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const json = JSON.parse(trimmed) as unknown;
    if (json && typeof json === 'object' && !Array.isArray(json)) return json as Record<string, unknown>;
  } catch {
    // ignore
  }
  return null;
};

const decodeJwtPayload = (jwt: string): Record<string, unknown> | null => {
  const token = jwt.trim();
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payloadBase64 = parts[1] ?? '';
  if (!payloadBase64) return null;
  try {
    const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = typeof window !== 'undefined' && typeof window.atob === 'function'
      ? window.atob(padded)
      : typeof atob === 'function'
        ? atob(padded)
        : null;
    if (!decoded) return null;
    const parsed = JSON.parse(decoded) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // ignore
  }
  return null;
};

const parseJwtOrJsonObject = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === 'object') return Array.isArray(value) ? null : (value as Record<string, unknown>);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const json = parseJsonObject(trimmed);
  if (json) return json;
  return decodeJwtPayload(trimmed);
};

const extractCodexAccountId = (file: { idToken?: unknown; metadata?: unknown; attributes?: unknown }): string | null => {
  const candidates: unknown[] = [];
  if (file.idToken !== undefined) candidates.push(file.idToken);
  if (file.metadata && typeof file.metadata === 'object' && !Array.isArray(file.metadata)) {
    candidates.push((file.metadata as Record<string, unknown>).id_token);
    candidates.push((file.metadata as Record<string, unknown>).idToken);
  }
  if (file.attributes && typeof file.attributes === 'object' && !Array.isArray(file.attributes)) {
    candidates.push((file.attributes as Record<string, unknown>).id_token);
    candidates.push((file.attributes as Record<string, unknown>).idToken);
  }
  for (const candidate of candidates) {
    const obj = parseJwtOrJsonObject(candidate);
    const accountId = obj ? toTrimmedString((obj as Record<string, unknown>).chatgpt_account_id ?? (obj as Record<string, unknown>).chatgptAccountId) : null;
    if (accountId) return accountId;
  }
  return null;
};

const extractGeminiProjectId = (file: { account?: unknown; metadata?: unknown; attributes?: unknown }): string | null => {
  const candidates: unknown[] = [];
  if (file.account !== undefined) candidates.push(file.account);
  if (file.metadata && typeof file.metadata === 'object' && !Array.isArray(file.metadata)) {
    candidates.push((file.metadata as Record<string, unknown>).account);
  }
  if (file.attributes && typeof file.attributes === 'object' && !Array.isArray(file.attributes)) {
    candidates.push((file.attributes as Record<string, unknown>).account);
  }
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const matches = Array.from(candidate.matchAll(/\(([^()]+)\)/g));
    if (matches.length === 0) continue;
    const last = matches[matches.length - 1]?.[1];
    const projectId = toTrimmedString(last);
    if (projectId) return projectId;
  }
  return null;
};

const cliproxyQuotaHeaders = {
  codex: {
    Authorization: 'Bearer $TOKEN$',
    'Content-Type': 'application/json',
    'User-Agent': 'codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal',
  },
  geminiCli: {
    Authorization: 'Bearer $TOKEN$',
    'Content-Type': 'application/json',
  },
} as const;

const cliproxyQuotaEndpoints = {
  codexUsage: 'https://chatgpt.com/backend-api/wham/usage',
  geminiCliQuota: 'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota',
} as const;

const geminiModelGroups = [
  {
    id: 'gemini-flash-series',
    label: 'Gemini Flash Series',
    preferredModelId: 'gemini-3-flash-preview',
    modelIds: ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  },
  {
    id: 'gemini-pro-series',
    label: 'Gemini Pro Series',
    preferredModelId: 'gemini-3-pro-preview',
    modelIds: ['gemini-3-pro-preview', 'gemini-2.5-pro'],
  },
] as const;

const geminiIgnorePrefixes = ['gemini-2.0-flash'] as const;

const geminiGroupByModelId = new Map<string, (typeof geminiModelGroups)[number]>(
  geminiModelGroups.flatMap((group) => group.modelIds.map((modelId) => [modelId, group] as const)),
);

const formatResetFromWindow = (windowObj: Record<string, unknown> | null): string => {
  if (!windowObj) return '-';
  const resetAt = toNumberOrNull(windowObj.reset_at ?? windowObj.resetAt);
  if (resetAt !== null && resetAt > 0) return formatUnixSeconds(resetAt);
  const resetAfterSeconds = toNumberOrNull(windowObj.reset_after_seconds ?? windowObj.resetAfterSeconds);
  if (resetAfterSeconds !== null && resetAfterSeconds > 0) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return formatUnixSeconds(nowSeconds + resetAfterSeconds);
  }
  return '-';
};

const groupGeminiBuckets = (items: Array<{ modelId: string; tokenType?: string | null; remainingFraction: number | null; remainingAmount: number | null; resetTime?: string }>) => {
  if (items.length === 0) return [];
  const shouldIgnore = (modelId: string) => geminiIgnorePrefixes.some((prefix) => modelId === prefix || modelId.startsWith(`${prefix}-`));
  const minNullable = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));
  const earliestReset = (a?: string, b?: string) => {
    if (!a) return b;
    if (!b) return a;
    const at = new Date(a).getTime();
    const bt = new Date(b).getTime();
    if (Number.isNaN(at)) return b;
    if (Number.isNaN(bt)) return a;
    return at <= bt ? a : b;
  };

  const buckets = new Map<string, {
    id: string;
    label: string;
    tokenType?: string | null;
    modelIds: string[];
    preferredModelId?: string;
    preferredBucket?: { remainingFraction: number | null; remainingAmount: number | null; resetTime?: string };
    fallbackRemainingFraction: number | null;
    fallbackRemainingAmount: number | null;
    fallbackResetTime?: string;
  }>();

  items.forEach((item) => {
    if (shouldIgnore(item.modelId)) return;
    const group = geminiGroupByModelId.get(item.modelId);
    const groupId = group?.id ?? item.modelId;
    const groupLabel = group?.label ?? item.modelId;
    const tokenType = item.tokenType ?? '';
    const key = `${groupId}::${tokenType}`;
    const existing = buckets.get(key);
    if (!existing) {
      const preferredModelId = group?.preferredModelId;
      const preferredBucket =
        preferredModelId && item.modelId === preferredModelId
          ? { remainingFraction: item.remainingFraction, remainingAmount: item.remainingAmount, resetTime: item.resetTime }
          : undefined;
      buckets.set(key, {
        id: `${groupId}${tokenType ? `-${tokenType}` : ''}`,
        label: groupLabel,
        tokenType: item.tokenType ?? null,
        modelIds: [item.modelId],
        preferredModelId,
        preferredBucket,
        fallbackRemainingFraction: item.remainingFraction,
        fallbackRemainingAmount: item.remainingAmount,
        fallbackResetTime: item.resetTime,
      });
      return;
    }

    existing.modelIds.push(item.modelId);
    existing.fallbackRemainingFraction = minNullable(existing.fallbackRemainingFraction, item.remainingFraction);
    existing.fallbackRemainingAmount = minNullable(existing.fallbackRemainingAmount, item.remainingAmount);
    existing.fallbackResetTime = earliestReset(existing.fallbackResetTime, item.resetTime);
    if (existing.preferredModelId && item.modelId === existing.preferredModelId) {
      existing.preferredBucket = { remainingFraction: item.remainingFraction, remainingAmount: item.remainingAmount, resetTime: item.resetTime };
    }
  });

  return Array.from(buckets.values()).map((bucket) => {
    const preferred = bucket.preferredBucket;
    const remainingFraction = preferred ? preferred.remainingFraction : bucket.fallbackRemainingFraction;
    const resetTime = preferred ? preferred.resetTime : bucket.fallbackResetTime;
    const remainingPercent = remainingFraction === null ? null : Math.round(Math.max(0, Math.min(1, remainingFraction)) * 100);
    const resetLabel = resetTime ? formatMonthDayTime(new Date(resetTime)) : '-';
    const label = bucket.tokenType ? `${bucket.label} (${bucket.tokenType})` : bucket.label;
    return { id: bucket.id, label, remainingPercent, resetLabel };
  });
};

const mapWithConcurrency = async <T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> => {
  const results: R[] = [];
  let index = 0;
  const runners = Array.from({ length: Math.max(1, limit) }, async () => {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      results[current] = await worker(items[current] as T);
    }
  });
  await Promise.all(runners);
  return results;
};

const AiControlPlaneMenu: React.FC<AiControlPlaneMenuProps> = ({
  aiConfig,
  modelParams,
  onModelParamsChange,
  connectionState,
  onConfigChange,
  onConnect,
  onDisconnect,
  llmTimeoutMs,
  onLLMTimeoutMsChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [showAgentToken, setShowAgentToken] = useState(false);
  const [showProxyKey, setShowProxyKey] = useState(false);
  const [showProxyManagementKey, setShowProxyManagementKey] = useState(false);
  const [showCliproxyUsageDetails, setShowCliproxyUsageDetails] = useState(false);
  const [showCliproxySubscriptions, setShowCliproxySubscriptions] = useState(false);
  const [showCliproxyQuotas, setShowCliproxyQuotas] = useState(false);
  const [cliproxyQuotasShowAll, setCliproxyQuotasShowAll] = useState(false);
  const [cliproxyQuotasRefreshIndex, setCliproxyQuotasRefreshIndex] = useState(0);
  const [agentStatus, setAgentStatus] = useState<{ state: 'unknown' | 'online' | 'offline'; message?: string }>({ state: 'unknown' });
  const [versionInfo, setVersionInfo] = useState<{
    agentVersion?: string;
    codexDetected?: boolean;
    codexVersion?: string;
    geminiDetected?: boolean;
    geminiVersion?: string;
    cliproxyapiVersion?: string;
    cliproxyapiLatestVersion?: string;
    cliproxyUsageSummary?: string;
    cliproxyManagementStatus?: string;
    cliproxyUsage?: {
      totalRequests: number;
      successCount: number;
      failureCount: number;
      totalTokens: number;
      requestsByDay: Array<{ day: string; requests: number }>;
      tokensByDay: Array<{ day: string; tokens: number }>;
    };
    cliproxyAuthFiles?: CliproxyAuthFile[];
    cliproxyAuthStatus?: string;
  }>({});
  const [cliproxyQuotas, setCliproxyQuotas] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    updatedAt?: string;
    error?: string;
    codex?: Record<string, { planType?: string | null; windows: Array<{ id: string; label: string; usedPercent: number | null; resetLabel: string }> }>;
    geminiCli?: Record<string, { items: Array<{ id: string; label: string; tokenType?: string | null; remainingPercent: number | null; resetLabel: string }> }>;
  }>({ status: 'idle' });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getStatusText = () => {
    if (connectionState.status === 'disconnected') return 'AI: Not connected';
    if (connectionState.status === 'connecting') return 'AI: Connecting...';
    if (connectionState.status === 'failed') return 'AI: Connection Failed';
    if (!aiConfig.selectedModelId) return 'AI: Connected · Select model';

    const model = connectionState.availableModels.find((m) => m?.id === aiConfig.selectedModelId);
    const modelName = model ? model.name : aiConfig.selectedModelId;
    const contextLabel = model?.contextLength ? ` (${formatContextLength(model.contextLength)})` : '';
    const providerName =
      aiConfig.provider === 'openrouter'
        ? 'OpenRouter'
        : aiConfig.provider === 'agent'
          ? 'Mermaid Agent'
          : 'Proxy';
    return `AI: ${providerName} · ${modelName}${contextLabel}`;
  };

  const getStatusTone = () => {
    if (connectionState.status === 'connected') return 'text-emerald-500';
    if (connectionState.status === 'failed') return 'text-rose-500';
    if (connectionState.status === 'connecting') return 'text-amber-500';
    return 'text-slate-400 dark:text-slate-500';
  };

  const updateConfig = useCallback((updates: Partial<AIConfig>) => {
    onConfigChange((prev) => ({ ...prev, ...updates }));
  }, [onConfigChange]);

  const updateSelectedModel = useCallback((modelId: string) => {
    onConfigChange((prev) => ({
      ...prev,
      selectedModelId: modelId,
      selectedModelIdByProvider: {
        ...prev.selectedModelIdByProvider,
        [prev.provider]: modelId,
      },
    }));
  }, [onConfigChange]);

  const formatContextLength = (value?: number) => {
    if (!value || value <= 0) return '';
    if (value >= 1_000_000) {
      const rounded = Math.round(value / 1_000_000);
      return `${rounded}m`;
    }
    const rounded = Math.round(value / 1000);
    return `${rounded}k`;
  };

  const isOpenRouter = aiConfig.provider === 'openrouter';
  const isAgent = aiConfig.provider === 'agent';
  const isCliproxy = aiConfig.provider === 'cliproxy';
  const filtersByProvider = aiConfig.filtersByProvider ?? DEFAULT_AI_CONFIG.filtersByProvider;
  const activeFilters = isOpenRouter
    ? filtersByProvider.openrouter
    : isAgent
      ? filtersByProvider.agent
      : filtersByProvider.cliproxy;
  const timeoutSeconds = Math.max(5, Math.min(300, Math.round(llmTimeoutMs / 1000)));
  const statusToneClass = getStatusTone();
  const reasoningEffort =
    typeof modelParams?.['reasoning_effort'] === 'string'
      ? (modelParams['reasoning_effort'] as string)
      : 'auto';
  const selectedModel = aiConfig.selectedModelId
    ? connectionState.availableModels.find((m) => m?.id === aiConfig.selectedModelId)
    : undefined;
  const isGeminiModel =
    selectedModel?.vendor === 'google' ||
    /^gemini[:/]/i.test(aiConfig.selectedModelId) ||
    /\bgoogle\/gemini\b/i.test(aiConfig.selectedModelId);
  const showReasoningControl = isAgent && !isGeminiModel;

  useEffect(() => {
    if (!isCliproxy) return;
    if (!isOpen) return;
    if (!showCliproxyQuotas) return;
    let cancelled = false;

    const endpoint = aiConfig.proxyEndpoint?.trim();
    const proxyManagementKey = aiConfig.proxyManagementKey?.trim();
    const authFiles = versionInfo.cliproxyAuthFiles ?? [];
    if (!endpoint || !proxyManagementKey || authFiles.length === 0) {
      void Promise.resolve().then(() => setCliproxyQuotas({ status: 'idle' }));
      return;
    }

    const base = normalizeCliproxyBase(endpoint);
    const managementHeaders: Record<string, string> = {
      'X-Management-Key': proxyManagementKey,
      Authorization: `Bearer ${proxyManagementKey}`,
      'Content-Type': 'application/json',
    };

    const apiCall = async (payload: Record<string, unknown>) => {
      const response = await fetch(`${base}/v0/management/api-call`, {
        method: 'POST',
        headers: managementHeaders,
        body: JSON.stringify(payload),
      });
      const text = await response.text().catch(() => '');
      if (!response.ok) {
        throw new Error(text.trim() || `unauthorized (${response.status})`);
      }
      const json = (() => {
        try { return JSON.parse(text) as unknown; } catch { return null; }
      })();
      if (!json || typeof json !== 'object') {
        throw new Error('Invalid api-call response');
      }
      const data = json as Record<string, unknown>;
      const statusCode = toNumberOrNull(data.status_code ?? data.statusCode) ?? 0;
      const body = data.body ?? null;
      return { statusCode, body };
    };

    const parseCodexQuota = async (file: CliproxyAuthFile) => {
      const authIndex = toTrimmedString(file.authIndex) ?? null;
      if (!authIndex) throw new Error('missing auth_index');
      const accountId = extractCodexAccountId({ idToken: file.idToken, metadata: file.metadata, attributes: file.attributes });
      if (!accountId) throw new Error('missing chatgpt account id');

      const header = {
        ...cliproxyQuotaHeaders.codex,
        'Chatgpt-Account-Id': accountId,
      };

      const { statusCode, body } = await apiCall({
        authIndex,
        method: 'GET',
        url: cliproxyQuotaEndpoints.codexUsage,
        header,
      });
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`HTTP ${statusCode}`);
      }
      const obj = parseJsonObject(body) ?? parseJsonObject(typeof body === 'string' ? body : null);
      if (!obj) throw new Error('empty quota');

      const planTypeRaw = toTrimmedString(obj.plan_type ?? obj.planType) ?? toTrimmedString(file.planType);
      const planType = planTypeRaw ? planTypeRaw.toLowerCase() : null;

      const rateLimit = (parseJsonObject(obj.rate_limit ?? obj.rateLimit) ?? null) as Record<string, unknown> | null;
      const codeReviewRateLimit = (parseJsonObject(obj.code_review_rate_limit ?? obj.codeReviewRateLimit) ?? null) as Record<string, unknown> | null;

      const windows: Array<{ id: string; label: string; usedPercent: number | null; resetLabel: string }> = [];
      const addWindow = (id: string, label: string, wObj: Record<string, unknown> | null, limitReached: unknown, allowed: unknown) => {
        if (!wObj) return;
        const usedPercent = toNumberOrNull(wObj.used_percent ?? wObj.usedPercent);
        const resetLabel = formatResetFromWindow(wObj);
        const reached = !!limitReached || allowed === false;
        const percent = usedPercent !== null ? usedPercent : (reached && resetLabel !== '-' ? 100 : null);
        windows.push({ id, label, usedPercent: percent, resetLabel });
      };

      const primaryWindow = rateLimit ? (parseJsonObject(rateLimit.primary_window ?? rateLimit.primaryWindow) ?? null) : null;
      const secondaryWindow = rateLimit ? (parseJsonObject(rateLimit.secondary_window ?? rateLimit.secondaryWindow) ?? null) : null;
      const rateLimitReached = rateLimit ? (rateLimit.limit_reached ?? rateLimit.limitReached) : null;
      const rateLimitAllowed = rateLimit ? (rateLimit.allowed) : null;

      addWindow('primary', '5-hour limit', primaryWindow, rateLimitReached, rateLimitAllowed);
      addWindow('secondary', 'Weekly limit', secondaryWindow, rateLimitReached, rateLimitAllowed);

      const codeReviewWindow = codeReviewRateLimit ? (parseJsonObject(codeReviewRateLimit.primary_window ?? codeReviewRateLimit.primaryWindow) ?? null) : null;
      const codeReviewReached = codeReviewRateLimit ? (codeReviewRateLimit.limit_reached ?? codeReviewRateLimit.limitReached) : null;
      const codeReviewAllowed = codeReviewRateLimit ? (codeReviewRateLimit.allowed) : null;
      addWindow('code-review', 'Code review limit', codeReviewWindow, codeReviewReached, codeReviewAllowed);

      return { planType, windows };
    };

    const parseGeminiCliQuota = async (file: CliproxyAuthFile) => {
      const authIndex = toTrimmedString(file.authIndex) ?? null;
      if (!authIndex) throw new Error('missing auth_index');
      const projectId = extractGeminiProjectId({ account: file.account, metadata: file.metadata, attributes: file.attributes });
      if (!projectId) throw new Error('missing project id');

      const { statusCode, body } = await apiCall({
        authIndex,
        method: 'POST',
        url: cliproxyQuotaEndpoints.geminiCliQuota,
        header: { ...cliproxyQuotaHeaders.geminiCli },
        data: JSON.stringify({ project: projectId }),
      });
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`HTTP ${statusCode}`);
      }

      const obj = parseJsonObject(body) ?? parseJsonObject(typeof body === 'string' ? body : null);
      const bucketsRaw = obj && Array.isArray((obj as Record<string, unknown>).buckets) ? ((obj as Record<string, unknown>).buckets as unknown[]) : [];
      const buckets = bucketsRaw
        .filter((b) => b && typeof b === 'object')
        .map((b) => {
          const entry = b as Record<string, unknown>;
          const modelId = toTrimmedString(entry.modelId ?? entry.model_id);
          if (!modelId) return null;
          const tokenType = toTrimmedString(entry.tokenType ?? entry.token_type);
          const remainingFractionRaw = entry.remainingFraction ?? entry.remaining_fraction;
          const remainingFraction = toNumberOrNull(remainingFractionRaw);
          const remainingAmount = toNumberOrNull(entry.remainingAmount ?? entry.remaining_amount);
          const resetTime = toTrimmedString(entry.resetTime ?? entry.reset_time) ?? undefined;
          let normalizedRemainingFraction: number | null = remainingFraction;
          if (typeof remainingFractionRaw === 'string' && remainingFractionRaw.trim().endsWith('%')) {
            const parsed = Number(remainingFractionRaw.trim().slice(0, -1));
            normalizedRemainingFraction = Number.isFinite(parsed) ? parsed / 100 : null;
          }
          if (normalizedRemainingFraction !== null) {
            normalizedRemainingFraction = Math.max(0, Math.min(1, normalizedRemainingFraction));
          }
          return { modelId, tokenType, remainingFraction: normalizedRemainingFraction, remainingAmount, resetTime };
        })
        .filter((b) => b !== null) as Array<{ modelId: string; tokenType?: string | null; remainingFraction: number | null; remainingAmount: number | null; resetTime?: string }>;

      const items = groupGeminiBuckets(buckets).map((group) => ({
        id: group.id,
        label: group.label,
        tokenType: null,
        remainingPercent: group.remainingPercent,
        resetLabel: group.resetLabel,
      }));
      return { items };
    };

    const run = async () => {
      setCliproxyQuotas((prev) => ({ ...prev, status: 'loading', error: undefined }));
      const codexFilesAll = authFiles.filter((f) => f.provider === 'codex' && !f.runtimeOnly);
      const geminiFilesAll = authFiles.filter((f) => f.provider === 'gemini-cli' && !f.runtimeOnly);
      const codexFiles = cliproxyQuotasShowAll ? codexFilesAll : codexFilesAll.slice(0, 3);
      const geminiFiles = cliproxyQuotasShowAll ? geminiFilesAll : geminiFilesAll.slice(0, 3);

      const codexEntries = await mapWithConcurrency(codexFiles, 3, async (file) => {
        try {
          return { id: file.id, quota: await parseCodexQuota(file) };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'failed';
          return { id: file.id, quota: { planType: null, windows: [{ id: 'error', label: 'Error', usedPercent: null, resetLabel: message }] } };
        }
      });
      const geminiEntries = await mapWithConcurrency(geminiFiles, 3, async (file) => {
        try {
          return { id: file.id, quota: await parseGeminiCliQuota(file) };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'failed';
          return { id: file.id, quota: { items: [{ id: 'error', label: 'Error', remainingPercent: null, resetLabel: message }] } };
        }
      });

      if (cancelled) return;
      const codexMap: Record<string, { planType?: string | null; windows: Array<{ id: string; label: string; usedPercent: number | null; resetLabel: string }> }> = {};
      codexEntries.forEach((e) => { codexMap[e.id] = e.quota; });
      const geminiMap: Record<string, { items: Array<{ id: string; label: string; tokenType?: string | null; remainingPercent: number | null; resetLabel: string }> }> = {};
      geminiEntries.forEach((e) => { geminiMap[e.id] = e.quota; });

      setCliproxyQuotas({
        status: 'success',
        updatedAt: new Date().toISOString(),
        codex: codexMap,
        geminiCli: geminiMap,
      });
    };

    run().catch((err: unknown) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : 'failed';
      setCliproxyQuotas({ status: 'error', error: message });
    });

    return () => {
      cancelled = true;
    };
  }, [
    aiConfig.proxyEndpoint,
    aiConfig.proxyManagementKey,
    cliproxyQuotasRefreshIndex,
    cliproxyQuotasShowAll,
    isCliproxy,
    isOpen,
    showCliproxyQuotas,
    versionInfo.cliproxyAuthFiles,
  ]);

  const updateFilters = (updates: Partial<OpenRouterFilters & CliproxyFilters>) => {
    onConfigChange((prev) => {
      const provider = prev.provider;
      return {
        ...prev,
        filtersByProvider: {
          ...prev.filtersByProvider,
          [provider]: {
            ...(prev.filtersByProvider?.[provider] ?? {}),
            ...updates,
          },
        },
      };
    });
  };

  const switchProvider = (provider: AIConfig['provider']) => {
    if (aiConfig.provider === provider) return;
    onDisconnect();
    const storedModelId = aiConfig.selectedModelIdByProvider?.[provider] ?? '';
    updateConfig({ provider, selectedModelId: storedModelId });
  };

  const updateReasoningEffort = useCallback((value: string) => {
    onModelParamsChange((prev) => {
      const next: ModelParams = { ...(prev ?? {}) };
      if (value === 'auto') {
        delete next['reasoning_effort'];
      } else {
        next['reasoning_effort'] = value;
      }
      return Object.keys(next).length === 0 ? null : next;
    });
  }, [onModelParamsChange]);

  useEffect(() => {
    const current = typeof modelParams?.['reasoning_effort'] === 'string'
      ? (modelParams['reasoning_effort'] as string)
      : null;
    if (!current) return;
    if (showReasoningControl) return;
    updateReasoningEffort('auto');
  }, [modelParams, showReasoningControl, updateReasoningEffort]);

  const baseFilteredModels = connectionState.availableModels.filter((m) => {
    if (!m) return false;
    if (isOpenRouter) {
      const openRouterFilters = aiConfig.filtersByProvider.openrouter;
      if (openRouterFilters.freeOnly && !m.isFree) return false;
      if (openRouterFilters.minContextWindow > 0 && (m.contextLength ?? 0) < openRouterFilters.minContextWindow) return false;
    }
    return true;
  });

  const vendorCounts = new Map<string, number>();
  baseFilteredModels.forEach((model) => {
    if (!model || !model.vendor) return;
    vendorCounts.set(model.vendor, (vendorCounts.get(model.vendor) ?? 0) + 1);
  });

  const vendorOptions = Array.from(vendorCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([vendor, count]) => ({ vendor, count }));

  if (activeFilters.vendor && !vendorCounts.has(activeFilters.vendor)) {
    vendorOptions.unshift({ vendor: activeFilters.vendor, count: 0 });
  }

  const filteredModels = baseFilteredModels.filter((m) => {
    if (activeFilters.vendor && m.vendor !== activeFilters.vendor) return false;
    return true;
  });

  useEffect(() => {
    if (connectionState.status !== 'connected') return;
    if (filteredModels.length !== 1) return;
    const onlyModelId = filteredModels[0]?.id;
    if (!onlyModelId) return;
    if (aiConfig.selectedModelId === onlyModelId) return;
    updateSelectedModel(onlyModelId);
  }, [aiConfig.selectedModelId, connectionState.status, filteredModels, updateSelectedModel]);

  useEffect(() => {
    if (!isAgent) return;
    if (!isOpen) return;
    let cancelled = false;

    const endpoint = aiConfig.agentEndpoint?.trim();
    const checkHealth = async (base: string) => {
      try {
        const response = await fetch(`${base}/api/health`);
        if (cancelled) return;
        if (!response.ok) {
          setAgentStatus({ state: 'offline', message: `HTTP ${response.status}` });
          return;
        }
        const json = await response.json().catch(() => null);
        if (json && typeof json === 'object') {
          const data = json as Record<string, unknown>;
          const agentVersion = typeof data.agent_version === 'string' ? data.agent_version : undefined;
          const codexDetected = typeof data.codex_detected === 'boolean' ? data.codex_detected : undefined;
          const codexVersion = typeof data.codex_version === 'string' ? data.codex_version : undefined;
          const geminiDetected = typeof data.gemini_detected === 'boolean' ? data.gemini_detected : undefined;
          const geminiVersion = typeof data.gemini_version === 'string' ? data.gemini_version : undefined;
          setVersionInfo((prev) => ({ ...prev, agentVersion, codexDetected, codexVersion, geminiDetected, geminiVersion }));
        }
        setAgentStatus({ state: 'online' });
      } catch (error: unknown) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Unavailable';
        setAgentStatus({ state: 'offline', message });
      }
    };

    const run = async () => {
      if (!endpoint) {
        setAgentStatus({ state: 'unknown' });
        setVersionInfo((prev) => ({ ...prev, agentVersion: undefined, codexVersion: undefined, geminiVersion: undefined }));
        return;
      }
      const base = endpoint.replace(/\/v1\/?$/, '').replace(/\/$/, '');
      await checkHealth(base);
      const interval = window.setInterval(() => void checkHealth(base), 5000);
      return () => {
        window.clearInterval(interval);
      };
    };

    const teardownPromise = run();
    return () => {
      cancelled = true;
      void teardownPromise.then((teardown) => teardown?.());
    };
  }, [aiConfig.agentEndpoint, isAgent, isOpen]);

  useEffect(() => {
    if (!isCliproxy) return;
    if (!isOpen) return;
    let cancelled = false;

    const inferenceHeaders: Record<string, string> = {};
    const proxyKey = aiConfig.proxyKey?.trim();
    if (proxyKey) {
      inferenceHeaders.Authorization = `Bearer ${proxyKey}`;
    }
    const managementHeaders: Record<string, string> = {};
    const proxyManagementKey = aiConfig.proxyManagementKey?.trim();
    if (proxyManagementKey) {
      managementHeaders['X-Management-Key'] = proxyManagementKey;
      managementHeaders.Authorization = `Bearer ${proxyManagementKey}`;
    }

    const normalizeVersionString = (value: string): string => {
      const trimmed = value.trim();
      if (!trimmed) return trimmed;
      if (/^v\d+\.\d+\.\d+/.test(trimmed)) return trimmed;
      if (/^\d+\.\d+\.\d+/.test(trimmed)) return `v${trimmed}`;
      return trimmed;
    };

    const parseVersionFromJson = (value: unknown): string | undefined => {
      if (!value || typeof value !== 'object') return undefined;
      const data = value as Record<string, unknown>;
      if (typeof data.version === 'string') return normalizeVersionString(data.version);
      if (typeof data.app_version === 'string') return normalizeVersionString(data.app_version);
      if (typeof data.cliproxyapi_version === 'string') return normalizeVersionString(data.cliproxyapi_version);
      if (typeof data.build_version === 'string') return normalizeVersionString(data.build_version);
      if (typeof data.server_version === 'string') return normalizeVersionString(data.server_version);
      if (typeof data['latest-version'] === 'string') return normalizeVersionString(data['latest-version']);
      if (typeof data.latest_version === 'string') return normalizeVersionString(data.latest_version);
      return undefined;
    };

    const parseVersionFromHeaders = (headers: Headers): string | undefined => {
      const candidates = [
        headers.get('x-cliproxyapi-version'),
        headers.get('x-app-version'),
        headers.get('x-server-version'),
        headers.get('x-version'),
        headers.get('server'),
        headers.get('x-powered-by'),
      ]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);
      for (const candidate of candidates) {
        const direct = candidate.trim();
        if (!direct) continue;
        const match = direct.match(/(?:CLIProxyAPI|cli-proxy-api|cliproxyapi)[^0-9v]*v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z_.-]+)?)/i);
        if (match?.[1]) return normalizeVersionString(match[1]);
        const semver = direct.match(/\bv?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z_.-]+)?\b/);
        if (semver?.[0]) return normalizeVersionString(semver[0]);
      }
      return undefined;
    };

    const fetchVersion = async () => {
      const endpoint = aiConfig.proxyEndpoint?.trim();
      if (!endpoint) {
        setVersionInfo((prev) => ({
          ...prev,
          cliproxyapiVersion: undefined,
          cliproxyapiLatestVersion: undefined,
          cliproxyUsageSummary: undefined,
        }));
        return;
      }
      const base = endpoint.replace(/\/v1\/?$/, '').replace(/\/$/, '');
      const detectPaths = [
        '/api/health',
        '/health',
        '/api/version',
        '/version',
        '/api/status',
        '/status',
        '/api/info',
        '/info',
        '/api/meta',
        '/meta',
        '/v1/models',
        '/models',
        '/api/models',
      ];
      let detectedVersion: string | undefined;
      for (const path of detectPaths) {
        try {
          const response = await fetch(`${base}${path}`, { headers: inferenceHeaders });
          if (cancelled) return;
          if (!response.ok) continue;
          const headerVersion = parseVersionFromHeaders(response.headers);
          if (headerVersion) {
            detectedVersion = headerVersion;
            break;
          }
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await response.json().catch(() => null);
            const version = parseVersionFromJson(json);
            if (version) {
              detectedVersion = version;
              break;
            }
            continue;
          }
          const text = (await response.text().catch(() => '')).trim();
          if (text) {
            const line = normalizeVersionString(text.split('\n')[0] ?? '');
            if (line) {
              detectedVersion = line;
              break;
            }
          }
        } catch {
          // ignore and try next
        }
      }

      let latestVersion: string | undefined;
      let managementStatus: string | undefined;
      try {
        const response = await fetch(`${base}/v0/management/latest-version`, { headers: managementHeaders });
        if (!cancelled && (response.status === 401 || response.status === 403)) {
          const errText = await response.text().catch(() => '');
          managementStatus = errText.trim() || `unauthorized (${response.status})`;
        } else if (!cancelled && response.ok) {
          const json = await response.json().catch(() => null);
          latestVersion = parseVersionFromJson(json);
        }
      } catch {
        // ignore
      }

      let usageSummary: string | undefined;
      let usageDetails: {
        totalRequests: number;
        successCount: number;
        failureCount: number;
        totalTokens: number;
        requestsByDay: Array<{ day: string; requests: number }>;
        tokensByDay: Array<{ day: string; tokens: number }>;
      } | undefined;
      try {
        const response = await fetch(`${base}/v0/management/usage`, { headers: managementHeaders });
        if (!cancelled && (response.status === 401 || response.status === 403)) {
          const errText = await response.text().catch(() => '');
          managementStatus =
            managementStatus ??
            (errText.trim() || `unauthorized (${response.status})`);
        } else if (!cancelled && response.ok) {
          const json = (await response.json().catch(() => null)) as unknown;
          if (json && typeof json === 'object') {
            const data = json as Record<string, unknown>;
            const usage = (data.usage && typeof data.usage === 'object') ? (data.usage as Record<string, unknown>) : null;
            const totalRequests = usage && typeof usage.total_requests === 'number' ? usage.total_requests : null;
            const totalTokens = usage && typeof usage.total_tokens === 'number' ? usage.total_tokens : null;
            const successCount = usage && typeof usage.success_count === 'number' ? usage.success_count : null;
            const failureCount = usage && typeof usage.failure_count === 'number' ? usage.failure_count : null;
            const totalFailed = typeof data.failed_requests === 'number'
              ? data.failed_requests
              : typeof failureCount === 'number'
                ? failureCount
                : null;
            const parts: string[] = [];
            if (typeof totalRequests === 'number') parts.push(`${totalRequests} req`);
            if (typeof totalTokens === 'number') parts.push(`${totalTokens} tok`);
            if (typeof totalFailed === 'number') parts.push(`${totalFailed} fail`);
            if (parts.length > 0) usageSummary = parts.join(' · ');

            const requestsByDayRaw =
              usage && usage.requests_by_day && typeof usage.requests_by_day === 'object'
                ? (usage.requests_by_day as Record<string, unknown>)
                : null;
            const tokensByDayRaw =
              usage && usage.tokens_by_day && typeof usage.tokens_by_day === 'object'
                ? (usage.tokens_by_day as Record<string, unknown>)
                : null;
            const requestsByDay = requestsByDayRaw
              ? Object.entries(requestsByDayRaw)
                .filter(([, value]) => typeof value === 'number')
                .map(([day, value]) => ({ day, requests: value as number }))
                .sort((a, b) => a.day.localeCompare(b.day))
                .slice(-7)
              : [];
            const tokensByDay = tokensByDayRaw
              ? Object.entries(tokensByDayRaw)
                .filter(([, value]) => typeof value === 'number')
                .map(([day, value]) => ({ day, tokens: value as number }))
                .sort((a, b) => a.day.localeCompare(b.day))
                .slice(-7)
              : [];

            if (
              typeof totalRequests === 'number' &&
              typeof totalTokens === 'number' &&
              typeof (successCount ?? null) === 'number' &&
              typeof (failureCount ?? null) === 'number'
            ) {
              usageDetails = {
                totalRequests,
                totalTokens,
                successCount: successCount as number,
                failureCount: failureCount as number,
                requestsByDay,
                tokensByDay,
              };
            }
          }
        }
      } catch {
        // ignore
      }

      let authFiles: Array<{
        id: string;
        provider: string;
        name?: string;
        label?: string;
        status?: string;
        email?: string;
        disabled?: boolean;
        unavailable?: boolean;
      }> | undefined;
      let authStatus: string | undefined;
      try {
        const response = await fetch(`${base}/v0/management/auth-files`, { headers: managementHeaders });
        if (!cancelled && (response.status === 401 || response.status === 403)) {
          const errText = await response.text().catch(() => '');
          authStatus = errText.trim() || `unauthorized (${response.status})`;
        } else if (!cancelled && response.ok) {
          const json = (await response.json().catch(() => null)) as unknown;
          const list =
            Array.isArray(json)
              ? json
              : json && typeof json === 'object' && Array.isArray((json as Record<string, unknown>).files)
                ? ((json as Record<string, unknown>).files as unknown[])
                : null;
          if (list) {
            authFiles = list
              .filter((item) => item && typeof item === 'object')
              .map((item) => {
                const data = item as Record<string, unknown>;
                const provider = typeof data.provider === 'string' ? data.provider : 'unknown';
                const id = typeof data.id === 'string' ? data.id : `${provider}:${typeof data.name === 'string' ? data.name : ''}`;
                const name = typeof data.name === 'string' ? data.name : undefined;
                const label = typeof data.label === 'string' ? data.label : undefined;
                const status = typeof data.status === 'string' ? data.status : undefined;
                const email = typeof data.email === 'string' ? data.email : undefined;
                const disabled = typeof data.disabled === 'boolean' ? data.disabled : undefined;
                const unavailable = typeof data.unavailable === 'boolean' ? data.unavailable : undefined;
                const runtimeOnlyRaw = data.runtime_only ?? data.runtimeOnly;
                const runtimeOnly = typeof runtimeOnlyRaw === 'boolean'
                  ? runtimeOnlyRaw
                  : typeof runtimeOnlyRaw === 'string'
                    ? runtimeOnlyRaw.trim().toLowerCase() === 'true'
                    : undefined;
                const authIndexRaw = data.auth_index ?? data.authIndex;
                const authIndex = toTrimmedString(authIndexRaw) ?? undefined;
                const idToken = data.id_token ?? data.idToken;
                const metadata = data.metadata;
                const attributes = data.attributes;
                const account = data.account;
                const planType = data.plan_type ?? data.planType;
                return { id, provider, name, label, status, email, disabled, unavailable, runtimeOnly, authIndex, idToken, metadata, attributes, account, planType };
              });
          }
        }
      } catch {
        // ignore
      }

      if (cancelled) return;
      setVersionInfo((prev) => ({
        ...prev,
        cliproxyapiVersion: detectedVersion,
        cliproxyapiLatestVersion: latestVersion,
        cliproxyUsageSummary: usageSummary,
        cliproxyManagementStatus: managementStatus,
        cliproxyUsage: usageDetails,
        cliproxyAuthFiles: authFiles,
        cliproxyAuthStatus: authStatus,
      }));
    };

    fetchVersion();
    return () => {
      cancelled = true;
    };
  }, [aiConfig.proxyEndpoint, aiConfig.proxyKey, aiConfig.proxyManagementKey, isCliproxy, isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="default"
        className="px-3"
      >
        {connectionState.status === 'connected' ? <Wifi size={14} className={statusToneClass} /> : <WifiOff size={14} className={statusToneClass} />}
        <span className="truncate max-w-[320px] text-[10px] ml-1">{getStatusText()}</span>
        <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-400">
          <Timer size={12} className="opacity-80" />
          {timeoutSeconds}s
        </span>
        <ChevronDown size={14} className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-[400px] bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-4 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Provider</label>
            <RadioGroup>
              <RadioOption
                name="provider"
                checked={aiConfig.provider === 'openrouter'}
                onChange={() => switchProvider('openrouter')}
                label="OpenRouter"
              />
              <RadioOption
                name="provider"
                checked={aiConfig.provider === 'agent'}
                onChange={() => switchProvider('agent')}
                label="Mermaid Agent"
              />
              <RadioOption
                name="provider"
                checked={aiConfig.provider === 'cliproxy'}
                onChange={() => switchProvider('cliproxy')}
                label="My Proxy"
              />
            </RadioGroup>
          </div>

          <form
            autoComplete="off"
            onSubmit={(event) => event.preventDefault()}
            className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-100 dark:border-slate-700"
          >
            {isOpenRouter ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">API Key</label>
                  <div className="relative">
                    <Input
                      type="text"
                      autoComplete="new-password"
                      name="openrouter-secret"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      style={{ WebkitTextSecurity: showOpenRouterKey ? 'none' : 'disc' }}
                      value={aiConfig.openRouterKey}
                      onChange={(e) => updateConfig({ openRouterKey: e.target.value })}
                      placeholder="sk-or-..."
                      size="md"
                      className="pr-8"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowOpenRouterKey((prev) => !prev)}
                      className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={showOpenRouterKey ? 'Hide API key' : 'Show API key'}
                    >
                      {showOpenRouterKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </Button>
                  </div>
                </div>
              </div>
            ) : isAgent ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Endpoint</label>
                  <Input
                    type="text"
                    autoComplete="off"
                    name="agent-endpoint"
                    value={aiConfig.agentEndpoint}
                    onChange={(e) => updateConfig({ agentEndpoint: e.target.value })}
                    placeholder="http://127.0.0.1:8787"
                    size="md"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Agent Token</label>
                  <div className="relative">
                    <Input
                      type="text"
                      autoComplete="new-password"
                      name="agent-token"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      style={{ WebkitTextSecurity: showAgentToken ? 'none' : 'disc' }}
                      value={aiConfig.agentToken || ''}
                      onChange={(e) => updateConfig({ agentToken: e.target.value })}
                      placeholder="test"
                      size="md"
                      className="pr-8"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowAgentToken((prev) => !prev)}
                      className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={showAgentToken ? 'Hide agent token' : 'Show agent token'}
                    >
                      {showAgentToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </Button>
                  </div>
                </div>
                <div
                  className={`text-[11px] flex items-center gap-1 ${
                    agentStatus.state === 'online'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : agentStatus.state === 'offline'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <span className="inline-block h-2 w-2 rounded-full border border-current" />
                  Agent {agentStatus.state === 'unknown' ? 'unknown' : agentStatus.state}
                  {agentStatus.message ? ` · ${agentStatus.message}` : ''}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Endpoint</label>
                  <Input
                    type="text"
                    autoComplete="off"
                    name="proxy-endpoint"
                    value={aiConfig.proxyEndpoint}
                    onChange={(e) => updateConfig({ proxyEndpoint: e.target.value })}
                    placeholder="http://localhost:8317"
                    size="md"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Proxy Key</label>
                  <div className="relative">
                    <Input
                      type="text"
                      autoComplete="new-password"
                      name="proxy-secret"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      style={{ WebkitTextSecurity: showProxyKey ? 'none' : 'disc' }}
                      value={aiConfig.proxyKey || ''}
                      onChange={(e) => updateConfig({ proxyKey: e.target.value })}
                      placeholder="test"
                      size="md"
                      className="pr-8"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowProxyKey((prev) => !prev)}
                      className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={showProxyKey ? 'Hide proxy key' : 'Show proxy key'}
                    >
                      {showProxyKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Management Key</label>
                  <div className="relative">
                    <Input
                      type="text"
                      autoComplete="new-password"
                      name="proxy-management-secret"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      style={{ WebkitTextSecurity: showProxyManagementKey ? 'none' : 'disc' }}
                      value={aiConfig.proxyManagementKey || ''}
                      onChange={(e) => updateConfig({ proxyManagementKey: e.target.value })}
                      placeholder="X-Management-Key"
                      size="md"
                      className="pr-8"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowProxyManagementKey((prev) => !prev)}
                      className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={showProxyManagementKey ? 'Hide management key' : 'Show management key'}
                    >
                      {showProxyManagementKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between">
              <span
                className={`text-xs font-medium flex items-center gap-1 ${
                  connectionState.status === 'connected'
                    ? 'text-green-600 dark:text-green-400'
                    : connectionState.status === 'failed'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {connectionState.status === 'connected' && <Check size={12} />}
                {connectionState.status === 'failed' && <X size={12} />}
                Status: {connectionState.status}
                {connectionState.error && <span className="ml-1 text-red-500">({connectionState.error})</span>}
              </span>

              {connectionState.status !== 'connected' ? (
                <Button
                  onClick={onConnect}
                  disabled={connectionState.status === 'connecting'}
                  className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  {connectionState.status === 'connecting' && <Loader2 size={12} className="animate-spin" />}
                  Test connection
                </Button>
              ) : (
                <Button
                  onClick={onDisconnect}
                  className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <LogOut size={12} /> Disconnect
                </Button>
              )}
            </div>

            {(isAgent || isCliproxy) && connectionState.status === 'connected' && (
              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex flex-col gap-1">
                {isAgent && (
                  <div>
                    Agent: {versionInfo.agentVersion ?? '(unknown)'} · CLI: codex{' '}
                    {versionInfo.codexDetected === false ? '(missing)' : (versionInfo.codexVersion ?? '(unknown)')} · gemini{' '}
                    {versionInfo.geminiDetected === false ? '(missing)' : (versionInfo.geminiVersion ?? '(unknown)')}
                  </div>
                )}
                {isCliproxy && (
                  <div className="space-y-1">
                    <div>
                      cliproxyapi:{' '}
                      {versionInfo.cliproxyapiLatestVersion
                        ? `v${versionInfo.cliproxyapiLatestVersion.replace(/^v/i, '')}`
                        : (versionInfo.cliproxyapiVersion ?? '(unknown)')}
                      {versionInfo.cliproxyUsageSummary ? ` · usage ${versionInfo.cliproxyUsageSummary}` : ''}
                      {versionInfo.cliproxyManagementStatus ? ` · mgmt ${versionInfo.cliproxyManagementStatus}` : ''}
                    </div>
                    {Array.isArray(versionInfo.cliproxyAuthFiles) ? (
                      <div className="text-[10px] leading-tight">
                        <button
                          type="button"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          onClick={() => setShowCliproxySubscriptions((prev) => !prev)}
                        >
                        {showCliproxySubscriptions ? 'Hide subscriptions' : 'Show subscriptions'}
                      </button>
                      {showCliproxySubscriptions && (
                        <div className="mt-1 flex flex-col gap-1">
                          {versionInfo.cliproxyAuthFiles.length === 0 ? (
                            <div className="text-slate-400">No auth files</div>
                          ) : (
                            versionInfo.cliproxyAuthFiles
                              .slice(0, 8)
                              .map((file) => {
                                const isOk = file.status === 'ready' && !file.disabled && !file.unavailable;
                                const tone = isOk
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : file.disabled
                                    ? 'text-slate-500 dark:text-slate-400'
                                    : 'text-amber-600 dark:text-amber-400';
                                const label = file.email || file.label || file.name || file.id;
                                const status = file.disabled ? 'disabled' : file.unavailable ? 'unavailable' : (file.status ?? 'unknown');
                                return (
                                  <div key={file.id} className="flex items-center justify-between gap-2 font-mono tabular-nums">
                                    <span className="truncate">{file.provider}: {label}</span>
                                    <span className={tone}>{status}</span>
                                  </div>
                                );
                              })
                          )}
                            {versionInfo.cliproxyAuthFiles.length > 8 ? (
                              <div className="text-slate-400">…and {versionInfo.cliproxyAuthFiles.length - 8} more</div>
                            ) : null}
                            {versionInfo.cliproxyAuthStatus ? (
                              <div className="text-amber-600 dark:text-amber-400">auth {versionInfo.cliproxyAuthStatus}</div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {versionInfo.cliproxyAuthFiles?.length ? (
                      <div className="text-[10px] leading-tight">
                        <button
                          type="button"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          onClick={() => setShowCliproxyQuotas((prev) => !prev)}
                        >
                          {showCliproxyQuotas ? 'Hide quotas' : 'Show quotas'}
                        </button>
                        {showCliproxyQuotas && (
                          <div className="mt-1 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2 text-slate-400">
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={() => setCliproxyQuotasShowAll((prev) => !prev)}
                              >
                                {cliproxyQuotasShowAll ? 'Paged' : 'Show all'}
                              </button>
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={() => setCliproxyQuotasRefreshIndex((prev) => prev + 1)}
                              >
                                Refresh
                              </button>
                            </div>
                            {cliproxyQuotas.status === 'loading' ? (
                              <div className="text-slate-400">Loading quota...</div>
                            ) : cliproxyQuotas.status === 'error' ? (
                              <div className="text-amber-600 dark:text-amber-400">quota {cliproxyQuotas.error}</div>
                            ) : null}

                            <div className="flex flex-col gap-2">
                              {(() => {
                                const files = (versionInfo.cliproxyAuthFiles ?? []).filter((f) => f.provider === 'codex' && !f.runtimeOnly);
                                if (files.length === 0) return (
                                  <div className="text-slate-400">Codex Quota: no auth files</div>
                                );
                                const shown = cliproxyQuotasShowAll ? files : files.slice(0, 3);
                                return (
                                  <div className="flex flex-col gap-2">
                                    <div className="text-slate-500 dark:text-slate-400">Codex Quota {files.length}</div>
                                    {shown.map((file) => {
                                      const label = file.email || file.label || file.name || file.id;
                                      const quota = cliproxyQuotas.codex?.[file.id];
                                      const planLabel = quota?.planType === 'team' ? 'Team' : quota?.planType === 'plus' ? 'Plus' : quota?.planType === 'free' ? 'Free' : null;
                                      const windows = quota?.windows ?? [];
                                      return (
                                        <div key={file.id} className="rounded border border-slate-200 dark:border-slate-700 p-2">
                                          <div className="font-mono truncate">{label}</div>
                                          {planLabel ? (
                                            <div className="text-slate-400">Plan: {planLabel}</div>
                                          ) : null}
                                          {windows.length ? (
                                            <div className="mt-1 flex flex-col gap-1">
                                              {windows.map((w) => {
                                                const percent = w.usedPercent;
                                                const tone = percent === null
                                                  ? 'bg-slate-200 dark:bg-slate-700'
                                                  : percent >= 60
                                                    ? 'bg-rose-500'
                                                    : percent >= 20
                                                      ? 'bg-amber-500'
                                                      : 'bg-emerald-500';
                                                return (
                                                  <div key={w.id} className="flex flex-col gap-0.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                      <span className="truncate">{w.label}</span>
                                                      <span className="font-mono tabular-nums text-slate-400">{percent === null ? '-' : `${Math.round(percent)}%`} · {w.resetLabel}</span>
                                                    </div>
                                                    <div className="h-1.5 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                                      <div
                                                        className={`h-full ${tone}`}
                                                        style={{ width: `${percent === null ? 0 : Math.max(0, Math.min(100, percent))}%` }}
                                                      />
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          ) : (
                                            <div className="text-slate-400">No quota data</div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}

                              {(() => {
                                const files = (versionInfo.cliproxyAuthFiles ?? []).filter((f) => f.provider === 'gemini-cli' && !f.runtimeOnly);
                                if (files.length === 0) return (
                                  <div className="text-slate-400">Gemini CLI Quota: no auth files</div>
                                );
                                const shown = cliproxyQuotasShowAll ? files : files.slice(0, 3);
                                return (
                                  <div className="flex flex-col gap-2">
                                    <div className="text-slate-500 dark:text-slate-400">Gemini CLI Quota {files.length}</div>
                                    {shown.map((file) => {
                                      const label = file.email || file.label || file.name || file.id;
                                      const quota = cliproxyQuotas.geminiCli?.[file.id];
                                      const items = quota?.items ?? [];
                                      return (
                                        <div key={file.id} className="rounded border border-slate-200 dark:border-slate-700 p-2">
                                          <div className="font-mono truncate">{label}</div>
                                          {items.length ? (
                                            <div className="mt-1 flex flex-col gap-1">
                                              {items.map((it) => {
                                                const percent = it.remainingPercent;
                                                const tone = percent === null
                                                  ? 'bg-slate-200 dark:bg-slate-700'
                                                  : percent >= 60
                                                    ? 'bg-emerald-500'
                                                    : percent >= 20
                                                      ? 'bg-amber-500'
                                                      : 'bg-rose-500';
                                                return (
                                                  <div key={it.id} className="flex flex-col gap-0.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                      <span className="truncate">{it.label}</span>
                                                      <span className="font-mono tabular-nums text-slate-400">{percent === null ? '-' : `${Math.round(percent)}%`} · {it.resetLabel}</span>
                                                    </div>
                                                    <div className="h-1.5 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                                      <div
                                                        className={`h-full ${tone}`}
                                                        style={{ width: `${percent === null ? 0 : Math.max(0, Math.min(100, percent))}%` }}
                                                      />
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          ) : (
                                            <div className="text-slate-400">No quota data</div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>

                            {cliproxyQuotas.updatedAt ? (
                              <div className="text-slate-400">updated {formatMonthDayTime(new Date(cliproxyQuotas.updatedAt))}</div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {versionInfo.cliproxyUsage?.requestsByDay?.length ? (
                      <div className="text-[10px] leading-tight">
                        <button
                          type="button"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          onClick={() => setShowCliproxyUsageDetails((prev) => !prev)}
                        >
                          {showCliproxyUsageDetails ? 'Hide usage details' : 'Show usage details'}
                        </button>
                        {showCliproxyUsageDetails && (
                          <div className="mt-1 flex flex-col gap-1">
                            <div className="font-mono tabular-nums">
                              req/day:{' '}
                              {versionInfo.cliproxyUsage.requestsByDay
                                .map((item) => `${item.day.slice(5)}=${item.requests}`)
                                .join(' ')}
                            </div>
                            {versionInfo.cliproxyUsage.tokensByDay?.length ? (
                              <div className="font-mono tabular-nums">
                                tok/day:{' '}
                                {versionInfo.cliproxyUsage.tokensByDay
                                  .map((item) => `${item.day.slice(5)}=${item.tokens}`)
                                  .join(' ')}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </form>

          {connectionState.status === 'connected' && (
            <div className="mb-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Model</label>
                <Button
                  onClick={() => setShowFilters(!showFilters)}
                  variant="ghost"
                  className="h-auto px-1 py-0 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Filter size={10} /> {showFilters ? 'Hide filters' : 'Filters'}
                </Button>
              </div>

              {showFilters && (
                <div className="mb-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded text-xs grid grid-cols-2 gap-2 border border-slate-100 dark:border-slate-700 dark:text-slate-300">
                  <div className="col-span-2">
                    <label className="block text-[10px] uppercase text-slate-400 mb-1">Vendor</label>
                    <Select
                      value={activeFilters.vendor}
                      onChange={(e) => updateFilters({ vendor: e.target.value })}
                      size="sm"
                    >
                      <option value="">
                        All vendors ({baseFilteredModels.length})
                      </option>
                      {vendorOptions.map(({ vendor, count }) => (
                        <option key={vendor} value={vendor}>
                          {vendor} ({count})
                        </option>
                      ))}
                    </Select>
                  </div>
                  {isOpenRouter && (
                    <div className="col-span-2">
                      <label className="block text-[10px] uppercase text-slate-400 mb-1">Min Context Window</label>
                      <Select
                        value={activeFilters.minContextWindow}
                        onChange={(e) => updateFilters({ minContextWindow: Number(e.target.value) })}
                        size="sm"
                      >
                        <option value="0">Any size</option>
                        <option value="32000">32k+</option>
                        <option value="64000">64k+</option>
                        <option value="128000">128k+</option>
                        <option value="200000">200k+</option>
                        <option value="1000000">1M+</option>
                      </Select>
                    </div>
                  )}
                  {isOpenRouter && (
                    <>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={aiConfig.filtersByProvider.openrouter.freeOnly}
                          onChange={(e) => updateFilters({ freeOnly: e.target.checked })}
                        />
                        Free only
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={aiConfig.filtersByProvider.openrouter.testedOnly}
                          onChange={(e) => updateFilters({ testedOnly: e.target.checked })}
                        />
                        Tested only
                      </label>
                    </>
                  )}
                </div>
              )}

              <Select
                value={aiConfig.selectedModelId}
                onChange={(e) => updateSelectedModel(e.target.value)}
                size="md"
                className="p-2"
              >
                <option value="" disabled>Select a model...</option>
                {filteredModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.contextLength ? `(${formatContextLength(m.contextLength)})` : ''} {m.isFree ? '(Free)' : ''}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {showReasoningControl && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <label className="text-xs text-slate-500 dark:text-slate-400">Reasoning</label>
              <Select
                value={reasoningEffort}
                onChange={(e) => updateReasoningEffort(e.target.value)}
                size="sm"
                className="w-[160px]"
              >
                <option value="auto">Auto</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">XHigh</option>
              </Select>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            <label className="text-xs text-slate-500 dark:text-slate-400">Timeout (s)</label>
            <Input
              type="number"
              min={5}
              max={300}
              value={timeoutSeconds}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                if (Number.isNaN(parsed)) return;
                const clamped = Math.max(5, Math.min(300, Math.floor(parsed)));
                onLLMTimeoutMsChange(clamped * 1000);
              }}
              size="md"
              className="w-24"
            />
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 text-[10px] text-slate-400 text-center">
            Your API key is stored locally in your browser. Requests go directly to your provider.
          </div>
        </div>
      )}
    </div>
  );
};

export default AiControlPlaneMenu;
