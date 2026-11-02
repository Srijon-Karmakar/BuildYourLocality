import { useState } from 'react';
import { rewardById, TOKENS_PER_AD } from '../lib/rewards';
import { adBlockedReason, buyReward, watchAdForTokens } from '../lib/wallet';
import { useWalletStore } from '../state/useWalletStore';
import { createWorld, deleteWorld, openWorld, renameWorld } from '../lib/sync';
import { useAuthStore } from '../state/useAuthStore';
import { FREE_WORLDS, useWorldsStore, worldLimit, type WorldMeta } from '../state/useWorldsStore';
import { Icon } from './icons';

const ago = (t: number) => {
  if (!t) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const small = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base text-white/70 active:bg-white/20 sm:h-8 sm:w-8 sm:hover:bg-white/10 sm:hover:text-white';

function WorldRow({ world, active, busy }: { world: WorldMeta; active: boolean; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(world.name);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const err = await renameWorld(world.id, name);
    setError(err);
    if (!err) setEditing(false);
  };

  return (
    <li className={`rounded-2xl p-2 ${active ? 'bg-white/15' : 'bg-white/5'}`}>
      <div className="flex items-center gap-1.5">
        {editing ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input
              autoFocus
              maxLength={30}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1 bg-white/10 px-3 py-1.5 text-base outline-none sm:text-sm"
            />
            <button type="submit" className={small} aria-label="Save name">
              <Icon name="check" />
            </button>
          </form>
        ) : (
          <button
            disabled={busy || active}
            onClick={() => void openWorld(world.id)}
            className="min-w-0 flex-1 rounded-xl px-2 py-1 text-left disabled:cursor-default"
            aria-label={active ? `${world.name} (open)` : `Open ${world.name}`}
          >
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{world.name}</span>
              {active && <span className="shrink-0 rounded-full bg-emerald-400/90 px-1.5 text-[10px] font-semibold text-black">OPEN</span>}
            </span>
            <span className="block truncate text-[11px] text-white/50">
              {world.pieces !== undefined ? `${world.pieces} ${world.pieces === 1 ? "piece" : "pieces"}` : "Saved world"}
              {world.updatedAt ? ` · ${ago(world.updatedAt)}` : ''}
            </span>
          </button>
        )}
        {!editing && (
          <>
            <button
              className={small}
              onClick={() => {
                setName(world.name);
                setEditing(true);
              }}
              aria-label="Rename"
              title="Rename"
            >
              <Icon name="edit" />
            </button>
            <button
              className={`${small} ${confirm ? '!bg-red-600 !text-white' : ''}`}
              disabled={busy}
              onBlur={() => setConfirm(false)}
              onClick={() => {
                if (!confirm) return setConfirm(true);
                setConfirm(false);
                void deleteWorld(world.id).then(setError);
              }}
              aria-label={confirm ? 'Tap again to delete for good' : 'Delete'}
              title={confirm ? 'Tap again to delete for good' : 'Delete'}
            >
              <Icon name="trash" />
            </button>
          </>
        )}
      </div>
      {error && <div className="mt-1 px-2 text-xs text-amber-300">{error}</div>}
    </li>
  );
}

/** The player's worlds: open, rename, delete, start a new one, or unlock more by watching an ad. */
export function WorldsPanel() {
  const worlds = useWorldsStore((s) => s.worlds);
  const activeId = useWorldsStore((s) => s.activeId);
  const extra = useWorldsStore((s) => s.extraSlots);
  const busy = useWorldsStore((s) => s.busy);
  const signedIn = useAuthStore((s) => !!s.session);
  const [message, setMessage] = useState<string | null>(null);
  const tokens = useWalletStore((s) => s.tokens);
  const watching = useWalletStore((s) => s.watching);

  const limit = worldLimit(extra);
  const full = worlds.length >= limit;

  const add = async () => {
    const err = await createWorld();
    setMessage(err === 'limit' ? 'All world slots are in use.' : err);
  };

  const slotCost = rewardById('slot')?.cost ?? 20;
  const unlock = async () => setMessage(await buyReward('slot'));
  const earn = async () => setMessage(await watchAdForTokens());

  return (
    <div className="flex flex-col gap-3 text-xs text-white sm:text-sm">
      <div className="flex items-center justify-between">
        <span className="text-white/70">
          {worlds.length} of {limit} worlds
        </span>
        <span className="text-[11px] text-white/45">
          {FREE_WORLDS} free{extra > 0 ? ` + ${extra} unlocked` : ''}
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {worlds.map((w) => (
          <WorldRow key={w.id} world={w} active={w.id === activeId} busy={busy} />
        ))}
      </ul>

      {full ? (
        <div className="flex flex-col gap-1.5">
          <button
            disabled={busy || tokens < slotCost}
            onClick={() => void unlock()}
            className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-black active:bg-white/80 disabled:bg-white/15 disabled:text-white/45 sm:min-h-0 sm:py-2"
          >
            <Icon name="lock" />
            Unlock a world
            <span className="flex items-center gap-1 font-semibold">
              <Icon name="coins" />
              {slotCost}
            </span>
          </button>
          <button
            disabled={watching || !!adBlockedReason()}
            onClick={() => void earn()}
            className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-amber-400 px-4 text-sm font-medium text-black active:bg-amber-300 disabled:opacity-45 sm:min-h-0 sm:py-2"
          >
            <Icon name="watchad" />
            {watching ? 'Ad playing…' : `Watch an ad: +${TOKENS_PER_AD} tokens`}
          </button>
          <span className="text-center text-[11px] text-white/45">You have {tokens} tokens.</span>
        </div>
      ) : (
        <button
          disabled={busy}
          onClick={() => void add()}
          className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-black active:bg-white/80 disabled:opacity-50 sm:min-h-0 sm:py-2"
        >
          <Icon name="plus" />
          New world
        </button>
      )}

      {message && <p className="text-xs text-amber-300">{message}</p>}
      <p className="text-[11px] leading-snug text-white/45">
        {signedIn ? 'Your worlds are saved to your account.' : 'Not signed in: worlds are kept on this device only. Sign in to keep them in your account.'}
      </p>
    </div>
  );
}
