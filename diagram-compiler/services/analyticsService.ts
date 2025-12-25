export type DocsUsageSummary = {
  total: number;
  included: number;
  excluded: number;
  includedPaths: string[];
  excludedPaths: string[];
};

export type AnalyticsContext = {
  provider: string | null;
  model: string | null;
  modelParams: Record<string, number | string | boolean | null>;
  modelFilters: Record<string, unknown> | null;
  diagramType: string | null;
  language: string | null;
  analyzeLanguage: string | null;
  docsUsage?: DocsUsageSummary;
};

type AnalyticsPayload = Record<string, unknown>;

const ANALYTICS_ENDPOINT = import.meta.env.VITE_ANALYTICS_ENDPOINT ?? '/api/analytics';
const ANALYTICS_DISABLED = import.meta.env.VITE_ANALYTICS_DISABLED === 'true';
const SESSION_KEY = 'dc_analytics_session_id';
const DISABLED_KEY = 'dc_analytics_disabled';
const isDefaultEndpoint = ANALYTICS_ENDPOINT === '/api/analytics';

const getSessionId = () => {
  if (typeof window === 'undefined') return 'server';
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(SESSION_KEY, next);
  return next;
};

const isAnalyticsDisabled = () => {
  if (ANALYTICS_DISABLED) return true;
  if (typeof window === 'undefined') return false;
  if (isDefaultEndpoint && window.location.hostname === 'localhost') return true;
  return window.localStorage.getItem(DISABLED_KEY) === 'true';
};

const disableAnalytics = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DISABLED_KEY, 'true');
};

export const trackAnalyticsEvent = async (event: string, payload: AnalyticsPayload = {}) => {
  if (isAnalyticsDisabled()) return;
  try {
    const body = {
      event,
      sessionId: getSessionId(),
      timestamp: new Date().toISOString(),
      ...payload,
    };

    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
      const ok = navigator.sendBeacon(ANALYTICS_ENDPOINT, blob);
      if (!ok) {
        disableAnalytics();
      }
      return;
    }

    const res = await fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (res.status === 404) {
      disableAnalytics();
    }
  } catch {
    // Swallow analytics errors to avoid impacting UX.
  }
};
