import {
  CliproxyAuthFile,
  countCliproxyAuthGroup,
  getCliproxyAuthFileLabel,
  isCliproxyAuthFileReady,
  normalizeCliproxyProviderKey,
} from './cliproxyAuthFileStatus';

export type CliproxySubscriptionsGroupBy = 'provider' | 'email';

export type CliproxySubscriptionRow = {
  key: string;
  primary: string;
  count: number;
  secondary?: string;
  statusText: string;
  statusTone: string;
};

export type CliproxySubscriptionsGroup = {
  key: string;
  label: string;
  meta: string;
  rows: CliproxySubscriptionRow[];
  moreCount: number;
};

export type CliproxySubscriptionsViewModel =
  | {
      kind: 'email';
      rows: CliproxySubscriptionRow[];
      moreCount: number;
    }
  | {
      kind: 'provider';
      groups: CliproxySubscriptionsGroup[];
    };

const providerRank = (provider: string) => {
  if (provider === 'codex') return 1;
  if (provider === 'gemini-cli') return 2;
  if (provider === 'antigravity') return 3;
  return 9;
};

const formatStatusSummary = (group: Array<Pick<CliproxyAuthFile, 'status' | 'disabled' | 'unavailable'>>) => {
  const counts = countCliproxyAuthGroup(group);
  if (counts.ok === counts.total) return { text: 'ready', tone: 'text-emerald-600 dark:text-emerald-400' };
  if (counts.disabled === counts.total) return { text: 'disabled', tone: 'text-slate-500 dark:text-slate-400' };
  if (counts.unavailable === counts.total) return { text: 'unavailable', tone: 'text-amber-600 dark:text-amber-400' };
  if (counts.ok > 0 && counts.ok < counts.total) return { text: `partial ${counts.ok}/${counts.total}`, tone: 'text-amber-600 dark:text-amber-400' };
  if (counts.ok === 0 && counts.total > 0) return { text: 'not ready', tone: 'text-amber-600 dark:text-amber-400' };
  return { text: 'unknown', tone: 'text-slate-400' };
};

const collapseByEmail = (files: CliproxyAuthFile[]) => {
  const byEmail = new Map<string, CliproxyAuthFile[]>();
  const singles: CliproxyAuthFile[] = [];
  files.forEach((file) => {
    const emailKey = typeof file.email === 'string' && file.email.trim() ? file.email.trim().toLowerCase() : null;
    if (!emailKey) {
      singles.push(file);
      return;
    }
    const prev = byEmail.get(emailKey);
    if (prev) prev.push(file);
    else byEmail.set(emailKey, [file]);
  });

  const entries: Array<{ key: string; label: string; items: CliproxyAuthFile[] }> = [];
  Array.from(byEmail.entries()).forEach(([key, items]) => {
    entries.push({ key, label: items[0]?.email ?? key, items });
  });
  singles.forEach((file) => {
    entries.push({ key: file.id, label: getCliproxyAuthFileLabel(file), items: [file] });
  });
  entries.sort((a, b) => a.label.localeCompare(b.label));
  return entries;
};

const formatProvidersSummary = (items: CliproxyAuthFile[]): string => {
  const counts = items.reduce((acc, f) => {
    const p = normalizeCliproxyProviderKey(f.provider ?? null);
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  return Object.keys(counts)
    .sort((a, b) => {
      const ra = providerRank(a);
      const rb = providerRank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    })
    .map((p) => `${p}${counts[p] > 1 ? ` ×${counts[p]}` : ''}`)
    .join(' · ');
};

export const buildCliproxySubscriptionsViewModel = (args: {
  files: CliproxyAuthFile[];
  groupBy: CliproxySubscriptionsGroupBy;
  emailPreviewLimit?: number;
  providerRowLimit?: number;
}): CliproxySubscriptionsViewModel => {
  const emailPreviewLimit = args.emailPreviewLimit ?? 8;
  const providerRowLimit = args.providerRowLimit ?? 6;
  const files = args.files;

  if (args.groupBy === 'email') {
    const entries = collapseByEmail(files);
    const rows = entries.slice(0, emailPreviewLimit).map((g) => {
      const providers = formatProvidersSummary(g.items);
      const status = formatStatusSummary(g.items);
      return {
        key: g.key,
        primary: g.label,
        count: g.items.length,
        secondary: providers ? `via ${providers}` : void 0,
        statusText: status.text,
        statusTone: status.tone,
      } satisfies CliproxySubscriptionRow;
    });
    return { kind: 'email', rows, moreCount: Math.max(0, entries.length - rows.length) };
  }

  const byProvider = new Map<string, CliproxyAuthFile[]>();
  files.forEach((file) => {
    const provider = normalizeCliproxyProviderKey(file.provider ?? null);
    const prev = byProvider.get(provider);
    if (prev) prev.push(file);
    else byProvider.set(provider, [file]);
  });
  const providers = Array.from(byProvider.keys()).sort((a, b) => {
    const ra = providerRank(a);
    const rb = providerRank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });

  const groups: CliproxySubscriptionsGroup[] = providers.map((provider) => {
    const groupFiles = byProvider.get(provider) ?? [];
    const counts = countCliproxyAuthGroup(groupFiles);
    const meta = [
      counts.ok ? `${counts.ok} ok` : null,
      counts.disabled ? `${counts.disabled} disabled` : null,
      counts.unavailable ? `${counts.unavailable} unavailable` : null,
      counts.other ? `${counts.other} not ready` : null,
    ].filter(Boolean).join(' · ');

    const entries = collapseByEmail(groupFiles);
    const rows = entries.slice(0, providerRowLimit).map((e) => {
      const status = formatStatusSummary(e.items);
      return {
        key: e.key,
        primary: e.label,
        count: e.items.length,
        statusText: status.text,
        statusTone: status.tone,
      } satisfies CliproxySubscriptionRow;
    });

    return {
      key: provider,
      label: provider,
      meta: meta || `${groupFiles.length} subscriptions`,
      rows,
      moreCount: Math.max(0, entries.length - rows.length),
    };
  });

  return { kind: 'provider', groups };
};

export const isCliproxyAnyProviderReady = (files: CliproxyAuthFile[], providerKey: string): boolean => {
  const p = normalizeCliproxyProviderKey(providerKey);
  return files.some((f) => normalizeCliproxyProviderKey(f.provider ?? null) === p && !f.runtimeOnly && isCliproxyAuthFileReady(f));
};
