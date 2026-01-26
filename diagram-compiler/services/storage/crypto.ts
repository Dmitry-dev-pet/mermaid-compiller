const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type EncryptedPayload = {
  algo: 'AES-GCM';
  v: 1;
  iv: string; // base64
  data: string; // base64
};

export type VaultEnvelope = {
  v: 1;
  salt: string; // base64
  iv: string; // base64
  wrappedKey: string; // base64
};

const toBase64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes));

const fromBase64 = (value: string) => {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
};

const randomBytes = (length: number) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out.buffer;
};

export const deriveMasterKey = async (passphrase: string, salt: Uint8Array) => {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: 200_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const generateVaultKey = async () => {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
};

export const wrapVaultKey = async (vaultKey: CryptoKey, passphrase: string): Promise<VaultEnvelope> => {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const masterKey = await deriveMasterKey(passphrase, salt);
  const rawVault = await crypto.subtle.exportKey('raw', vaultKey);
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, masterKey, rawVault);
  return {
    v: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    wrappedKey: toBase64(new Uint8Array(wrapped)),
  };
};

export const unwrapVaultKey = async (envelope: VaultEnvelope, passphrase: string) => {
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const wrapped = fromBase64(envelope.wrappedKey);
  const masterKey = await deriveMasterKey(passphrase, salt);
  const rawVault = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, masterKey, toArrayBuffer(wrapped));
  return crypto.subtle.importKey('raw', rawVault, 'AES-GCM', false, ['encrypt', 'decrypt']);
};

export const encryptBytes = async (key: CryptoKey, data: Uint8Array): Promise<EncryptedPayload> => {
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, toArrayBuffer(data));
  return {
    algo: 'AES-GCM',
    v: 1,
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(encrypted)),
  };
};

export const decryptBytes = async (key: CryptoKey, payload: EncryptedPayload): Promise<Uint8Array> => {
  const iv = fromBase64(payload.iv);
  const encrypted = fromBase64(payload.data);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, toArrayBuffer(encrypted));
  return new Uint8Array(decrypted);
};

export const encryptJson = async <T>(key: CryptoKey, value: T): Promise<EncryptedPayload> => {
  return encryptBytes(key, encoder.encode(JSON.stringify(value)));
};

export const decryptJson = async <T>(key: CryptoKey, payload: EncryptedPayload): Promise<T> => {
  const bytes = await decryptBytes(key, payload);
  const text = decoder.decode(bytes);
  return JSON.parse(text) as T;
};
