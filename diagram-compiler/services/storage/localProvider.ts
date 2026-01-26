import type { ProjectBundleFile, SessionBundle } from '../history/bundle';
import { exportSessionBundle, importSessionBundle } from '../history/bundle';
import { createSession, deleteSession, getSession, listSessions } from '../history/store';
import type {
  ProjectBlob,
  ProjectMeta,
  ShareLink,
  SharePermission,
  StorageCapabilities,
  StorageProvider,
  StorageProviderInitResult,
} from './types';
import { StorageConflictError } from './types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const encodeBlob = (payload: ProjectBundleFile): ProjectBlob => encoder.encode(JSON.stringify(payload));
const decodeBlob = (blob: ProjectBlob): ProjectBundleFile => {
  const text = decoder.decode(blob);
  const parsed = JSON.parse(text) as ProjectBundleFile;
  if (!parsed || parsed.schema !== 'mermaid-langgraph.project' || parsed.version !== 1 || !parsed.bundle) {
    throw new Error('Invalid project bundle');
  }
  return parsed;
};

const toMeta = (session: { id: string; title?: string; updatedAt?: number; createdAt: number }): ProjectMeta => {
  const updatedAt = session.updatedAt ?? session.createdAt;
  return {
    id: session.id,
    title: session.title,
    updatedAt,
    version: updatedAt,
  };
};

const unsupported = (feature: string) => () => {
  throw new Error(`${feature} is not supported by local storage provider`);
};

export const createLocalProvider = (): StorageProvider => {
  const capabilities: StorageCapabilities = {
    sync: false,
    share: false,
    anonymousShare: false,
    e2ee: false,
  };

  return {
    kind: 'local',
    capabilities,
    async init(): Promise<StorageProviderInitResult> {
      return { ok: true };
    },
    async listProjects(): Promise<ProjectMeta[]> {
      const sessions = await listSessions();
      return sessions.map(toMeta);
    },
    async getProject(id: string) {
      const bundle = await exportSessionBundle(id);
      if (!bundle) return null;
      const payload: ProjectBundleFile = {
        schema: 'mermaid-langgraph.project',
        version: 1,
        exportedAt: Date.now(),
        bundle,
      };
      return {
        meta: toMeta(bundle.session),
        blob: encodeBlob(payload),
      };
    },
    async createProject(args: { title?: string; blob: ProjectBlob }): Promise<ProjectMeta> {
      if (!args.blob || args.blob.length === 0) {
        const session = await createSession({ title: args.title });
        return toMeta(session);
      }
      const payload = decodeBlob(args.blob);
      const session = await importSessionBundle(payload.bundle, { mode: 'new' });
      return toMeta(session);
    },
    async putProject(args: { id: string; blob: ProjectBlob; baseVersion: number; title?: string }) {
      const existing = await getSession(args.id);
      if (!existing) {
        throw new Error('Project not found');
      }
      const currentVersion = existing.updatedAt ?? existing.createdAt;
      if (args.baseVersion !== currentVersion) {
        throw new StorageConflictError();
      }
      const payload = decodeBlob(args.blob);
      const bundle: SessionBundle = {
        ...payload.bundle,
        session: {
          ...payload.bundle.session,
          id: args.id,
          title: args.title ?? payload.bundle.session.title,
        },
      };
      const session = await importSessionBundle(bundle, { mode: 'replace' });
      return toMeta(session);
    },
    async deleteProject(id: string) {
      await deleteSession(id);
    },
    createShareLink: unsupported('Share link'),
    revokeShareLink: unsupported('Share link'),
    fetchShared: unsupported('Shared access'),
    putShared: unsupported('Shared access'),
  };
};

export const LOCAL_PROVIDER_CAPABILITIES: StorageCapabilities = {
  sync: false,
  share: false,
  anonymousShare: false,
  e2ee: false,
};

export type LocalProviderShareLink = ShareLink;
export type LocalProviderSharePermission = SharePermission;
