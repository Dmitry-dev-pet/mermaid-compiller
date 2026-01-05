export const ANALYTICS_EVENTS = {
  chatStarted: 'diagram_chat_started',
  chatSuccess: 'diagram_chat_success',
  chatFailed: 'diagram_chat_failed',
} as const;

export type ChatAnalyticsEvent = typeof ANALYTICS_EVENTS[keyof typeof ANALYTICS_EVENTS];

export type ChatAnalyticsPayload = {
  mode?: 'chat';
  hasPrompt?: boolean;
  durationMs?: number;
  intentLength?: number;
  error?: 'offline' | 'exception';
};

