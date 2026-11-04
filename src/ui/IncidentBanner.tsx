import { useMemo } from 'react';
import { useCityStatsStore } from '../state/useCityStatsStore';
import { Icon } from './icons';

const ICON: Record<string, string> = { fire: 'firestation', accident: 'car', crime: 'siren' };

/** A slim alert under the top bar while something is going wrong in the city; tap it for the details. */
export function IncidentBanner() {
  const all = useCityStatsStore((s) => s.stats?.incidents);
  const live = useMemo(() => (all ?? []).filter((i) => i.status === 'active'), [all]);
  const show = useCityStatsStore((s) => s.show);
  const open = useCityStatsStore((s) => s.open);
  if (live.length === 0 || open) return null;
  const first = live[0];
  return (
    <button
      onClick={() => show('traffic')}
      className="pointer-events-auto absolute left-1/2 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-red-600/85 px-3.5 py-1.5 text-xs text-white shadow-lg backdrop-blur-[6px] active:bg-red-700"
      style={{ top: 'calc(var(--safe-top) + 3.6rem)' }}
    >
      <Icon name={ICON[first.kind] ?? 'siren'} className="shrink-0 animate-pulse text-sm" />
      <span className="truncate">{first.label}</span>
      {live.length > 1 && <span className="shrink-0 rounded-full bg-black/30 px-1.5 tabular-nums">+{live.length - 1}</span>}
    </button>
  );
}
