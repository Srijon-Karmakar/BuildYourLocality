import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

interface AuthState {
  session: Session | null;
  /** True once the initial session lookup has finished. */
  ready: boolean;
  init: () => () => void;
  /** Resolves to an error message, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  ready: !isSupabaseConfigured,
  init: () => {
    if (!isSupabaseConfigured) return () => {};
    void supabase.auth.getSession().then(({ data }) => set({ session: data.session, ready: true }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => set({ session }));
    return () => data.subscription.unsubscribe();
  },
  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  },
  signUp: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return error.message;
    // With email confirmation enabled there is no session until the link is clicked.
    if (!data.session) return 'Check your email to confirm your account, then sign in.';
    return null;
  },
  signOut: async () => {
    await supabase.auth.signOut();
  },
}));
