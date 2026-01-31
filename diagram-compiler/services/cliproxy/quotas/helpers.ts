export const normalizeCliproxyBase = (endpoint: string) => endpoint.trim().replace(/\/v1\/?$/, '').replace(/\/$/, '');

export const formatMonthDayTime = (date: Date) => date.toLocaleString(void 0, {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const formatUnixSeconds = (seconds: number) => {
  const dt = new Date(seconds * 1000);
  if (Number.isNaN(dt.getTime())) return '-';
  return formatMonthDayTime(dt);
};

export const toTrimmedString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value.toString();
  return null;
};

export const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const toPercentOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('%')) {
    const parsed = Number(trimmed.slice(0, -1));
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseJsonObject = (value: unknown): Record<string, unknown> | null => {
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

export const parseJwtOrJsonObject = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === 'object') return Array.isArray(value) ? null : (value as Record<string, unknown>);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const json = parseJsonObject(trimmed);
  if (json) return json;
  return decodeJwtPayload(trimmed);
};

export const extractCodexAccountId = (file: { idToken?: unknown; metadata?: unknown; attributes?: unknown }): string | null => {
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

export const extractGeminiProjectId = (file: { account?: unknown; metadata?: unknown; attributes?: unknown }): string | null => {
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

export const formatResetFromWindow = (windowObj: Record<string, unknown> | null): string => {
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
