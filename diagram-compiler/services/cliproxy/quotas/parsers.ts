import type { CliproxyAuthFile } from '../types';
import { cliproxyQuotaEndpoints, cliproxyQuotaHeaders } from './constants';
import {
  extractCodexAccountId,
  extractGeminiProjectId,
  formatMonthDayTime,
  formatResetFromWindow,
  parseJsonObject,
  toNumberOrNull,
  toPercentOrNull,
  toTrimmedString,
} from './helpers';
import type { CliproxyCodexQuota, CliproxyGeminiCliQuota } from './types';

export type CliproxyQuotaApiCall = (payload: Record<string, unknown>) => Promise<{ statusCode: number; body: unknown }>;

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

type AntigravityCategoryId =
  | 'claude-gpt'
  | 'gemini-3-pro'
  | 'gemini-3-flash'
  | 'gemini-3-pro-image'
  | 'gemini-2-5-pro'
  | 'gemini-2-5-flash'
  | 'gemini-2-5-flash-lite';

const antigravityCategoryOrder: Record<AntigravityCategoryId, number> = {
  'claude-gpt': 10,
  'gemini-3-pro': 20,
  'gemini-3-flash': 30,
  'gemini-3-pro-image': 40,
  'gemini-2-5-pro': 50,
  'gemini-2-5-flash': 60,
  'gemini-2-5-flash-lite': 70,
};

const humanizeAntigravityBucketLabel = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  const normalized = trimmed.toLowerCase();
  if (/^(chat|tab)_\d+$/i.test(trimmed) || normalized.startsWith('tab_') || normalized.startsWith('chat_')) {
    return trimmed;
  }
  if (normalized === 'claude/gpt' || normalized === 'claude-gpt' || (normalized.includes('claude') && normalized.includes('gpt'))) {
    return 'Claude/GPT';
  }

  const stripSuffix = (value: string, suffix: string) => (value.endsWith(suffix) ? value.slice(0, -suffix.length) : value);
  const stripped = stripSuffix(stripSuffix(stripSuffix(normalized, '-preview'), '-latest'), '-stable');
  const base = stripped.startsWith('gemini-') ? stripped.slice('gemini-'.length) : stripped;
  if (!stripped.startsWith('gemini-')) return trimmed;

  const tokens = base.split('-').filter(Boolean);
  const parts: string[] = ['Gemini'];
  tokens.forEach((token) => {
    if (/^\d+(\.\d+)?$/.test(token)) {
      parts.push(token);
      return;
    }
    if (token === 'pro') {
      parts.push('Pro');
      return;
    }
    if (token === 'flash') {
      parts.push('Flash');
      return;
    }
    if (token === 'lite') {
      parts.push('Lite');
      return;
    }
    if (token === 'image') {
      parts.push('Image');
      return;
    }
    parts.push(token.slice(0, 1).toUpperCase() + token.slice(1));
  });
  return parts.join(' ');
};

const categorizeAntigravityModel = (args: { modelKey: string; label: string }): { id: AntigravityCategoryId; label: string } | null => {
  const { modelKey, label } = args;
  const key = modelKey.trim().toLowerCase();
  const text = label.trim().toLowerCase();

  if (!text) return null;
  if (/^(chat|tab)_\d+$/i.test(modelKey.trim()) || key.startsWith('chat_') || key.startsWith('tab_')) return null;
  if (text.startsWith('chat_') || text.startsWith('tab_')) return null;

  if (text.includes('gemini')) {
    if (text.includes('3') && text.includes('image')) return { id: 'gemini-3-pro-image', label: 'Gemini 3 Pro Image' };
    if (text.includes('3') && text.includes('pro')) return { id: 'gemini-3-pro', label: 'Gemini 3 Pro' };
    if (text.includes('3') && text.includes('flash')) return { id: 'gemini-3-flash', label: 'Gemini 3 Flash' };
    if (text.includes('2.5') && text.includes('pro')) return { id: 'gemini-2-5-pro', label: 'Gemini 2.5 Pro' };
    if (text.includes('2.5') && text.includes('flash') && text.includes('lite')) return { id: 'gemini-2-5-flash-lite', label: 'Gemini 2.5 Flash Lite' };
    if (text.includes('2.5') && text.includes('flash')) return { id: 'gemini-2-5-flash', label: 'Gemini 2.5 Flash' };
    return null;
  }

  if (text.includes('claude') || text.includes('gpt')) return { id: 'claude-gpt', label: 'Claude/GPT' };
  return null;
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

export const formatQuotaHttpError = (args: { statusCode: number; body: unknown; provider: 'codex' | 'gemini-cli' | 'antigravity' }) => {
  const { statusCode, body, provider } = args;
  const obj = parseJsonObject(body) ?? parseJsonObject(typeof body === 'string' ? body : null);
  const errorObj = obj && typeof obj.error === 'object' && obj.error && !Array.isArray(obj.error) ? (obj.error as Record<string, unknown>) : null;
  const detail =
    toTrimmedString(errorObj?.message)
    ?? toTrimmedString(obj?.message)
    ?? toTrimmedString((obj as Record<string, unknown> | null)?.error_description)
    ?? toTrimmedString((obj as Record<string, unknown> | null)?.error);
  const hint = statusCode === 401
    ? 'reauth required'
    : statusCode === 403
      ? 'forbidden'
      : statusCode === 429
        ? 'rate limited'
        : null;
  const providerLabel = provider === 'codex' ? 'codex' : provider === 'gemini-cli' ? 'gemini' : 'antigravity';
  const suffix = [hint, detail].filter(Boolean).join(': ');
  return suffix ? `HTTP ${statusCode} (${providerLabel}) ${suffix}` : `HTTP ${statusCode} (${providerLabel})`;
};

export const parseCodexQuota = async (file: CliproxyAuthFile, apiCall: CliproxyQuotaApiCall): Promise<CliproxyCodexQuota> => {
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
    throw new Error(formatQuotaHttpError({ statusCode, body, provider: 'codex' }));
  }
  const obj = parseJsonObject(body) ?? parseJsonObject(typeof body === 'string' ? body : null);
  if (!obj) throw new Error('empty quota');

  const planTypeRaw = toTrimmedString(obj.plan_type ?? obj.planType) ?? toTrimmedString(file.planType);
  const planType = planTypeRaw ? planTypeRaw.toLowerCase() : null;

  const rateLimit = (parseJsonObject(obj.rate_limit ?? obj.rateLimit) ?? null) as Record<string, unknown> | null;
  const codeReviewRateLimit = (parseJsonObject(obj.code_review_rate_limit ?? obj.codeReviewRateLimit) ?? null) as Record<string, unknown> | null;

  const windows: CliproxyCodexQuota['windows'] = [];
  const addWindow = (id: string, label: string, wObj: Record<string, unknown> | null, limitReached: unknown, allowed: unknown) => {
    if (!wObj) return;
    const usedPercent = toPercentOrNull(wObj.used_percent ?? wObj.usedPercent);
    const resetLabel = formatResetFromWindow(wObj);
    const reached = !!limitReached || allowed === false;
    const percent = usedPercent !== null ? usedPercent : (reached && resetLabel !== '-' ? 100 : null);
    windows.push({ id, label, usedPercent: percent, resetLabel });
  };

  const primaryWindow = rateLimit ? (parseJsonObject(rateLimit.primary_window ?? rateLimit.primaryWindow) ?? null) : null;
  const secondaryWindow = rateLimit ? (parseJsonObject(rateLimit.secondary_window ?? rateLimit.secondaryWindow) ?? null) : null;
  const rateLimitReached = rateLimit ? (rateLimit.limit_reached ?? rateLimit.limitReached) : null;
  const rateLimitAllowed = rateLimit ? rateLimit.allowed : null;

  addWindow('primary', '5-hour limit', primaryWindow, rateLimitReached, rateLimitAllowed);
  addWindow('secondary', 'Weekly limit', secondaryWindow, rateLimitReached, rateLimitAllowed);

  const codeReviewWindow = codeReviewRateLimit ? (parseJsonObject(codeReviewRateLimit.primary_window ?? codeReviewRateLimit.primaryWindow) ?? null) : null;
  const codeReviewReached = codeReviewRateLimit ? (codeReviewRateLimit.limit_reached ?? codeReviewRateLimit.limitReached) : null;
  const codeReviewAllowed = codeReviewRateLimit ? codeReviewRateLimit.allowed : null;
  addWindow('code-review', 'Code review limit', codeReviewWindow, codeReviewReached, codeReviewAllowed);

  return { planType, windows };
};

export const parseGeminiCliQuota = async (file: CliproxyAuthFile, apiCall: CliproxyQuotaApiCall): Promise<CliproxyGeminiCliQuota> => {
  const authIndex = toTrimmedString(file.authIndex) ?? null;
  if (!authIndex) throw new Error('missing auth_index');
  const projectId = extractGeminiProjectId({ account: file.account, metadata: file.metadata, attributes: file.attributes });

  const payload: Record<string, unknown> = {
    authIndex,
    method: 'POST',
    url: cliproxyQuotaEndpoints.geminiCliQuota,
    header: { ...cliproxyQuotaHeaders.geminiCli },
  };
  if (projectId) {
    payload.data = JSON.stringify({ project: projectId });
  }

  const { statusCode, body } = await apiCall(payload);
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(formatQuotaHttpError({ statusCode, body, provider: 'gemini-cli' }));
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
      let remainingFraction = toNumberOrNull(remainingFractionRaw);
      if (typeof remainingFractionRaw === 'string' && remainingFractionRaw.trim().endsWith('%')) {
        const parsed = Number(remainingFractionRaw.trim().slice(0, -1));
        remainingFraction = Number.isFinite(parsed) ? parsed / 100 : null;
      }
      if (remainingFraction !== null) {
        remainingFraction = Math.max(0, Math.min(1, remainingFraction));
      }
      const remainingAmount = toNumberOrNull(entry.remainingAmount ?? entry.remaining_amount);
      const resetTime = toTrimmedString(entry.resetTime ?? entry.reset_time) ?? undefined;
      return { modelId, tokenType, remainingFraction, remainingAmount, resetTime };
    })
    .filter((b) => b !== null) as Array<{ modelId: string; tokenType?: string | null; remainingFraction: number | null; remainingAmount: number | null; resetTime?: string }>;

  const items = groupGeminiBuckets(buckets).map((group) => ({
    id: group.id,
    label: group.label,
    remainingPercent: group.remainingPercent,
    resetLabel: group.resetLabel,
  }));
  return { items };
};

export const parseAntigravityQuota = async (file: CliproxyAuthFile, apiCall: CliproxyQuotaApiCall): Promise<CliproxyGeminiCliQuota> => {
  const authIndex = toTrimmedString(file.authIndex) ?? null;
  if (!authIndex) throw new Error('missing auth_index');
  const projectId = extractGeminiProjectId({ account: file.account, metadata: file.metadata, attributes: file.attributes });

  const payload: Record<string, unknown> = {
    authIndex,
    method: 'POST',
    url: cliproxyQuotaEndpoints.antigravityFetchAvailableModels,
    header: { ...cliproxyQuotaHeaders.antigravity },
  };
  payload.data = JSON.stringify(projectId ? { project: projectId } : {});

  const { statusCode, body } = await apiCall(payload);
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(formatQuotaHttpError({ statusCode, body, provider: 'antigravity' }));
  }

  const obj = parseJsonObject(body) ?? parseJsonObject(typeof body === 'string' ? body : null);
  const modelsRaw = obj && typeof (obj as Record<string, unknown>).models === 'object' && (obj as Record<string, unknown>).models && !Array.isArray((obj as Record<string, unknown>).models)
    ? ((obj as Record<string, unknown>).models as Record<string, unknown>)
    : null;
  if (!modelsRaw) return { items: [] };

  const earliestReset = (a?: string, b?: string) => {
    if (!a) return b;
    if (!b) return a;
    const at = new Date(a).getTime();
    const bt = new Date(b).getTime();
    if (Number.isNaN(at)) return b;
    if (Number.isNaN(bt)) return a;
    return at <= bt ? a : b;
  };

  const normalizeFraction = (raw: unknown): number | null => {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      if (trimmed.endsWith('%')) {
        const parsed = Number(trimmed.slice(0, -1));
        if (!Number.isFinite(parsed)) return null;
        return Math.max(0, Math.min(1, parsed / 100));
      }
    }
    let value = toNumberOrNull(raw);
    if (value === null) return null;
    if (value > 1 && value <= 100) value /= 100;
    return Math.max(0, Math.min(1, value));
  };

  const agg = new Map<AntigravityCategoryId, { id: AntigravityCategoryId; label: string; remainingFraction: number | null; resetTime?: string }>();

  Object.entries(modelsRaw).forEach(([modelKey, entryRaw]) => {
    if (!entryRaw || typeof entryRaw !== 'object' || Array.isArray(entryRaw)) return;
    const entry = entryRaw as Record<string, unknown>;

    const quotaInfoRaw = entry.quotaInfo ?? entry.quota_info;
    const quotaInfo = quotaInfoRaw && typeof quotaInfoRaw === 'object' && !Array.isArray(quotaInfoRaw) ? (quotaInfoRaw as Record<string, unknown>) : null;
    const remainingFraction = normalizeFraction(quotaInfo?.remainingFraction ?? quotaInfo?.remaining_fraction);
    const resetTime = toTrimmedString(quotaInfo?.resetTime ?? quotaInfo?.reset_time) ?? undefined;

    const labelBase =
      toTrimmedString(entry.displayName ?? entry.display_name)
      ?? toTrimmedString(entry.modelName ?? entry.model_name)
      ?? toTrimmedString(entry.name)
      ?? modelKey;
    const humanLabel = humanizeAntigravityBucketLabel(labelBase);
    const category = categorizeAntigravityModel({ modelKey, label: humanLabel });
    if (!category) return;

    const prev = agg.get(category.id);
    if (!prev) {
      agg.set(category.id, { id: category.id, label: category.label, remainingFraction, resetTime });
      return;
    }
    if (remainingFraction !== null) {
      prev.remainingFraction = prev.remainingFraction === null ? remainingFraction : Math.min(prev.remainingFraction, remainingFraction);
    }
    prev.resetTime = earliestReset(prev.resetTime, resetTime);
  });

  const items: CliproxyGeminiCliQuota['items'] = Array.from(agg.values())
    .map((it) => ({
      id: it.id,
      label: it.label,
      remainingPercent: it.remainingFraction === null ? null : Math.round(Math.max(0, Math.min(1, it.remainingFraction)) * 100),
      resetLabel: it.resetTime ? formatMonthDayTime(new Date(it.resetTime)) : '-',
    }))
    .sort((a, b) => {
      const ao = antigravityCategoryOrder[a.id as AntigravityCategoryId] ?? 999;
      const bo = antigravityCategoryOrder[b.id as AntigravityCategoryId] ?? 999;
      if (ao !== bo) return ao - bo;
      return a.label.localeCompare(b.label);
    });

  return { items };
};
