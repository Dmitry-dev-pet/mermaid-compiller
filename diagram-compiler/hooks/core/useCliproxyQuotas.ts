import { useCallback, useEffect, useState } from 'react';
import type { CliproxyAuthFile } from '../../services/cliproxy/types';
import {
  normalizeCliproxyBase,
  toNumberOrNull,
} from '../../services/cliproxy/quotas/helpers';
import {
  parseAntigravityQuota,
  parseCodexQuota,
  parseGeminiCliQuota,
  type CliproxyQuotaApiCall,
} from '../../services/cliproxy/quotas/parsers';
import type { CliproxyGeminiCliQuota, CliproxyCodexQuota, CliproxyQuotasState } from '../../services/cliproxy/quotas/types';

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

export const useCliproxyQuotas = (args: {
  enabled: boolean;
  endpoint: string;
  managementKey: string;
  authFiles: CliproxyAuthFile[];
  showAll: boolean;
  pageSize?: number;
}) => {
  const { enabled, endpoint, managementKey, authFiles, showAll, pageSize = 3 } = args;
  const [state, setState] = useState<CliproxyQuotasState>({ status: 'idle' });
  const [refreshIndex, setRefreshIndex] = useState(0);

  const refresh = useCallback(() => setRefreshIndex((prev) => prev + 1), []);

  useEffect(() => {
    if (!enabled) return;

    const base = normalizeCliproxyBase(endpoint);
    const key = managementKey.trim();
    const cleanAuthFiles = authFiles ?? [];

    if (!base || !key || cleanAuthFiles.length === 0) {
      void Promise.resolve().then(() => setState({ status: 'idle' }));
      return;
    }

    let cancelled = false;

    const managementHeaders: Record<string, string> = {
      'X-Management-Key': key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    };

      const apiCall: CliproxyQuotaApiCall = async (payload: Record<string, unknown>) => {
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

      const parseCodexQuotaForFile = (file: CliproxyAuthFile): Promise<CliproxyCodexQuota> =>
        parseCodexQuota(file, apiCall);
      const parseGeminiCliQuotaForFile = (file: CliproxyAuthFile): Promise<CliproxyGeminiCliQuota> =>
        parseGeminiCliQuota(file, apiCall);
      const parseAntigravityQuotaForFile = (file: CliproxyAuthFile): Promise<CliproxyGeminiCliQuota> =>
        parseAntigravityQuota(file, apiCall);

    const run = async () => {
      void Promise.resolve().then(() => setState((prev) => ({ ...prev, status: 'loading', error: undefined })));

      const codexFilesAll = cleanAuthFiles.filter((f) => f.provider === 'codex' && !f.runtimeOnly);
      const geminiFilesAll = cleanAuthFiles.filter((f) => f.provider === 'gemini-cli' && !f.runtimeOnly);
      const antigravityFilesAll = cleanAuthFiles.filter((f) => f.provider === 'antigravity' && !f.runtimeOnly);
      const codexFiles = showAll ? codexFilesAll : codexFilesAll.slice(0, pageSize);
      const geminiFiles = showAll ? geminiFilesAll : geminiFilesAll.slice(0, pageSize);
      const antigravityFiles = showAll ? antigravityFilesAll : antigravityFilesAll.slice(0, pageSize);

      const codexEntries = await mapWithConcurrency(codexFiles, 3, async (file) => {
        try {
          return { id: file.id, quota: await parseCodexQuotaForFile(file) };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'failed';
          return { id: file.id, quota: { planType: null, windows: [{ id: 'error', label: 'Error', usedPercent: null, resetLabel: message }] } as CliproxyCodexQuota };
        }
      });
      const geminiEntries = await mapWithConcurrency(geminiFiles, 3, async (file) => {
        try {
          return { id: file.id, quota: await parseGeminiCliQuotaForFile(file) };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'failed';
          return { id: file.id, quota: { items: [{ id: 'error', label: 'Error', remainingPercent: null, resetLabel: message }] } as CliproxyGeminiCliQuota };
        }
      });
      const antigravityEntries = await mapWithConcurrency(antigravityFiles, 3, async (file) => {
        try {
          return { id: file.id, quota: await parseAntigravityQuotaForFile(file) };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'failed';
          return { id: file.id, quota: { items: [{ id: 'error', label: 'Error', remainingPercent: null, resetLabel: message }] } as CliproxyGeminiCliQuota };
        }
      });

      if (cancelled) return;
      const codexMap: Record<string, CliproxyCodexQuota> = {};
      codexEntries.forEach((e) => { codexMap[e.id] = e.quota; });
      const geminiMap: Record<string, CliproxyGeminiCliQuota> = {};
      geminiEntries.forEach((e) => { geminiMap[e.id] = e.quota; });
      const antigravityMap: Record<string, CliproxyGeminiCliQuota> = {};
      antigravityEntries.forEach((e) => { antigravityMap[e.id] = e.quota; });

      void Promise.resolve().then(() => {
        if (cancelled) return;
        setState({
          status: 'success',
          updatedAt: new Date().toISOString(),
          codex: codexMap,
          geminiCli: geminiMap,
          antigravity: antigravityMap,
        });
      });
    };

    run().catch((err: unknown) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : 'failed';
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setState({ status: 'error', error: message });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [authFiles, enabled, endpoint, managementKey, pageSize, refreshIndex, showAll]);

  return {
    quotas: state,
    refresh,
  };
};
