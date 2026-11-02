import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { useAuthStore } from '../state/useAuthStore';
import { useSyncStore } from '../state/useSyncStore';

/** Shortest time the curtain stays closed, so it never just flashes. */
const MIN_MS = 1800;
/** The curtain opens regardless after this long, in case a request hangs. */
const MAX_MS = 12000;
const OPEN_MS = 1400;

const panel = 'absolute top-0 h-full w-1/2 bg-[#0b0b10] transition-transform ease-[cubic-bezier(0.65,0,0.35,1)]';

const RING = 2 * Math.PI * 14;

/**
 * Minimal curtain over the game while it starts up. It waits for the login lookup, the saved city
 * and any 3D assets, then the two halves slide apart and the overlay removes itself.
 */
export function CurtainLoader() {
  const authReady = useAuthStore((s) => s.ready);
  const syncing = useSyncStore((s) => s.status === 'loading');
  const { progress, active } = useProgress();
  const [minDone, setMinDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const a = window.setTimeout(() => setMinDone(true), MIN_MS);
    const b = window.setTimeout(() => setTimedOut(true), MAX_MS);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, []);

  const ready = authReady && !syncing && !active;
  // Latches: once the curtain has opened it stays open, even if a later sync reports loading.
  if (!open && minDone && (ready || timedOut)) setOpen(true);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setGone(true), OPEN_MS + 100);
    return () => window.clearTimeout(t);
  }, [open]);

  if (gone) return null;

  const shown = ready ? 100 : Math.max(8, Math.round(progress));
  const slide = { transitionDuration: `${OPEN_MS}ms` };

  return (
    <div className={`absolute inset-0 z-[100] overflow-hidden ${open ? 'pointer-events-none' : 'pointer-events-auto'}`} role="status" aria-label="Loading">
      <div className={panel + ' left-0'} style={{ ...slide, transform: open ? 'translateX(-100%)' : 'none' }} />
      <div className={panel + ' right-0'} style={{ ...slide, transform: open ? 'translateX(100%)' : 'none' }} />
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center transition-opacity duration-300"
        style={{ opacity: open ? 0 : 1 }}
      >
        <div
          className="bg-gradient-to-b from-white to-white/50 bg-clip-text text-5xl italic tracking-[0.18em] text-transparent sm:text-6xl"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500 }}
        >
          Apnagali
        </div>
        <svg width="32" height="32" viewBox="0 0 32 32" className="-rotate-90" aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
          <circle
            cx="16"
            cy="16"
            r="14"
            fill="none"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - shown / 100)}
            className="transition-[stroke-dashoffset] duration-500"
          />
        </svg>
      </div>
    </div>
  );
}
