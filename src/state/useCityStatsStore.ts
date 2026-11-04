import { create } from 'zustand';
import type { CityStats } from '../sim/cityStats';

export type StatsTab = 'overview' | 'services' | 'traffic' | 'economy' | 'government';

interface CityStatsState {
  open: boolean;
  tab: StatsTab;
  /** The latest numbers, refreshed about once a second. */
  stats: CityStats | null;
  show: (tab?: StatsTab) => void;
  hide: () => void;
  setTab: (tab: StatsTab) => void;
}

export const useCityStatsStore = create<CityStatsState>((set) => ({
  open: false,
  tab: 'overview',
  stats: null,
  show: (tab) => {
    // The mouse is captured while walking: give it back so the window can be used.
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
    set((s) => ({ open: true, tab: tab ?? s.tab }));
  },
  hide: () => set({ open: false }),
  setTab: (tab) => set({ tab }),
}));
