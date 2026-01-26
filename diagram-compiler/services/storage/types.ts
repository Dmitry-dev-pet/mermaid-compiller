export type StorageProviderKind = 'local' | 'supabase_hosted' | 'supabase_byo';

export type StorageCapabilities = {
  sync: boolean;
  share: boolean;
  anonymousShare: boolean;
  e2ee: boolean;
};

export type ProjectMeta = {
  id: string;
  title?: string;
  updatedAt: number;
  version: number;
};

export type ProjectBlob = Uint8Array;

export type SharePermission = 'viewer' | 'editor';

export type ShareLink = {
  id: string;
  permission: SharePermission;
  url: string;
  expiresAt?: number;
};

export type StorageProviderInitResult = {
  ok: boolean;
  error?: string;
};

export class StorageConflictError extends Error {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'StorageConflictError';
  }
}

export interface StorageProvider {
  kind: StorageProviderKind;
  capabilities: StorageCapabilities;

  init(): Promise<StorageProviderInitResult>;

  listProjects(): Promise<ProjectMeta[]>;
  getProject(id: string): Promise<{ meta: ProjectMeta; blob: ProjectBlob } | null>;
  createProject(args: { title?: string; blob: ProjectBlob }): Promise<ProjectMeta>;
  putProject(args: { id: string; blob: ProjectBlob; baseVersion: number; title?: string }): Promise<ProjectMeta>;
  deleteProject(id: string): Promise<void>;

  createShareLink(args: { projectId: string; permission: SharePermission; expiresAt?: number }): Promise<ShareLink>;
  revokeShareLink(linkId: string): Promise<void>;

  fetchShared(args: { token: string }): Promise<{ meta: ProjectMeta; blob: ProjectBlob } | null>;
  putShared(args: { token: string; blob: ProjectBlob; baseVersion: number }): Promise<ProjectMeta>;
}
