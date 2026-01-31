import type { SupabaseClient } from '@supabase/supabase-js';
import { getDeviceKeyPair } from './deviceKeys';

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const fromBase64 = (value: string) => {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
};

export type ProjectKeyInfo = {
  key: CryptoKey;
  deviceKeyId: string;
};

export const wrapProjectKeyForDevice = async (projectKey: CryptoKey, publicKey: CryptoKey): Promise<string> => {
  const wrapped = await crypto.subtle.wrapKey('raw', projectKey, publicKey, { name: 'RSA-OAEP' });
  return toBase64(new Uint8Array(wrapped));
};

export const unwrapProjectKeyForDevice = async (wrappedKey: string, privateKey: CryptoKey): Promise<CryptoKey> => {
  const wrappedBytes = fromBase64(wrappedKey);
  return crypto.subtle.unwrapKey(
    'raw',
    wrappedBytes,
    privateKey,
    { name: 'RSA-OAEP' },
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const getProjectKeyForDevice = async (
  client: SupabaseClient,
  projectId: string,
  userId: string
): Promise<ProjectKeyInfo | null> => {
  const device = await getDeviceKeyPair();
  const { data, error } = await client
    .from('project_member_keys')
    .select('wrapped_key,key_id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('key_id', device.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const key = await unwrapProjectKeyForDevice(data.wrapped_key as string, device.privateKey);
  return { key, deviceKeyId: device.id };
};

export const createProjectKeyForOwner = async (
  client: SupabaseClient,
  projectId: string,
  userId: string
): Promise<ProjectKeyInfo> => {
  const device = await getDeviceKeyPair();
  const projectKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const wrapped = await wrapProjectKeyForDevice(projectKey, device.publicKey);
  const { error } = await client.from('project_member_keys').insert({
    project_id: projectId,
    user_id: userId,
    key_id: device.id,
    wrapped_key: wrapped,
  });
  if (error) throw error;
  return { key: projectKey, deviceKeyId: device.id };
};

export const ensureProjectKeyForOwner = async (
  client: SupabaseClient,
  projectId: string,
  userId: string
): Promise<ProjectKeyInfo | null> => {
  const existing = await getProjectKeyForDevice(client, projectId, userId);
  if (existing) return existing;
  const { error, count } = await client
    .from('project_member_keys')
    .select('project_id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (error) throw error;
  if ((count ?? 0) > 0) return null;
  return createProjectKeyForOwner(client, projectId, userId);
};

export const shareProjectKeyWithUser = async (
  client: SupabaseClient,
  projectId: string,
  ownerId: string,
  targetUserId: string
) => {
  const ownerKey = await ensureProjectKeyForOwner(client, projectId, ownerId);
  if (!ownerKey) throw new Error('Missing project key for this device');
  const { data, error } = await client
    .from('user_device_keys')
    .select('key_id,public_key')
    .eq('user_id', targetUserId)
    .is('revoked_at', null);
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Recipient device key not found');
  for (const row of data) {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      row.public_key as JsonWebKey,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['wrapKey']
    );
    const wrapped = await wrapProjectKeyForDevice(ownerKey.key, publicKey);
    const { error: insertError } = await client.from('project_member_keys').upsert(
      {
        project_id: projectId,
        user_id: targetUserId,
        key_id: row.key_id as string,
        wrapped_key: wrapped,
      },
      { onConflict: 'project_id,user_id,key_id' }
    );
    if (insertError) throw insertError;
  }
};
