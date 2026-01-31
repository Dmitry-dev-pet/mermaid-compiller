import type { SupabaseClient } from '@supabase/supabase-js';
import type { VaultEnvelope } from './crypto';
import { unwrapVaultKey, wrapVaultKey } from './crypto';
import { getDeviceKeyPair } from './deviceKeys';
import { wrapProjectKeyForDevice } from './projectKeys';
import type { ProjectMemberRole } from './projectMembers';

const createInviteToken = () => {
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

export const createProjectInvite = async (
  client: SupabaseClient,
  args: {
    projectId: string;
    email: string;
    role: ProjectMemberRole;
    projectKey: CryptoKey;
    createdBy: string | null;
    expiresAt?: number;
  }
): Promise<{ token: string }> => {
  const token = createInviteToken();
  const tokenHash = await hashToken(token);
  const wrapped = await wrapVaultKey(args.projectKey, token);
  const { error } = await client.from('project_invites').insert({
    project_id: args.projectId,
    email: args.email,
    role: args.role,
    token_hash: tokenHash,
    wrapped_project_key: wrapped,
    expires_at: args.expiresAt ? new Date(args.expiresAt).toISOString() : null,
    created_by: args.createdBy,
  });
  if (error) throw error;
  return { token };
};

export const acceptInviteAndStoreKey = async (client: SupabaseClient, token: string) => {
  const { data, error } = await client.rpc('accept_invite', { token });
  if (error) throw error;
  if (!data) throw new Error('Invite not found');
  const payload = data as {
    project_id: string;
    role: ProjectMemberRole;
    wrapped_project_key: VaultEnvelope;
  };
  const projectKey = await unwrapVaultKey(payload.wrapped_project_key, token);
  const device = await getDeviceKeyPair();
  const wrappedForDevice = await wrapProjectKeyForDevice(projectKey, device.publicKey);
  const user = await client.auth.getUser();
  const userId = user.data.user?.id;
  if (!userId) throw new Error('User is not authenticated');
  const { error: insertError } = await client.from('project_member_keys').insert({
    project_id: payload.project_id,
    user_id: userId,
    key_id: device.id,
    wrapped_key: wrappedForDevice,
  });
  if (insertError) throw insertError;
  return { projectId: payload.project_id, role: payload.role };
};
