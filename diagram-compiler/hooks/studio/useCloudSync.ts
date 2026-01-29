import { useCallback, useMemo, useState } from 'react';
import type { HistorySession } from '../../services/history/types';
import type { SessionBundle } from '../../services/history/bundle';
import {
  createSupabaseByoProvider,
  createSupabaseHostedProvider,
  getCloudLink,
  encodeProjectBundleToBlob,
  setCloudLink,
  StorageConflictError,
  type StorageProvider,
} from '../../services/storage';
import type { StorageProviderKind } from '../../services/storage/types';

export type CloudSyncMode = 'cloud_hosted' | 'cloud_byo';

export type CloudSyncStatus =
  | { kind: 'idle' }
  | { kind: 'syncing'; message: string }
  | { kind: 'success'; message: string; syncedAt: number }
  | { kind: 'error'; message: string };

const resolveProviderKind = (mode: CloudSyncMode): StorageProviderKind => {
  return mode === 'cloud_byo' ? 'supabase_byo' : 'supabase_hosted';
};

const resolveProvider = (mode: CloudSyncMode, byoConfig: { url: string; anonKey: string }): StorageProvider => {
  return mode === 'cloud_byo' ? createSupabaseByoProvider(byoConfig) : createSupabaseHostedProvider();
};

export const useCloudSync = (args: {
  enabled: boolean;
  mode: CloudSyncMode;
  byoConfig: { url: string; anonKey: string };
  projects: HistorySession[];
  activeProjectId: string | null;
  exportProjectBundle: (sessionId: string) => Promise<SessionBundle | null>;
}): {
  status: CloudSyncStatus;
  syncActive: () => Promise<void>;
  syncAll: () => Promise<void>;
} => {
  const { enabled, mode, byoConfig, projects, activeProjectId, exportProjectBundle } = args;

  const providerKind = useMemo(() => resolveProviderKind(mode), [mode]);
  const provider = useMemo(() => resolveProvider(mode, byoConfig), [mode, byoConfig]);

  const [status, setStatus] = useState<CloudSyncStatus>({ kind: 'idle' });

  const syncSession = useCallback(async (sessionId: string) => {
    if (!enabled) return;
    setStatus({ kind: 'syncing', message: 'Exporting project…' });

    const bundle = await exportProjectBundle(sessionId);
    if (!bundle) {
      setStatus({ kind: 'error', message: 'Project not found' });
      return;
    }

    const init = await provider.init();
    if (!init.ok) {
      setStatus({ kind: 'error', message: init.error ?? 'Cloud provider not ready' });
      return;
    }

    const blob = encodeProjectBundleToBlob(bundle);
    const title = bundle.session.title;

    const existing = getCloudLink(sessionId);
    const canReuse = existing && existing.providerKind === providerKind && typeof existing.remoteProjectId === 'string';

    try {
      if (!canReuse) {
        setStatus({ kind: 'syncing', message: 'Creating cloud project…' });
        const meta = await provider.createProject({ title: title ?? undefined, blob });
        setCloudLink(sessionId, {
          providerKind,
          remoteProjectId: meta.id,
          remoteVersion: meta.version,
        });
        setStatus({ kind: 'success', message: 'Uploaded', syncedAt: Date.now() });
        return;
      }

      setStatus({ kind: 'syncing', message: 'Uploading changes…' });
      const meta = await provider.putProject({
        id: existing.remoteProjectId,
        blob,
        baseVersion: existing.remoteVersion,
        title: title ?? undefined,
      });
      setCloudLink(sessionId, {
        providerKind,
        remoteProjectId: meta.id,
        remoteVersion: meta.version,
      });
      setStatus({ kind: 'success', message: 'Synced', syncedAt: Date.now() });
    } catch (e: unknown) {
      if (e instanceof StorageConflictError) {
        setStatus({ kind: 'error', message: 'Conflict: remote project changed' });
        return;
      }
      const message = e instanceof Error ? e.message : 'Cloud sync failed';
      setStatus({ kind: 'error', message });
    }
  }, [enabled, exportProjectBundle, provider, providerKind]);

  const syncActive = useCallback(async () => {
    if (!activeProjectId) {
      setStatus({ kind: 'error', message: 'No active project' });
      return;
    }
    await syncSession(activeProjectId);
  }, [activeProjectId, syncSession]);

  const syncAll = useCallback(async () => {
    if (!enabled) return;
    if (projects.length === 0) {
      setStatus({ kind: 'error', message: 'No projects to sync' });
      return;
    }
    for (let i = 0; i < projects.length; i += 1) {
      const p = projects[i];
      setStatus({ kind: 'syncing', message: `Syncing ${i + 1}/${projects.length}…` });
      await syncSession(p.id);
    }
  }, [enabled, projects, syncSession]);

  return { status, syncActive, syncAll };
};
