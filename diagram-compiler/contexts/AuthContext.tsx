import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';

export type AuthStatus = 'disabled' | 'loading' | 'signed_out' | 'signed_in' | 'error';

export type AuthState = {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  error?: string;
};

export type AuthContextValue = AuthState & {
  supabase: SupabaseClient | null;
  loginWithGoogle: () => Promise<void>;
  loginWithGitHub: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const resolveHostedSupabaseConfig = () => {
  const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  return { url, anonKey };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { url, anonKey } = resolveHostedSupabaseConfig();

  const supabase = useMemo(() => {
    if (!url || !anonKey) return null;
    return createClient(url, anonKey, { auth: { persistSession: true } });
  }, [anonKey, url]);

  const [state, setState] = useState<AuthState>(() => ({
    status: supabase ? 'loading' : 'disabled',
    user: null,
    session: null,
  }));

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          setState({ status: 'error', user: null, session: null, error: error.message });
          return;
        }
        const session = data.session ?? null;
        setState({
          status: session ? 'signed_in' : 'signed_out',
          user: session?.user ?? null,
          session,
        });
      } catch (e: unknown) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : 'Auth init failed';
        setState({ status: 'error', user: null, session: null, error: message });
      }
    };

    void init();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setState({
        status: session ? 'signed_in' : 'signed_out',
        user: session?.user ?? null,
        session,
      });
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const loginWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error('Supabase is not configured');
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw error;
  }, [supabase]);

  const loginWithGitHub = useCallback(async () => {
    if (!supabase) throw new Error('Supabase is not configured');
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo },
    });
    if (error) throw error;
  }, [supabase]);

  const logout = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, [supabase]);

  const value = useMemo<AuthContextValue>(() => {
    return {
      ...state,
      supabase,
      loginWithGoogle,
      loginWithGitHub,
      logout,
    };
  }, [loginWithGoogle, loginWithGitHub, logout, state, supabase]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider />');
  }
  return ctx;
};
