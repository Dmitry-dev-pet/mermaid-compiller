import { useCallback, useEffect, useState } from 'react';

type GeminiQuotaItem = {
  id: string;
  label: string;
  remaining_percent: number | null;
  reset_label: string;
};

type AgentGeminiQuotaResponse = {
  status: string;
  updated_at: number;
  message?: string | null;
  email?: string | null;
  project_id?: string | null;
  items: GeminiQuotaItem[];
};

export type AgentGeminiQuotaState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  updatedAt?: number;
  message?: string;
  email?: string;
  projectId?: string;
  items: Array<{ id: string; label: string; remainingPercent: number | null; resetLabel: string }>;
};

const normalizeBase = (endpoint: string) => endpoint.trim().replace(/\/$/, '');

export const useAgentGeminiQuota = (args: { enabled: boolean; endpoint: string; token?: string }) => {
  const { enabled, endpoint, token } = args;
  const [state, setState] = useState<AgentGeminiQuotaState>({ status: 'idle', items: [] });
  const [refreshIndex, setRefreshIndex] = useState(0);

  const refresh = useCallback(() => setRefreshIndex((prev) => prev + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const base = normalizeBase(endpoint);
    const t = token?.trim() ?? '';
    if (!base || !t) {
      void Promise.resolve().then(() => setState({ status: 'idle', items: [] }));
      return;
    }
    let cancelled = false;

    const run = async () => {
      void Promise.resolve().then(() => setState((prev) => ({ ...prev, status: 'loading', message: undefined })));
      try {
        const response = await fetch(`${base}/api/gemini/quota`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        const text = await response.text().catch(() => '');
        if (!response.ok) {
          const msg = text.trim() || `HTTP ${response.status}`;
          if (!cancelled) {
            setState({ status: 'error', message: msg, items: [] });
          }
          return;
        }
        const json = (() => {
          try { return JSON.parse(text) as unknown; } catch { return null; }
        })();
        if (!json || typeof json !== 'object') {
          if (!cancelled) setState({ status: 'error', message: 'Invalid response', items: [] });
          return;
        }
        const data = json as AgentGeminiQuotaResponse;
        const items = Array.isArray(data.items) ? data.items : [];
        const mapped = items
          .filter((it) => it && typeof it === 'object' && typeof (it as GeminiQuotaItem).id === 'string')
          .map((it) => ({
            id: it.id,
            label: it.label,
            remainingPercent: typeof it.remaining_percent === 'number' ? it.remaining_percent : null,
            resetLabel: typeof it.reset_label === 'string' ? it.reset_label : '-',
          }));
        const status = (data.status ?? '').toString().toLowerCase();
        const message = typeof data.message === 'string' ? data.message : undefined;
        if (!cancelled) {
          setState({
            status: status === 'ok' ? 'success' : status === 'loading' ? 'loading' : status === 'idle' ? 'idle' : 'error',
            updatedAt: typeof data.updated_at === 'number' ? data.updated_at : undefined,
            message,
            email: typeof data.email === 'string' ? data.email : undefined,
            projectId: typeof data.project_id === 'string' ? data.project_id : undefined,
            items: mapped,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'failed';
        if (!cancelled) setState({ status: 'error', message: msg, items: [] });
      }
    };

    run();
    const interval = window.setInterval(() => void run(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled, endpoint, refreshIndex, token]);

  return { quota: state, refresh };
};

