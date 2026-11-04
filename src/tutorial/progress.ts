import { useAuthStore } from '../state/useAuthStore';
import { supabase } from '../lib/supabaseClient';
import { TUTORIAL_VERSION } from './runtime';

const key = (id: string | null) => `apnagali.tutorial.v1.${id ?? 'guest'}`;

export function locallySeen(id: string | null): boolean {
  try { return Number(localStorage.getItem(key(id))) >= TUTORIAL_VERSION; }
  catch { return false; }
}

/** Account metadata travels with the account; local acknowledgement also works offline. */
export async function rememberTutorial(id: string | null) {
  try { localStorage.setItem(key(id), String(TUTORIAL_VERSION)); } catch { /* storage blocked */ }
  const user = useAuthStore.getState().session?.user;
  if (!id || user?.id !== id || Number(user.user_metadata.tutorial_version) >= TUTORIAL_VERSION) return;
  const { data, error } = await supabase.auth.updateUser({ data: { tutorial_version: TUTORIAL_VERSION } });
  if (!error && data.user && useAuthStore.getState().session?.user.id === id) {
    useAuthStore.setState((s) => ({ session: s.session ? { ...s.session, user: data.user } : null }));
  }
}
