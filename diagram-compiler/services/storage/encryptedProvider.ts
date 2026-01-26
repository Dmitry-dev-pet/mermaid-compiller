import type {
  ProjectBlob,
  ProjectMeta,
  ShareLink,
  SharePermission,
  StorageCapabilities,
  StorageProvider,
  StorageProviderInitResult,
} from './types';
import { decryptBytes, encryptBytes, unwrapVaultKey } from './crypto';
import type { EncryptedPayload } from './crypto';

export type EncryptedProviderConfig = {
  passphrase: string;
  vaultEnvelope?: {
    v: 1;
    salt: string;
    iv: string;
    wrappedKey: string;
  };
  projectKeyId?: string;
};

export type EncryptedProviderState = {
  vaultEnvelope: EncryptedProviderConfig['vaultEnvelope'];
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const encodeEnvelope = (value: unknown): ProjectBlob =>
  encoder.encode(JSON.stringify(value));

const decodeEnvelope = <T>(blob: ProjectBlob): T => {
  const text = decoder.decode(blob);
  return JSON.parse(text) as T;
};

export const createEncryptedProvider = (
  base: StorageProvider,
  config: EncryptedProviderConfig
): { provider: StorageProvider; state: EncryptedProviderState } => {
  let vaultEnvelope = config.vaultEnvelope ?? null;
  let vaultKey: CryptoKey | null = null;

  const ensureVaultKey = async () => {
    if (!vaultEnvelope) {
      const { generateVaultKey, wrapVaultKey } = await import('./crypto');
      const key = await generateVaultKey();
      const env = await wrapVaultKey(key, config.passphrase);
      vaultEnvelope = env;
      vaultKey = key;
      return;
    }
    if (!vaultKey) {
      vaultKey = await unwrapVaultKey(vaultEnvelope, config.passphrase);
    }
  };

  const capabilities: StorageCapabilities = {
    ...base.capabilities,
    e2ee: true,
  };

  const wrapBlob = async (blob: ProjectBlob): Promise<ProjectBlob> => {
    await ensureVaultKey();
    const payload = await encryptBytes(vaultKey!, blob);
    return encodeEnvelope(payload);
  };

  const unwrapBlob = async (blob: ProjectBlob): Promise<ProjectBlob> => {
    await ensureVaultKey();
    const payload = decodeEnvelope<EncryptedPayload>(blob);
    return decryptBytes(vaultKey!, payload);
  };


  const provider: StorageProvider = {
    kind: base.kind,
    capabilities,
    async init(): Promise<StorageProviderInitResult> {
      const result = await base.init();
      if (!result.ok) return result;
      await ensureVaultKey();
      return result;
    },
    async listProjects(): Promise<ProjectMeta[]> {
      return base.listProjects();
    },
    async getProject(id: string) {
      const res = await base.getProject(id);
      if (!res) return null;
      return {
        meta: res.meta,
        blob: await unwrapBlob(res.blob),
      };
    },
    async createProject(args: { title?: string; blob: ProjectBlob }): Promise<ProjectMeta> {
      return base.createProject({ ...args, blob: await wrapBlob(args.blob) });
    },
    async putProject(args: { id: string; blob: ProjectBlob; baseVersion: number; title?: string }) {
      return base.putProject({ ...args, blob: await wrapBlob(args.blob) });
    },
    async deleteProject(id: string) {
      return base.deleteProject(id);
    },
    async createShareLink(args: { projectId: string; permission: SharePermission; expiresAt?: number }): Promise<ShareLink> {
      return base.createShareLink(args);
    },
    async revokeShareLink(linkId: string) {
      return base.revokeShareLink(linkId);
    },
    async fetchShared(args: { token: string }) {
      const res = await base.fetchShared(args);
      if (!res) return null;
      return {
        meta: res.meta,
        blob: await unwrapBlob(res.blob),
      };
    },
    async putShared(args: { token: string; blob: ProjectBlob; baseVersion: number }) {
      return base.putShared({ ...args, blob: await wrapBlob(args.blob) });
    },
  };

  return { provider, state: { vaultEnvelope } };
};
