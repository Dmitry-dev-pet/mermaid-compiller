import { useCallback, useMemo, useRef, useState } from 'react';
import type { HistorySession } from '../../services/history/types';
import type { SessionBundle } from '../../services/history/bundle';
import {
  createSupabaseByoProvider,
  createSupabaseHostedProvider,
  encodeProjectBundleToBlob,
  getCloudLink,
  setCloudLink,
  type StorageProvider,
  type StorageProviderKind,
} from '../../services/storage';

export type CloudMigrationMode = 'cloud_hosted' | 'cloud_byo';

export type CloudMigrationItemStatus = 'pending' | 'syncing' | 'success' | 'skipped' | 'error';

export type CloudMigrationItem = {
  sessionId: string;
  title: string;
  status: CloudMigrationItemStatus;
  message?: string;
};

export type CloudMigrationStatus =
  | { kind: 'idle' }
  | { kind: 'syncing'; message: string; done: number; total: number }
  | { kind: 'success'; message: string; syncedAt: number }
  | { kind: 'cancelled'; message: string }
  | { kind: 'error'; message: string };

const resolveProviderKind = (mode: CloudMigrationMode): StorageProviderKind => {
  return mode === 'cloud_byo' ? 'supabase_byo' : 'supabase_hosted';
};

const resolveProvider = (mode: CloudMigrationMode, byoConfig: { url: string; anonKey: string }): StorageProvider => {
  return mode === 'cloud_byo' ? createSupabaseByoProvider(byoConfig) : createSupabaseHostedProvider();
};

export const useCloudMigration = (args: {
  enabled: boolean;
  mode: CloudMigrationMode;
  byoConfig: { url: string; anonKey: string };
  localProjects: HistorySession[];
  activeProjectId: string | null;
  exportProjectBundle: (sessionId: string) => Promise<SessionBundle | null>;
  onAfterMigration?: () => Promise<void> | void;
}): {
  status: CloudMigrationStatus;
  items: CloudMigrationItem[];
  unlinkedCount: number;
  migrateAll: () => Promise<void>;
  migrateActive: () => Promise<void>;
  cancel: () => void;
  reset: () => void;
} => {
  const { enabled, mode, byoConfig, localProjects, activeProjectId, exportProjectBundle, onAfterMigration } = args;

  const providerKind = useMemo(() => resolveProviderKind(mode), [mode]);
  const provider = useMemo(() => resolveProvider(mode, byoConfig), [mode, byoConfig]);

  const [status, setStatus] = useState<CloudMigrationStatus>({ kind: 'idle' });
  const [items, setItems] = useState<CloudMigrationItem[]>([]);
  const cancelRef = useRef(false);

  const unlinkedCount = useMemo(() => {
    if (!enabled) return 0;
    let count = 0;
    for (const project of localProjects) {
      const existing = getCloudLink(project.id);
      if (!existing || existing.providerKind !== providerKind) {
        count += 1;
      }
    }
    return count;
  }, [enabled, localProjects, providerKind]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setStatus({ kind: 'cancelled', message: 'Cancelled' });
  }, []);

  const reset = useCallback(() => {
    cancelRef.current = false;
    setStatus({ kind: 'idle' });
    setItems([]);
  }, []);

  const migrate = useCallback(
    async (sessionIds: string[]) => {
      if (!enabled) return;
      cancelRef.current = false;

      const init = await provider.init();
      if (!init.ok) {
        setStatus({ kind: 'error', message: init.error ?? 'Cloud provider not ready' });
        return;
      }

      const sessions = sessionIds
        .map((id) => localProjects.find((p) => p.id === id) ?? null)
        .filter((p): p is HistorySession => !!p);

      const initialItems: CloudMigrationItem[] = sessions.map((p) => ({
        sessionId: p.id,
        title: p.title ?? 'Project',
        status: 'pending',
      }));
      setItems(initialItems);

      const total = initialItems.length;
      let done = 0;
      let failed = 0;

      for (let i = 0; i < sessions.length; i += 1) {
        if (cancelRef.current) return;
        const project = sessions[i];
        const existing = getCloudLink(project.id);
        const alreadyLinked = !!existing && existing.providerKind === providerKind;

        if (alreadyLinked) {
          done += 1;
          setItems((prev) =>
            prev.map((it) => (it.sessionId === project.id ? { ...it, status: 'skipped', message: 'Already linked' } : it))
          );
          setStatus({ kind: 'syncing', message: `Migrating ${done}/${total}…`, done, total });
          continue;
        }

        setItems((prev) =>
          prev.map((it) => (it.sessionId === project.id ? { ...it, status: 'syncing', message: 'Uploading…' } : it))
        );
        setStatus({ kind: 'syncing', message: `Migrating ${done + 1}/${total}…`, done, total });

        const bundle = await exportProjectBundle(project.id);
        if (!bundle) {
          done += 1;
          failed += 1;
          setItems((prev) =>
            prev.map((it) => (it.sessionId === project.id ? { ...it, status: 'error', message: 'Project not found' } : it))
          );
          setStatus({ kind: 'syncing', message: `Migrating ${done}/${total}…`, done, total });
          continue;
        }

        try {
          const blob = encodeProjectBundleToBlob(bundle);
          const meta = await provider.createProject({ title: bundle.session.title ?? undefined, blob });
          setCloudLink(project.id, {
            providerKind,
            remoteProjectId: meta.id,
            remoteVersion: meta.version,
          });
          done += 1;
          setItems((prev) =>
            prev.map((it) => (it.sessionId === project.id ? { ...it, status: 'success', message: 'Uploaded' } : it))
          );
          setStatus({ kind: 'syncing', message: `Migrating ${done}/${total}…`, done, total });
        } catch (e: unknown) {
          done += 1;
          failed += 1;
          const message = e instanceof Error ? e.message : 'Upload failed';
          setItems((prev) =>
            prev.map((it) => (it.sessionId === project.id ? { ...it, status: 'error', message } : it))
          );
          setStatus({ kind: 'syncing', message: `Migrating ${done}/${total}…`, done, total });
        }
      }

      setStatus({
        kind: 'success',
        message: failed > 0 ? `Migrated with errors (${failed})` : 'Migrated',
        syncedAt: Date.now(),
      });
      if (onAfterMigration) {
        await onAfterMigration();
      }
    },
    [enabled, exportProjectBundle, localProjects, onAfterMigration, provider, providerKind]
  );

  const migrateAll = useCallback(async () => {
    await migrate(localProjects.map((p) => p.id));
  }, [localProjects, migrate]);

  const migrateActive = useCallback(async () => {
    if (!activeProjectId) return;
    await migrate([activeProjectId]);
  }, [activeProjectId, migrate]);

  return { status, items, unlinkedCount, migrateAll, migrateActive, cancel, reset };
};
