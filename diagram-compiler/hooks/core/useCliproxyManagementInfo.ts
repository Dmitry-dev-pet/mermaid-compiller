import { useEffect, useState } from 'react';
import type { CliproxyAuthFile } from '../../services/cliproxy/types';

export type CliproxyUsageDetails = {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
  requestsByDay: Array<{ day: string; requests: number }>;
  tokensByDay: Array<{ day: string; tokens: number }>;
};

export type CliproxyManagementInfo = {
  cliproxyapiVersion?: string;
  cliproxyapiLatestVersion?: string;
  cliproxyUsageSummary?: string;
  cliproxyManagementStatus?: string;
  cliproxyUsage?: CliproxyUsageDetails;
  cliproxyAuthFiles?: CliproxyAuthFile[];
  cliproxyAuthStatus?: string;
};

const normalizeCliproxyBase = (endpoint: string) => endpoint.trim().replace(/\/v1\/?$/, '').replace(/\/$/, '');

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

const toTrimmedString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value.toString();
  return null;
};

const toBoolOrUndefined = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return undefined;
};

export const useCliproxyManagementInfo = (args: {
  enabled: boolean;
  endpoint: string;
  proxyKey?: string;
  managementKey?: string;
}) => {
  const { enabled, endpoint, proxyKey, managementKey } = args;
  const [info, setInfo] = useState<CliproxyManagementInfo>({});

  useEffect(() => {
    if (!enabled) return;
    const rawEndpoint = endpoint?.trim() ?? '';
    if (!rawEndpoint) {
      void Promise.resolve().then(() => setInfo({}));
      return;
    }

    let cancelled = false;
    const base = normalizeCliproxyBase(rawEndpoint);

    const inferenceHeaders: Record<string, string> = {};
    const trimmedProxyKey = proxyKey?.trim();
    if (trimmedProxyKey) inferenceHeaders.Authorization = `Bearer ${trimmedProxyKey}`;

    const managementHeaders: Record<string, string> = {};
    const trimmedManagementKey = managementKey?.trim();
    if (trimmedManagementKey) {
      managementHeaders['X-Management-Key'] = trimmedManagementKey;
      managementHeaders.Authorization = `Bearer ${trimmedManagementKey}`;
    }

    const fetchAll = async () => {
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
      let usageDetails: CliproxyUsageDetails | undefined;
      try {
        const response = await fetch(`${base}/v0/management/usage`, { headers: managementHeaders });
        if (!cancelled && (response.status === 401 || response.status === 403)) {
          const errText = await response.text().catch(() => '');
          managementStatus = managementStatus ?? (errText.trim() || `unauthorized (${response.status})`);
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

      let authFiles: CliproxyAuthFile[] | undefined;
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
                const runtimeOnly = toBoolOrUndefined(data.runtime_only ?? data.runtimeOnly);
                const authIndex = toTrimmedString(data.auth_index ?? data.authIndex) ?? undefined;
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
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setInfo({
          cliproxyapiVersion: detectedVersion,
          cliproxyapiLatestVersion: latestVersion,
          cliproxyUsageSummary: usageSummary,
          cliproxyManagementStatus: managementStatus,
          cliproxyUsage: usageDetails,
          cliproxyAuthFiles: authFiles,
          cliproxyAuthStatus: authStatus,
        });
      });
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [enabled, endpoint, managementKey, proxyKey]);

  return info;
};

