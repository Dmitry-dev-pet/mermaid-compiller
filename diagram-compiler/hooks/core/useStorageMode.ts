import { useCallback, useEffect, useState } from 'react';
import { safeParse } from '../../utils';

export type StorageMode = 'local' | 'cloud_hosted' | 'cloud_byo';

const STORAGE_KEY = 'dc_storage_mode';
const DEFAULT_MODE: StorageMode = 'local';

const coerceStorageMode = (value: unknown): StorageMode => {
  if (value === 'local' || value === 'cloud_hosted' || value === 'cloud_byo') return value;
  return DEFAULT_MODE;
};

export const useStorageMode = () => {
  const [storageMode, setStorageMode] = useState<StorageMode>(() => {
    const parsed = safeParse(STORAGE_KEY, DEFAULT_MODE);
    return coerceStorageMode(parsed);
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storageMode));
    } catch (e) {
      console.error('Failed to persist storage mode', e);
    }
  }, [storageMode]);

  const updateStorageMode = useCallback((mode: StorageMode) => {
    setStorageMode(mode);
  }, []);

  return { storageMode, setStorageMode: updateStorageMode };
};

