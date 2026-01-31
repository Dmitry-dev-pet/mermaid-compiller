import type { SupabaseClient } from '@supabase/supabase-js';

type StoredDeviceKey = {
  id: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
};

export type DeviceKeyPair = {
  id: string;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
};

const STORAGE_KEY = 'dc_device_keypair_v1';

const readStoredKey = (): StoredDeviceKey | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDeviceKey>;
    if (!parsed?.id || !parsed.publicKeyJwk || !parsed.privateKeyJwk) return null;
    return {
      id: parsed.id,
      publicKeyJwk: parsed.publicKeyJwk,
      privateKeyJwk: parsed.privateKeyJwk,
    };
  } catch {
    return null;
  }
};

const saveStoredKey = (payload: StoredDeviceKey) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

const generateDeviceKeyPair = async (): Promise<StoredDeviceKey> => {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['wrapKey', 'unwrapKey']
  );
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const payload = { id: crypto.randomUUID(), publicKeyJwk, privateKeyJwk };
  saveStoredKey(payload);
  return payload;
};

const importPublicKey = async (jwk: JsonWebKey) =>
  crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['wrapKey']);

const importPrivateKey = async (jwk: JsonWebKey) =>
  crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['unwrapKey']);

export const getDeviceKeyPair = async (): Promise<DeviceKeyPair> => {
  const stored = readStoredKey() ?? (await generateDeviceKeyPair());
  const [publicKey, privateKey] = await Promise.all([
    importPublicKey(stored.publicKeyJwk),
    importPrivateKey(stored.privateKeyJwk),
  ]);
  return {
    id: stored.id,
    publicKey,
    privateKey,
    publicKeyJwk: stored.publicKeyJwk,
    privateKeyJwk: stored.privateKeyJwk,
  };
};

export const ensureDeviceKeyRegistered = async (client: SupabaseClient, userId: string): Promise<DeviceKeyPair> => {
  const device = await getDeviceKeyPair();
  const { error } = await client.from('user_device_keys').upsert(
    {
      user_id: userId,
      key_id: device.id,
      public_key: device.publicKeyJwk,
    },
    { onConflict: 'user_id,key_id' }
  );
  if (error) throw error;
  return device;
};
