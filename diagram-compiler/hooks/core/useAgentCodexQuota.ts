import { useCallback, useEffect, useState } from 'react';

type CodexRateLimitWindow = {
  id: string;
  label: string;
  used_percent: number | null;
  remaining_percent: number | null;
  reset_label: string;
};

type AgentCodexQuotaResponse = {
  status: string;
  updated_at: number;
  message?: string | null;
  plan_type?: string | null;
  credits_balance?: string | null;
  has_credits?: boolean | null;
  unlimited?: boolean | null;
  windows: CodexRateLimitWindow[];
};

export type AgentCodexQuotaState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  updatedAt?: number;
  message?: string;
  planType?: string;
  creditsBalance?: string;
  hasCredits?: boolean;
  unlimited?: boolean;
  windows: Array<{
    id: string;
    label: string;
    usedPercent: number | null;
    remainingPercent: number | null;
    resetLabel: string;
  }>;
};

const normalizeBase = (endpoint: string) => endpoint.trim().replace(/\/$/, '');

export const useAgentCodexQuota = (args: { enabled: boolean; endpoint: string; token?: string }) => {
  const { enabled, endpoint, token } = args;
  const [state, setState] = useState<AgentCodexQuotaState>({ status: 'idle', windows: [] });
  const [refreshIndex, setRefreshIndex] = useState(0);

  const refresh = useCallback(() => setRefreshIndex((prev) => prev + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const base = normalizeBase(endpoint);
    const t = token?.trim() ?? '';
    if (!base || !t) {
      void Promise.resolve().then(() => setState({ status: 'idle', windows: [] }));
      return;
    }
    let cancelled = false;

    const run = async () => {
      void Promise.resolve().then(() => setState((prev) => ({ ...prev, status: 'loading', message: undefined })));
      try {
        const response = await fetch(`${base}/api/codex/quota`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        const text = await response.text().catch(() => '');
        if (!response.ok) {
          const msg = text.trim() || `HTTP ${response.status}`;
          if (!cancelled) {
            setState({ status: 'error', message: msg, windows: [] });
          }
          return;
        }
        const json = (() => {
          try { return JSON.parse(text) as unknown; } catch { return null; }
        })();
        if (!json || typeof json !== 'object') {
          if (!cancelled) setState({ status: 'error', message: 'Invalid response', windows: [] });
          return;
        }
        const data = json as AgentCodexQuotaResponse;
        const windows = Array.isArray(data.windows) ? data.windows : [];
        const mapped = windows
          .filter((w) => w && typeof w === 'object' && typeof (w as CodexRateLimitWindow).id === 'string')
          .map((w) => ({
            id: w.id,
            label: w.label,
            usedPercent: typeof w.used_percent === 'number' ? w.used_percent : null,
            remainingPercent: typeof w.remaining_percent === 'number' ? w.remaining_percent : null,
            resetLabel: typeof w.reset_label === 'string' ? w.reset_label : '-',
          }));
        const status = (data.status ?? '').toString().toLowerCase();
        const message = typeof data.message === 'string' ? data.message : undefined;
        if (!cancelled) {
          setState({
            status: status === 'ok' ? 'success' : status === 'loading' ? 'loading' : status === 'idle' ? 'idle' : 'error',
            updatedAt: typeof data.updated_at === 'number' ? data.updated_at : undefined,
            message,
            planType: typeof data.plan_type === 'string' ? data.plan_type : undefined,
            creditsBalance: typeof data.credits_balance === 'string' ? data.credits_balance : undefined,
            hasCredits: typeof data.has_credits === 'boolean' ? data.has_credits : undefined,
            unlimited: typeof data.unlimited === 'boolean' ? data.unlimited : undefined,
            windows: mapped,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'failed';
        if (!cancelled) setState({ status: 'error', message: msg, windows: [] });
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

