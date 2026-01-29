export type CliproxyAuthFile = {
  id: string;
  provider?: string | null;
  email?: string | null;
  label?: string | null;
  name?: string | null;
  status?: string | null;
  disabled?: boolean;
  unavailable?: boolean;
  runtimeOnly?: boolean;
};

export const normalizeCliproxyProviderKey = (provider: string | null | undefined): string => {
  const p = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  return p || 'unknown';
};

export const normalizeCliproxyAuthStatus = (status: string | null | undefined): string => {
  const s = typeof status === 'string' ? status.trim().toLowerCase() : '';
  return s || 'unknown';
};

export const isCliproxyAuthFileReady = (file: Pick<CliproxyAuthFile, 'status' | 'disabled' | 'unavailable'>): boolean => {
  if (file.disabled || file.unavailable) return false;
  const status = normalizeCliproxyAuthStatus(file.status ?? null);
  return status === 'ready' || status === 'active';
};

export const getCliproxyAuthFileLabel = (file: Pick<CliproxyAuthFile, 'email' | 'label' | 'name' | 'id'>): string => {
  return file.email || file.label || file.name || file.id;
};

export const getCliproxyAuthFileStatusText = (file: Pick<CliproxyAuthFile, 'status' | 'disabled' | 'unavailable'>): string => {
  if (file.disabled) return 'disabled';
  if (file.unavailable) return 'unavailable';
  return normalizeCliproxyAuthStatus(file.status ?? null);
};

export const getCliproxyAuthStatusTone = (file: Pick<CliproxyAuthFile, 'status' | 'disabled' | 'unavailable'>): string => {
  if (isCliproxyAuthFileReady(file)) return 'text-emerald-600 dark:text-emerald-400';
  if (file.disabled) return 'text-slate-500 dark:text-slate-400';
  return 'text-amber-600 dark:text-amber-400';
};

export type CliproxyAuthGroupCounts = {
  ok: number;
  disabled: number;
  unavailable: number;
  other: number;
  total: number;
};

export const countCliproxyAuthGroup = (group: Array<Pick<CliproxyAuthFile, 'status' | 'disabled' | 'unavailable'>>): CliproxyAuthGroupCounts => {
  return group.reduce((acc, file) => {
    acc.total += 1;
    if (isCliproxyAuthFileReady(file)) acc.ok += 1;
    else if (file.disabled) acc.disabled += 1;
    else if (file.unavailable) acc.unavailable += 1;
    else acc.other += 1;
    return acc;
  }, { ok: 0, disabled: 0, unavailable: 0, other: 0, total: 0 });
};

