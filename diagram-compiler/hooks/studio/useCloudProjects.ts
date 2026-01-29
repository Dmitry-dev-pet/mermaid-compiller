import { useCallback, useMemo, useState } from 'react';
import type { SessionBundle, ImportSessionBundleOptions } from '../../services/history/bundle';
import {
  createSupabaseByoProvider,
  createSupabaseHostedProvider,
  decodeProjectBundleFromBlob,
  setCloudLink,
  type ProjectMeta,
  type StorageProvider,
  type StorageProviderKind,
} from '../../services/storage';

export type CloudProjectsMode = 'cloud_hosted' | 'cloud_byo';

export type CloudProjectsStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; message: string }
  | { kind: 'success'; message: string; fetchedAt: number }
  | { kind: 'error'; message: string };

const resolveProviderKind = (mode: CloudProjectsMode): StorageProviderKind => {
  return mode === 'cloud_byo' ? 'supabase_byo' : 'supabase_hosted';
};

const resolveProvider = (mode: CloudProjectsMode, byoConfig: { url: string; anonKey: string }): StorageProvider => {
  return mode === 'cloud_byo' ? createSupabaseByoProvider(byoConfig) : createSupabaseHostedProvider();
};

export const useCloudProjects = (args: {
  enabled: boolean;
  mode: CloudProjectsMode;
  byoConfig: { url: string; anonKey: string };
  importProjectBundle: (bundle: SessionBundle, options?: ImportSessionBundleOptions) => Promise<{ id: string } | null>;
  openProject: (sessionId: string) => Promise<void> | void;
}): {
  status: CloudProjectsStatus;
  projects: ProjectMeta[];
  refresh: () => Promise<void>;
  importFromCloud: (projectId: string) => Promise<void>;
} => {
  const { enabled, mode, byoConfig, importProjectBundle, openProject } = args;

  const providerKind = useMemo(() => resolveProviderKind(mode), [mode]);
  const provider = useMemo(() => resolveProvider(mode, byoConfig), [mode, byoConfig]);

  const [status, setStatus] = useState<CloudProjectsStatus>({ kind: 'idle' });
  const [projects, setProjects] = useState<ProjectMeta[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setStatus({ kind: 'loading', message: 'Loading cloud projects…' });
    const init = await provider.init();
    if (!init.ok) {
      setStatus({ kind: 'error', message: init.error ?? 'Cloud provider not ready' });
      return;
    }
    try {
      const items = await provider.listProjects();
      setProjects(items);
      setStatus({ kind: 'success', message: `${items.length} projects`, fetchedAt: Date.now() });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load cloud projects';
      setStatus({ kind: 'error', message });
    }
  }, [enabled, provider]);

  const importFromCloud = useCallback(
    async (projectId: string) => {
      if (!enabled) return;
      setStatus({ kind: 'loading', message: 'Downloading project…' });
      const init = await provider.init();
      if (!init.ok) {
        setStatus({ kind: 'error', message: init.error ?? 'Cloud provider not ready' });
        return;
      }
      try {
        const remote = await provider.getProject(projectId);
        if (!remote) {
          setStatus({ kind: 'error', message: 'Project not found' });
          return;
        }
        const bundle = decodeProjectBundleFromBlob(remote.blob);
        const imported = await importProjectBundle(bundle, { mode: 'new', setActive: true });
        if (!imported?.id) {
          setStatus({ kind: 'error', message: 'Import failed' });
          return;
        }
        setCloudLink(imported.id, {
          providerKind,
          remoteProjectId: remote.meta.id,
          remoteVersion: remote.meta.version,
        });
        await openProject(imported.id);
        setStatus({ kind: 'success', message: 'Imported', fetchedAt: Date.now() });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Import from cloud failed';
        setStatus({ kind: 'error', message });
      }
    },
    [enabled, importProjectBundle, openProject, provider, providerKind]
  );

  return { status, projects, refresh, importFromCloud };
};
