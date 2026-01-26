import { useCallback, useEffect, useState } from 'react';
import { safeParse } from '../../utils';

export type ByoSupabaseConfig = {
  url: string;
  anonKey: string;
};

const STORAGE_KEY = 'dc_byo_supabase_config';

const DEFAULT_CONFIG: ByoSupabaseConfig = {
  url: '',
  anonKey: '',
};

export const useStorageConfig = () => {
  const [byoConfig, setByoConfig] = useState<ByoSupabaseConfig>(() =>
    safeParse(STORAGE_KEY, DEFAULT_CONFIG)
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(byoConfig));
    } catch (e) {
      console.error('Failed to persist BYO config', e);
    }
  }, [byoConfig]);

  const updateByoConfig = useCallback((updates: Partial<ByoSupabaseConfig>) => {
    setByoConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  return { byoConfig, setByoConfig, updateByoConfig };
};
