import { useState } from 'react';
import { useMoneyFormat } from '../lib/currency';
import { MONEY_PER_AD } from '../lib/rewards';
import { slotPrice } from '../lib/shop';
import { adBlockedReason, buyReward, watchAdForMoney } from '../lib/wallet';
import { useWalletStore } from '../state/useWalletStore';
import { createWorld, deleteWorld, leaveVisit, openWorld, renameWorld } from '../lib/sync';
import { useAuthStore } from '../state/useAuthStore';
import { FREE_WORLDS, ownedCount, useWorldsStore, worldLimit, type WorldMeta, type WorldVisibility } from '../state/useWorldsStore';
import { CommunityList, JoinFriend } from './CommunityPanel';
import { OnlineNow, ShareSettings } from './ShareSettings';
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
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owned = world.owned !== false;

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
              {owned && world.visibility === 'public' && <span className="shrink-0 rounded-full bg-sky-400/90 px-1.5 text-[10px] font-semibold text-black">PUBLIC</span>}
              {!owned && <span className="shrink-0 rounded-full bg-violet-400/90 px-1.5 text-[10px] font-semibold text-black">FRIEND</span>}
            </span>
            <span className="block truncate text-[11px] text-white/50">
              {!owned ? `by ${world.ownerName ?? 'a friend'}` : world.pieces !== undefined ? `${world.pieces} ${world.pieces === 1 ? "piece" : "pieces"}` : "Saved world"}
              {world.updatedAt ? ` · ${ago(world.updatedAt)}` : ''}
            </span>
          </button>
        )}
        {!editing && (
          <>
            {owned && (
              <button
                className={`${small} !w-auto px-2.5 text-[11px] ${sharing ? '!bg-white !text-black' : ''}`}
                onClick={() => setSharing((v) => !v)}
                aria-label="Share settings"
                title="Share settings"
              >
                Share
              </button>
            )}
            {owned && (
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
            )}
            <button
              className={`${small} ${confirm ? '!bg-red-600 !text-white' : ''}`}
              disabled={busy}
              onBlur={() => setConfirm(false)}
              onClick={() => {
                if (!confirm) return setConfirm(true);
                setConfirm(false);
                void deleteWorld(world.id).then(setError);
              }}
              aria-label={confirm ? 'Tap again to confirm' : owned ? 'Delete' : 'Leave'}
              title={confirm ? 'Tap again to confirm' : owned ? 'Delete' : 'Leave this world'}
            >
              <Icon name="trash" />
            </button>
          </>
        )}
      </div>
      {sharing && owned && <ShareSettings world={world} />}
      {error && <div className="mt-1 px-2 text-xs text-amber-300">{error}</div>}
    </li>
  );
}

/** The player's worlds: open, rename, delete, start a new one, or unlock more by watching an ad. */
export function WorldsPanel() {
  const [tab, setTab] = useState<'mine' | 'community' | 'join'>('mine');
  const visiting = useWorldsStore((s) => s.visiting);
  const readOnly = useWorldsStore((s) => s.readOnly);
  const busyNow = useWorldsStore((s) => s.busy);
  const notice = useWorldsStore((s) => s.error);
  const tabButton = (id: typeof tab, label: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition ${tab === id ? 'bg-white text-black' : 'bg-white/10 text-white/75 active:bg-white/20 sm:hover:bg-white/15'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {visiting && (
        <div className="flex items-center gap-2 rounded-2xl bg-sky-400/15 p-2.5 text-xs text-sky-100">
          <div className="min-w-0 flex-1">
            <span className="block truncate font-medium">Visiting {visiting.name}</span>
            <span className="block truncate text-[11px] text-sky-100/70">
              by {visiting.ownerName ?? 'a player'} · {readOnly ? 'explore only' : 'you can build here'}
            </span>
          </div>
          <button disabled={busyNow} onClick={() => void leaveVisit()} className="shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-black active:bg-white/80 disabled:opacity-50">
            Leave
          </button>
        </div>
      )}
      {notice && <p className="rounded-xl bg-amber-400/15 px-2.5 py-1.5 text-xs text-amber-200">{notice}</p>}
      <OnlineNow />
      <div className="flex gap-1.5">
        {tabButton('mine', 'My worlds')}
        {tabButton('community', 'Community')}
        {tabButton('join', 'Join a friend')}
      </div>
      {tab === 'mine' && <MyWorlds />}
      {tab === 'community' && <CommunityList />}
      {tab === 'join' && <JoinFriend />}
    </div>
  );
}

function MyWorlds() {
  const worlds = useWorldsStore((s) => s.worlds);
  const activeId = useWorldsStore((s) => s.activeId);
  const extra = useWorldsStore((s) => s.extraSlots);
  const busy = useWorldsStore((s) => s.busy);
  const signedIn = useAuthStore((s) => !!s.session);
  const [message, setMessage] = useState<string | null>(null);
  const fmt = useMoneyFormat();
  const money = useWalletStore((s) => s.money);
  const watching = useWalletStore((s) => s.watching);

  const [choosing, setChoosing] = useState(false);
  const [newName, setNewName] = useState('');
  const [newVisibility, setNewVisibility] = useState<WorldVisibility>('private');

  const limit = worldLimit(extra);
  const owned = ownedCount(worlds);
  const full = owned >= limit;

  const add = async () => {
    const err = await createWorld(newName, newVisibility);
    setMessage(err === 'limit' ? 'All world slots are in use.' : err);
    if (!err) {
      setChoosing(false);
      setNewName('');
    }
  };

  const slotCost = slotPrice(extra);
  const unlock = async () => setMessage(await buyReward('slot'));
  const earn = async () => setMessage(await watchAdForMoney());

  return (
    <div className="flex flex-col gap-3 text-xs text-white sm:text-sm">
      <div className="flex items-center justify-between">
        <span className="text-white/70">
          {owned} of {limit} worlds
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
            disabled={busy || money < slotCost}
            onClick={() => void unlock()}
            className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-black active:bg-white/80 disabled:bg-white/15 disabled:text-white/45 sm:min-h-0 sm:py-2"
          >
            <Icon name="lock" />
            Unlock a world
            <span className="flex items-center gap-1 font-semibold">
              <Icon name="coins" />
              {fmt(slotCost)}
            </span>
          </button>
          <button
            disabled={watching || !!adBlockedReason()}
            onClick={() => void earn()}
            className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-amber-400 px-4 text-sm font-medium text-black active:bg-amber-300 disabled:opacity-45 sm:min-h-0 sm:py-2"
          >
            <Icon name="watchad" />
            {watching ? 'Ad playing…' : `Watch an ad: +${fmt(MONEY_PER_AD)}`}
          </button>
          <span className="text-center text-[11px] text-white/45">You have {fmt(money)}.</span>
        </div>
      ) : choosing ? (
        <form
          className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input
            autoFocus
            maxLength={30}
            placeholder={`World ${worlds.length + 1}`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="rounded-full bg-white/10 px-3.5 py-2 text-base outline-none placeholder:text-white/35 sm:text-sm"
          />
          <div className="flex gap-1.5">
            {(['private', 'public'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setNewVisibility(v)}
                className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${newVisibility === v ? 'bg-white text-black' : 'bg-white/10 text-white/75'}`}
              >
                {v === 'private' ? 'Private' : 'Public'}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-white/50">
            {newVisibility === 'private'
              ? 'Only you, plus friends you invite with a code or approve on request.'
              : 'Listed in Community so other players can explore it. You choose whether visitors can build.'}
          </p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setChoosing(false)} className="flex-1 rounded-full bg-white/10 px-3 py-2 text-xs text-white/80">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="flex-1 rounded-full bg-white px-3 py-2 text-xs font-medium text-black disabled:opacity-50">
              Create
            </button>
          </div>
        </form>
      ) : (
        <button
          disabled={busy}
          onClick={() => setChoosing(true)}
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
