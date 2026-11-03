import { useCallback, useEffect, useState } from 'react';
import { refreshWorlds, setPublicBuild, setVisibility } from '../lib/sync';
import { listMembers, listRequests, regenerateJoinCode, removeMember, resolveRequest, type PersonRow } from '../lib/worldPersistence';
import { useAuthStore } from '../state/useAuthStore';
import { useWorldsStore, type WorldMeta, type WorldVisibility } from '../state/useWorldsStore';

const chip = (on: boolean) =>
  `flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition ${on ? 'bg-white text-black' : 'bg-white/10 text-white/75 active:bg-white/20 sm:hover:bg-white/15'}`;
const action = 'rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/80 active:bg-white/20 sm:hover:bg-white/15';

const linkFor = (query: string) => `${window.location.origin}/?${query}`;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Owner controls for one world: private or public, who may build, invite code, friends and requests. */
export function ShareSettings({ world }: { world: WorldMeta }) {
  const signedIn = useAuthStore((s) => !!s.session);
  const [members, setMembers] = useState<PersonRow[]>([]);
  const [requests, setRequests] = useState<PersonRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const visibility: WorldVisibility = world.visibility ?? 'private';

  const load = useCallback(async () => {
    if (!signedIn || visibility !== 'private') return;
    const [m, r] = await Promise.all([listMembers(world.id), listRequests(world.id)]);
    setMembers(m);
    setRequests(r);
  }, [signedIn, visibility, world.id]);

  useEffect(() => {
    // Friends can ask at any time, so keep the list fresh while this panel is open.
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 10_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  if (!signedIn) return <p className="px-2 pb-1 text-[11px] text-white/55">Sign in to share this world.</p>;

  const run = async (job: Promise<string | null>) => {
    const err = await job;
    setNote(err);
    if (!err) void load();
  };

  const copyText = async (text: string, label: string) => setNote((await copy(text)) ? `${label} copied.` : `Copy this: ${text}`);

  return (
    <div className="mt-2 flex flex-col gap-2.5 rounded-xl bg-black/25 p-2.5 text-xs">
      <div className="flex gap-1.5">
        <button className={chip(visibility === 'private')} onClick={() => void run(setVisibility(world.id, 'private'))}>
          Private
        </button>
        <button className={chip(visibility === 'public')} onClick={() => void run(setVisibility(world.id, 'public'))}>
          Public
        </button>
      </div>

      {visibility === 'public' ? (
        <>
          <p className="text-[11px] leading-snug text-white/55">Listed in Community. Any signed-in player can walk through it.</p>
          <label className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-2.5 py-2">
            <span>
              <span className="block text-white">Let visitors build</span>
              <span className="block text-[11px] text-white/50">{world.publicBuild === false ? 'Explore only' : 'Anyone can add and remove pieces'}</span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-emerald-400"
              checked={world.publicBuild !== false}
              onChange={(e) => void run(setPublicBuild(world.id, e.target.checked))}
            />
          </label>
        </>
      ) : (
        <>
          <p className="text-[11px] leading-snug text-white/55">Only you and friends you invite. Friends can build any time, even when you are offline.</p>
          <div className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2">
            <div className="min-w-0 flex-1">
              <span className="block text-[11px] text-white/50">Invite code</span>
              <span className="block truncate font-mono text-base tracking-widest text-white">{world.joinCode ?? '…'}</span>
            </div>
            <button className={action} disabled={!world.joinCode} onClick={() => void copyText(linkFor(`join=${world.joinCode}`), 'Invite link')}>
              Copy link
            </button>
            <button
              className={action}
              onClick={() =>
                void regenerateJoinCode(world.id).then(({ error }) => {
                  setNote(error ?? 'New code made. The old one no longer works.');
                  if (!error) void refreshWorlds();
                })
              }
            >
              New code
            </button>
          </div>
          <button className={`${action} self-start`} onClick={() => void copyText(linkFor(`world=${world.id}`), 'Request link')}>
            Copy request link
          </button>

          {requests.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-amber-300">Wants to join</span>
              {requests.map((r) => (
                <div key={r.userId} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <button className={action} onClick={() => void run(resolveRequest(world.id, r.userId, true))}>
                    Approve
                  </button>
                  <button className={action} onClick={() => void run(resolveRequest(world.id, r.userId, false))}>
                    Decline
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-white/45">Friends ({members.length})</span>
            {members.length === 0 && <span className="text-[11px] text-white/45">Nobody yet. Share the code or the request link.</span>}
            {members.map((m) => (
              <div key={m.userId} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <button className={action} onClick={() => void run(removeMember(world.id, m.userId))}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {note && <p className="text-[11px] text-amber-300">{note}</p>}
    </div>
  );
}

/** Who else is in the open world right now. */
export function OnlineNow() {
  const online = useWorldsStore((s) => s.online);
  if (online.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-xl bg-emerald-400/15 px-2.5 py-1.5 text-[11px] text-emerald-200">
      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
      <span className="truncate">{online.map((o) => `${o.name}${o.mode ? (o.mode === 'build' ? ' (building)' : ' (walking)') : ''}`).join(', ')} here with you</span>
    </div>
  );
}
