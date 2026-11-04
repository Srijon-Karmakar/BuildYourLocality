import { useCityStatsStore } from '../state/useCityStatsStore';
import { Icon } from './icons';

/** Opens the city stats pop-up. Shows the happiness score, and a red dot while an emergency is going on. */
export function StatsButton() {
  const show = useCityStatsStore((s) => s.show);
  const happiness = useCityStatsStore((s) => (s.stats?.hasCity ? s.stats.happiness : null));
  const emergencies = useCityStatsStore((s) => s.stats?.incidents.filter((i) => i.status === 'active').length ?? 0);
  return (
    <button
      onClick={() => show()}
      aria-label="Open city stats"
      title="City stats"
      className="pointer-events-auto relative flex h-9 items-center gap-1 rounded-full bg-black/40 pointer-coarse:bg-black/64 px-2.5 text-lg text-white backdrop-blur-[6px] active:bg-white/20 sm:h-10 sm:px-3 sm:text-xl sm:hover:bg-black/48"
    >
      <Icon name="stats" />
      {happiness !== null && <span className="text-xs tabular-nums sm:text-sm">{happiness}</span>}
      {emergencies > 0 && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border border-black/40 bg-red-500" />}
    </button>
  );
}
