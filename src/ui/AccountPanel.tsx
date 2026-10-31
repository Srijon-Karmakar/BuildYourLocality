import { useEffect, useState, type FormEvent } from 'react';
import { loadWorld, saveWorld } from '../lib/worldPersistence';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { useAuthStore } from '../state/useAuthStore';

const btn = 'rounded-lg px-3 py-1.5 text-white/80 hover:bg-white/10 disabled:opacity-40';

export function AccountPanel() {
  const session = useAuthStore((s) => s.session);
  const init = useAuthStore((s) => s.init);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const signOut = useAuthStore((s) => s.signOut);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => init(), [init]);

  const submit = async (e: FormEvent, action: 'in' | 'up') => {
    e.preventDefault();
    setBusy(true);
    const error = await (action === 'in' ? signIn : signUp)(email, password);
    setBusy(false);
    setMessage(error);
    if (!error) setOpen(false);
  };

  const run = async (label: string, fn: (userId: string) => Promise<string | null>) => {
    if (!session) return;
    setBusy(true);
    setMessage(`${label}…`);
    const error = await fn(session.user.id);
    setBusy(false);
    setMessage(error ?? `${label} done`);
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
            <button className={btn} disabled={busy} onClick={() => run('Saving', saveWorld)}>
              Save
            </button>
            <button className={btn} disabled={busy} onClick={() => run('Loading', loadWorld)}>
              Load
            </button>
            <button className={btn} onClick={() => void signOut()}>
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
        <div className="absolute right-0 top-12 w-64 rounded-lg bg-black/70 px-3 py-2 text-xs text-white/80">
          {message}
        </div>
      )}

      {open && !session && (
        <form
          onSubmit={(e) => void submit(e, 'in')}
          className="absolute right-0 top-12 z-10 flex w-64 flex-col gap-2 rounded-xl bg-black/80 p-4 text-sm text-white backdrop-blur-sm"
        >
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg bg-white/10 px-3 py-1.5 outline-none placeholder:text-white/40"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg bg-white/10 px-3 py-1.5 outline-none placeholder:text-white/40"
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
