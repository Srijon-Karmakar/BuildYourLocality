import { useEffect, useState } from 'react';
import { combat } from '../sim/combat';
import { vehicle } from '../sim/vehicle';
import type { Car } from '../sim/simulation';
import { useGameStore } from '../state/useGameStore';
import { Icon } from './icons';
import { useIsTouch } from './useMediaQuery';

export interface VehicleSnap {
  active: boolean;
  /** Kind of the car that could be taken from here, if any. */
  near: Car['kind'] | null;
  kmh: number;
  view: 'chase' | 'hood';
  kind: Car['kind'];
}

const read = (): VehicleSnap => ({
  active: vehicle.active,
  near: vehicle.near?.kind ?? null,
  kmh: Math.round(Math.abs(vehicle.forward) * 3.6),
  view: vehicle.view,
  kind: vehicle.car?.kind ?? 'car',
});

/** The driving state for the interface, refreshed ten times a second. */
export function useVehicleSnap(): VehicleSnap {
  const [snap, setSnap] = useState(read);
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = read();
      setSnap((prev) => (prev.active === next.active && prev.near === next.near && prev.kmh === next.kmh && prev.view === next.view && prev.kind === next.kind ? prev : next));
    }, 100);
    return () => window.clearInterval(id);
  }, []);
  return snap;
}

const card = 'rounded-full bg-black/45 pointer-coarse:bg-black/70 text-white backdrop-blur-[6px]';
const NAME = { car: 'car', taxi: 'taxi', bus: 'bus', police: 'police car', ambulance: 'ambulance', fire: 'fire engine' } as const;

/** The prompt to take a car when one is close, and the speedometer while driving. */
export function VehicleHud() {
  const mode = useGameStore((s) => s.mode);
  const touch = useIsTouch();
  const snap = useVehicleSnap();
  if (mode !== 'roam') return null;

  if (snap.active) {
    // Red-line the dial at the car's top speed.
    const top = snap.kind === 'bus' ? 68 : 112;
    const fill = Math.min(1, snap.kmh / top);
    return (
      <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center gap-1.5" style={{ bottom: touch ? 'calc(var(--safe-bottom) + 0.6rem)' : 'calc(var(--safe-bottom) + 1.5rem)' }}>
        <div className={`flex items-center gap-3 px-5 py-2 ${card}`}>
          <Icon name="gauge" className="text-lg text-white/70" />
          <span className="w-16 text-right text-2xl font-semibold tabular-nums">{snap.kmh}</span>
          <span className="text-xs text-white/60">km/h</span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/15">
            <div className={`h-full rounded-full ${fill > 0.92 ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${fill * 100}%` }} />
          </div>
        </div>
        {!touch && <div className="rounded-full bg-black/35 px-3 py-1 text-[11px] text-white/65">W / S gas and brake · A / D steer · Space handbrake · H horn · V view · E get out</div>}
      </div>
    );
  }

  if (snap.near) {
    const hijack = combat.active;
    return (
      <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: touch ? 'calc(var(--safe-bottom) + 9rem)' : 'calc(var(--safe-bottom) + 5.5rem)' }}>
        <div className={`flex items-center gap-2 px-4 py-2 text-sm ${card}`}>
          <Icon name="car" />
          {touch ? `Tap Drive to take the ${NAME[snap.near]}` : <><kbd className="rounded bg-white/20 px-1.5 text-xs">E</kbd> {hijack ? `Hijack the ${NAME[snap.near]}` : `Take the ${NAME[snap.near]}`}</>}
        </div>
      </div>
    );
  }
  return null;
}
