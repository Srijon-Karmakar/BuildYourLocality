import { useEffect, useState } from 'react';
import { incidents } from '../sim/incidents';
import { useGameStore } from '../state/useGameStore';
import { Icon } from './icons';

const CALLS = [
  { role: 'police', label: 'Police', icon: 'policepost' },
  { role: 'fire', label: 'Fire brigade', icon: 'firestation' },
  { role: 'ambulance', label: 'Ambulance', icon: 'hospital' },
] as const;

/** While walking: call the police, the fire brigade or an ambulance to where you stand. */
export function CallButton() {
  const mode = useGameStore((s) => s.mode);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(id);
  }, [message]);
  if (mode !== 'roam') return null;
  return (
    <div className="pointer-events-none absolute right-2 flex flex-col items-end gap-1.5" style={{ top: 'calc(var(--safe-top) + 3.6rem)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Call emergency services"
        className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/40 pointer-coarse:bg-black/64 text-lg text-white backdrop-blur-[6px] active:bg-white/20 sm:h-10 sm:w-10 sm:hover:bg-black/48"
      >
        <Icon name="siren" />
      </button>
      {open && (
        <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl bg-black/60 pointer-coarse:bg-black/84 p-1.5 text-white backdrop-blur-[6px]">
          {CALLS.map((c) => (
            <button
              key={c.role}
              onClick={() => {
                setMessage(incidents.call(c.role));
                setOpen(false);
              }}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs active:bg-white/20 sm:hover:bg-white/10"
            >
              <Icon name={c.icon} />
              {c.label}
            </button>
          ))}
        </div>
      )}
      {message && <div className="pointer-events-none max-w-56 rounded-xl bg-black/70 px-3 py-2 text-xs text-white">{message}</div>}
    </div>
  );
}
