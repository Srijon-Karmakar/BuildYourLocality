import { create } from 'zustand';

/** Money, the things bought with it, and how many ads were watched today. */
interface WalletState {
  /** The one balance: ads, walks, purchases and codes all add to it, unlocks and revives spend it. */
  money: number;
  /** Money found or lost while walking that the server has not been told about yet (signed-in players). */
  pendingDelta: number;
  /** Ids of one-off unlocks the player owns (see lib/rewards.ts). */
  unlocks: string[];
  /** Ads watched today on this device, and when the last one finished (ms). */
  adsToday: { day: string; count: number };
  lastAdAt: number;
  /** True while an ad is on screen. */
  watching: boolean;
}

export const useWalletStore = create<WalletState>(() => ({
  money: 0,
  pendingDelta: 0,
  unlocks: [],
  adsToday: { day: '', count: 0 },
  lastAdAt: 0,
  watching: false,
}));
