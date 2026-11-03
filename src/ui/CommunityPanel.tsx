import { useCallback, useEffect, useState } from 'react';
import { joinWithCode, requestJoin, visitWorld } from '../lib/sync';
import { listPublicWorlds, type WorldRow } from '../lib/worldPersistence';
import { useAuthStore } from '../state/useAuthStore';
import { useWorldsStore } from '../state/useWorldsStore';

const button =
  'rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black active:bg-white/80 disabled:bg-white/15 disabled:text-white/45';
const input = 'min-w-0 flex-1 rounded-full bg-white/10 px-3.5 py-2 text-base outline-none placeholder:text-white/35 sm:text-sm';

/** Public worlds from all players: walk through them, and build in them when the owner allows it. */
export function CommunityList() {
  const signedIn = useAuthStore((s) => !!s.session);
  const me = useAuthStore((s) => s.session?.user.id);
  const activeId = useWorldsStore((s) => s.activeId);
  const busy = useWorldsStore((s) => s.busy);
  const [worlds, setWorlds] = useState<WorldRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setWorlds(null);
    const res = await listPublicWorlds();
    setError(res.error);
    setWorlds(res.worlds);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [signedIn, load]);

  if (!signedIn) return <p className="text-xs text-white/60">Sign in to explore worlds other players made public.</p>;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-white/70">Public worlds</span>
        <button className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/80 active:bg-white/20" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {worlds === null && <p className="text-xs text-white/50">Loading…</p>}
      {worlds?.length === 0 && !error && <p className="text-xs text-white/50">No public worlds yet. Make one of yours public to be the first.</p>}
      {error && <p className="text-xs text-amber-300">{error}</p>}
      <ul className="flex flex-col gap-1.5">
        {worlds?.map((w) => (
          <li key={w.id} className="flex items-center gap-2 rounded-2xl bg-white/5 p-2.5">
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{w.name}</span>
              <span className="block truncate text-[11px] text-white/50">
                {w.ownerId === me ? 'Yours' : `by ${w.ownerName ?? 'a player'}`} · {w.publicBuild === false ? 'Explore only' : 'Anyone can build'}
              </span>
            </div>
            <button
              className={button}
              disabled={busy || w.id === activeId}
              onClick={() => void visitWorld(w.id).then(setError)}
            >
              {w.id === activeId ? 'Open' : 'Visit'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Joining a friend's private world with their code, or by asking them. */
export function JoinFriend() {
  const signedIn = useAuthStore((s) => !!s.session);
  const [code, setCode] = useState('');
  const [link, setLink] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  if (!signedIn) return <p className="text-xs text-white/60">Sign in to join a friend’s world.</p>;

  /** Accepts a pasted request link or just the world id. */
  const worldIdFrom = (text: string) => {
    const match = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return match ? match[0] : '';
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void joinWithCode(code).then((err) => setMessage(err ?? 'Joined.'));
        }}
      >
        <span className="text-white/70">I have a code</span>
        <div className="flex gap-1.5">
          <input className={`${input} font-mono uppercase tracking-widest`} maxLength={12} placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className={button} type="submit" disabled={!code.trim()}>
            Join
          </button>
        </div>
      </form>

      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const id = worldIdFrom(link);
          if (!id) return setMessage('Paste the request link your friend sent you.');
          void requestJoin(id).then((r) => setMessage(r.message));
        }}
      >
        <span className="text-white/70">Ask to join</span>
        <div className="flex gap-1.5">
          <input className={input} placeholder="Paste the request link" value={link} onChange={(e) => setLink(e.target.value)} />
          <button className={button} type="submit" disabled={!link.trim()}>
            Ask
          </button>
        </div>
        <span className="text-[11px] text-white/45">The owner gets your request and can approve it from their Share settings.</span>
      </form>
      {message && <p className="text-xs text-amber-300">{message}</p>}
    </div>
  );
}
