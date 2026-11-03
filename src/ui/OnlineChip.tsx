import { useState } from 'react';
import { useAuthStore } from '../state/useAuthStore';
import { useWorldsStore } from '../state/useWorldsStore';

const COLORS = ['bg-emerald-400', 'bg-sky-400', 'bg-amber-400', 'bg-violet-400', 'bg-rose-400', 'bg-teal-400'];
const colorFor = (id: string) => COLORS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];

/** Who else is in the open world. Tap for the list and what each person is doing. */
export function OnlineChip() {
  const online = useWorldsStore((s) => s.online);
  const me = useAuthStore((s) => s.session?.user.id ?? '');
  const [open, setOpen] = useState(false);
  if (online.length === 0) return null;

  return (
    <div className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`${online.length} other ${online.length === 1 ? 'player' : 'players'} here`}
        className="flex h-9 items-center gap-1.5 rounded-full bg-black/40 pointer-coarse:bg-black/64 px-2.5 text-xs text-white backdrop-blur-[6px] active:bg-white/20 sm:h-10 sm:px-3.5 sm:hover:bg-black/48"
      >
        <span className="flex -space-x-1.5">
          {online.slice(0, 3).map((o) => (
            <span key={o.userId} className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-black ring-2 ring-black/50 ${colorFor(o.userId)}`}>
              {o.name.charAt(0).toUpperCase()}
            </span>
          ))}
        </span>
        <span className="tabular-nums">{online.length + 1}</span>
      </button>
      {open && (
        <ul className="absolute right-0 top-11 z-10 w-52 overflow-hidden rounded-2xl bg-black/80 p-1.5 text-xs text-white shadow-xl backdrop-blur-[6px] sm:top-12">
          <li className="flex items-center gap-2 px-2 py-1.5 text-white/60">
            <span className={`h-2 w-2 rounded-full ${colorFor(me)}`} />
            You
          </li>
          {online.map((o) => (
            <li key={o.userId} className="flex items-center gap-2 px-2 py-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${colorFor(o.userId)}`} />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              <span className="shrink-0 text-[11px] text-white/50">{o.mode === 'build' ? 'building' : o.mode === 'roam' ? 'walking' : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
