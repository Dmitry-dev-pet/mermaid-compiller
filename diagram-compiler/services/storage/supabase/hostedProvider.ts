import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ProjectBlob,
  ProjectMeta,
  ShareLink,
  SharePermission,
  StorageCapabilities,
  StorageProvider,
  StorageProviderInitResult,
} from '../types';
import { StorageConflictError } from '../types';
import { getHostedSupabaseClient } from '../../supabaseClient';

type ProjectRow = {
  id: string;
  owner_id: string;
  title: string | null;
  blob: string;
  version: number;
  updated_at: string;
  created_at: string;
};

const toMeta = (row: ProjectRow): ProjectMeta => ({
  id: row.id,
  title: row.title ?? undefined,
  updatedAt: new Date(row.updated_at).getTime(),
  version: row.version,
});

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const hexToBytes = (hex: string) => {
  const clean = hex.startsWith('\\x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
};

const encodeBytea = (bytes: ProjectBlob) => `\\x${bytesToHex(bytes)}`;

const decodeBytea = (value: unknown): ProjectBlob => {
  if (value instanceof Uint8Array) return value;
  if (typeof value !== 'string') {
    throw new Error('Invalid blob format');
  }
  return hexToBytes(value);
};

const apiShareBase = '/api/share';

const createShareToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const hashToken = async (token: string) => {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const resolveEnv = () => {
  const url = import.meta.env.VITE_SUPABASE_URL ?? '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  return { url, anonKey };
};

const requireUser = async (client: SupabaseClient) => {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data?.user?.id) throw new Error('User is not authenticated');
  return data.user.id;
};

export const createSupabaseHostedProvider = (): StorageProvider => {
  const { url, anonKey } = resolveEnv();
  const client = getHostedSupabaseClient();

  const capabilities: StorageCapabilities = {
    sync: true,
    share: false,
    anonymousShare: false,
    e2ee: false,
  };

  return {
    kind: 'supabase_hosted',
    capabilities,
    async init(): Promise<StorageProviderInitResult> {
      if (!url || !anonKey || !client) {
        return { ok: false, error: 'Missing Supabase env config' };
      }
      return { ok: true };
    },
    async listProjects(): Promise<ProjectMeta[]> {
      if (!client) throw new Error('Supabase client not initialized');
      await requireUser(client);
      const { data, error } = await client
        .from('projects')
        .select('id,owner_id,title,version,updated_at,created_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data as ProjectRow[]).map(toMeta);
    },
    async getProject(id: string) {
      if (!client) throw new Error('Supabase client not initialized');
      await requireUser(client);
      const { data, error } = await client
        .from('projects')
        .select('id,owner_id,title,blob,version,updated_at,created_at')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as ProjectRow;
      return { meta: toMeta(row), blob: decodeBytea(row.blob) };
    },
    async createProject(args: { title?: string; blob: ProjectBlob }): Promise<ProjectMeta> {
      if (!client) throw new Error('Supabase client not initialized');
      const userId = await requireUser(client);
      const { data, error } = await client
        .from('projects')
        .insert({
          owner_id: userId,
          title: args.title ?? null,
          blob: encodeBytea(args.blob),
        })
        .select('id,owner_id,title,blob,version,updated_at,created_at')
        .single();
      if (error) throw error;
      return toMeta(data as ProjectRow);
    },
    async putProject(args: { id: string; blob: ProjectBlob; baseVersion: number; title?: string }) {
      if (!client) throw new Error('Supabase client not initialized');
      await requireUser(client);
      const { data, error } = await client
        .from('projects')
        .update({
          title: args.title ?? null,
          blob: encodeBytea(args.blob),
          version: args.baseVersion + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', args.id)
        .eq('version', args.baseVersion)
        .select('id,owner_id,title,blob,version,updated_at,created_at');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new StorageConflictError();
      }
      return toMeta(data[0] as ProjectRow);
    },
    async deleteProject(id: string) {
      if (!client) throw new Error('Supabase client not initialized');
      await requireUser(client);
      const { error } = await client.from('projects').delete().eq('id', id);
      if (error) throw error;
    },
    async createShareLink(args: { projectId: string; permission: SharePermission; expiresAt?: number }): Promise<ShareLink> {
      if (!client) throw new Error('Supabase client not initialized');
      const token = createShareToken();
      const tokenHash = await hashToken(token);
      const { data, error } = await client
        .from('share_links')
        .insert({
          project_id: args.projectId,
          permission: args.permission,
          token_hash: tokenHash,
          expires_at: args.expiresAt ? new Date(args.expiresAt).toISOString() : null,
          created_by: (await client.auth.getUser()).data.user?.id ?? null,
          wrapped_project_key: null,
        })
        .select('id,permission,expires_at')
        .single();
      if (error) throw error;
      return {
        id: data.id as string,
        permission: data.permission as SharePermission,
        url: `${window.location.origin}/share/${token}`,
        expiresAt: data.expires_at ? new Date(data.expires_at).getTime() : undefined,
      };
    },
    async revokeShareLink(linkId: string) {
      if (!client) throw new Error('Supabase client not initialized');
      const { error } = await client.from('share_links').update({ disabled: true }).eq('id', linkId);
      if (error) throw error;
    },
    async fetchShared(args: { token: string }) {
      const res = await fetch(`${apiShareBase}?token=${encodeURIComponent(args.token)}`, { method: 'GET' });
      if (!res.ok) throw new Error('Shared fetch failed');
      const payload = await res.json();
      const project = payload.project as { id: string; title?: string; blob: string; version: number; updatedAt: string };
      return {
        meta: {
          id: project.id,
          title: project.title ?? undefined,
          updatedAt: new Date(project.updatedAt).getTime(),
          version: project.version,
        },
        blob: decodeBytea(project.blob),
      };
    },
    async putShared(args: { token: string; blob: ProjectBlob; baseVersion: number }) {
      const res = await fetch(`${apiShareBase}?token=${encodeURIComponent(args.token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blob: encodeBytea(args.blob), baseVersion: args.baseVersion }),
      });
      if (res.status === 409) {
        throw new StorageConflictError();
      }
      if (!res.ok) throw new Error('Shared update failed');
      const payload = await res.json();
      const project = payload.project as { id: string; title?: string; version: number; updatedAt: string };
      return {
        id: project.id,
        title: project.title ?? undefined,
        updatedAt: new Date(project.updatedAt).getTime(),
        version: project.version,
      };
    },
  };
};

export type HostedProviderShareLink = ShareLink;
export type HostedProviderSharePermission = SharePermission;
