import { createClient } from '@supabase/supabase-js';
import { isPractice } from '../tutorial/runtime';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False until .env.local has real keys; the UI uses this to disable account features. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase env vars are missing. Copy .env.example to .env.local and fill in your project URL/anon key.',
  );
}

// Placeholder values keep createClient from throwing when unconfigured.
export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'missing-anon-key',
  isPractice ? { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } : undefined,
);
