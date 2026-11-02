import { create } from 'zustand';

/** Tokens, the things bought with them, and how many ads were watched today. */
interface WalletState {
  tokens: number;
  /** Ids of one-off unlocks the player owns (see lib/rewards.ts). */
  unlocks: string[];
  /** Ads watched today on this device, and when the last one finished (ms). */
  adsToday: { day: string; count: number };
  lastAdAt: number;
  /** True while an ad is on screen. */
  watching: boolean;
}

export const useWalletStore = create<WalletState>(() => ({
  tokens: 0,
  unlocks: [],
  adsToday: { day: '', count: 0 },
  lastAdAt: 0,
  watching: false,
}));
