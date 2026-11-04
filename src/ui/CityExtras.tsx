import { useState } from 'react';
import { DISASTERS, disasters, useDisasterStore, type RandomMode } from '../sim/disasters';
import { useMissionStore } from '../sim/missions';
import { Icon } from './icons';

const card = 'rounded-2xl bg-black/25 p-3.5';
const label = 'text-[11px] uppercase tracking-wider text-white/50';
const fmt = (n: number) => Math.round(n).toLocaleString();

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Contracts offered by the neighbours, with progress and time left. */
export function MissionsTab() {
  const missions = useMissionStore((s) => s.missions);
  const completed = useMissionStore((s) => s.completed);
  const earned = useMissionStore((s) => s.earned);
  const active = missions.filter((m) => m.status === 'active');
  const past = missions.filter((m) => m.status !== 'active').slice(-4).reverse();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={`${card} sm:col-span-2`}>
        <div className="mb-2 flex items-center justify-between">
          <span className={label}>Contracts</span>
          <span className="text-[11px] text-white/50">
            {completed} done · {fmt(earned)} earned
          </span>
        </div>
        {active.length === 0 ? (
          <p className="text-xs text-white/55">No contracts right now. The neighbours will ask for something soon.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((m) => {
              const pct = Math.min(100, (m.progress / m.target) * 100);
              return (
                <li key={m.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-white">{m.title}</span>
                    <span className="shrink-0 tabular-nums text-amber-300">+{fmt(m.reward)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-700" style={{ width: `${Math.max(3, pct)}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-white/50">
                    <span className="tabular-nums">
                      {fmt(m.progress)} / {fmt(m.target)}
                    </span>
                    <span className={`tabular-nums ${m.left < 60 ? 'text-red-300' : ''}`}>{clock(m.left)} left</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {past.length > 0 && (
        <div className={`${card} sm:col-span-2`}>
          <div className={`${label} mb-2`}>Recent</div>
          <ul className="flex flex-col gap-1 text-xs">
            {past.map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span className="text-white/75">{m.title}</span>
                <span className={m.status === 'done' ? 'text-emerald-300' : 'text-red-300'}>{m.status === 'done' ? `+${fmt(m.reward)}` : 'expired'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="px-1 text-[11px] leading-snug text-white/45 sm:col-span-2">Rewards go to the city treasury, not your wallet. New contracts turn up every minute or so (up to three at a time).</p>
    </div>
  );
}

const MODES: { id: RandomMode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'rare', label: 'Now and then' },
  { id: 'often', label: 'Often' },
];

/** Set off a disaster at the middle of the screen, allow random ones, or put the city back. */
export function DisastersTab() {
  const mode = useDisasterStore((s) => s.mode);
  const canRestore = useDisasterStore((s) => s.canRestore);
  const setMode = useDisasterStore((s) => s.setMode);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={`${card} sm:col-span-2`}>
        <div className={`${label} mb-2`}>Strike the middle of the screen</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {DISASTERS.map((d) => (
            <button key={d.id} onClick={() => setNote(disasters.trigger(d.id))} className="flex flex-col items-start gap-1 rounded-xl bg-white/10 p-3 text-left active:bg-white/20 sm:hover:bg-white/15">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Icon name={d.icon} /> {d.label}
              </span>
              <span className="text-[11px] leading-snug text-white/55">{d.text}</span>
            </button>
          ))}
        </div>
        {note && <p className="mt-2 text-xs text-amber-300">{note}</p>}
      </div>

      <div className={card}>
        <div className={`${label} mb-2`}>Random disasters</div>
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)} className={`rounded-full px-3 py-1.5 text-xs ${mode === m.id ? 'bg-white text-black' : 'bg-white/10 text-white/80'}`}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-white/50">When on, something strikes by itself every so often, with a few seconds of warning.</p>
      </div>

      <div className={card}>
        <div className={`${label} mb-2`}>Undo the damage</div>
        <button
          disabled={!canRestore}
          onClick={() => setNote(disasters.restore() ? 'The city is back as it was.' : null)}
          className="w-full rounded-xl bg-emerald-500/80 px-3 py-2 text-sm font-medium text-black active:bg-emerald-400 disabled:bg-white/10 disabled:text-white/40"
        >
          Restore the city
        </button>
        <button disabled={!canRestore} onClick={() => disasters.accept()} className="mt-2 w-full rounded-xl bg-white/10 px-3 py-2 text-xs text-white/80 disabled:opacity-40">
          Keep the damage
        </button>
        <p className="mt-2 text-[11px] leading-snug text-white/50">The city is saved just before the first disaster. Disasters destroy real buildings, and repairs cost money from the treasury.</p>
      </div>
    </div>
  );
}
