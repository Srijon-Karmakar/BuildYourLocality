import { useState, type FormEvent } from 'react';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { flushSync } from '../lib/sync';
import { useAuthStore } from '../state/useAuthStore';

const btn = 'min-h-11 rounded-lg px-3 py-1.5 text-white/80 hover:bg-white/10 disabled:opacity-40 sm:min-h-0';

/** Sign-in and sign-out (the city saves itself). `inline` stacks it for the phone menu sheet instead of using dropdowns. */
export function AccountPanel({ inline = false }: { inline?: boolean }) {
  const session = useAuthStore((s) => s.session);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const signOut = useAuthStore((s) => s.signOut);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: FormEvent, action: 'in' | 'up') => {
    e.preventDefault();
    setBusy(true);
    const error = await (action === 'in' ? signIn : signUp)(email, password);
    setBusy(false);
    setMessage(error);
    if (!error) setOpen(false);
  };

  const logOut = async () => {
    setBusy(true);
    await flushSync(); // make sure the last edits are in the account before leaving it
    await signOut();
    setBusy(false);
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="pointer-events-auto rounded-xl bg-black/50 px-3 py-2 text-sm text-white/60 backdrop-blur-sm">
        Accounts off — add Supabase keys to .env.local
      </div>
    );
  }

  return (
    <div className="pointer-events-auto relative">
      <div className="flex items-center gap-1 rounded-xl bg-black/50 px-2 py-1.5 text-sm backdrop-blur-sm">
        {session ? (
          <>
            <span className="max-w-40 truncate px-2 text-white/60">{session.user.email}</span>
            <button className={btn} disabled={busy} onClick={() => void logOut()}>
              Sign out
            </button>
          </>
        ) : (
          <button className={btn} onClick={() => setOpen((v) => !v)}>
            Sign in
          </button>
        )}
      </div>

      {message && (
        <div className={inline ? 'mt-2 w-full rounded-lg bg-white/10 px-3 py-2 text-xs text-white/80' : 'absolute right-0 top-12 w-64 rounded-lg bg-black/70 px-3 py-2 text-xs text-white/80'}>
          {message}
        </div>
      )}

      {open && !session && (
        <form
          onSubmit={(e) => void submit(e, 'in')}
          className={inline ? 'mt-2 flex w-full flex-col gap-2 rounded-xl bg-white/10 p-4 text-sm text-white' : 'absolute right-0 top-12 z-10 flex w-64 flex-col gap-2 rounded-xl bg-black/80 p-4 text-sm text-white backdrop-blur-sm'}
        >
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 rounded-lg bg-white/10 px-3 py-1.5 text-base outline-none placeholder:text-white/40 sm:min-h-0 sm:text-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-11 rounded-lg bg-white/10 px-3 py-1.5 text-base outline-none placeholder:text-white/40 sm:min-h-0 sm:text-sm"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-white px-3 py-1.5 text-black disabled:opacity-40">
              Sign in
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => void submit(e, 'up')}
              className="flex-1 rounded-lg px-3 py-1.5 text-white/80 hover:bg-white/10 disabled:opacity-40"
            >
              Sign up
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
