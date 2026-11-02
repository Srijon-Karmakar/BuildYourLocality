/**
 * What ads earn and what tokens buy. Change the numbers here; the UI reads everything from this file.
 */

/** Tokens a finished rewarded ad is worth. */
export const TOKENS_PER_AD = 10;
/** Ads one device can watch per day, so the loop stays a bonus instead of a chore. */
export const MAX_ADS_PER_DAY = 20;
/** Minimum gap between two ads, in seconds. */
export const AD_COOLDOWN_S = 20;
/** Tokens that bring a player back after a knock-out (watching an ad does it for free). */
export const REVIVE_COST = 15;

export interface RewardDef {
  id: string;
  label: string;
  desc: string;
  /** Icon name from ui/icons.tsx. */
  icon: string;
  cost: number;
  /** Can be bought again and again (world slots) instead of once. */
  repeatable?: boolean;
}

export const REWARDS: RewardDef[] = [
  { id: 'slot', label: 'Extra world', desc: 'One more world slot, to build somewhere new.', icon: 'worlds', cost: 20, repeatable: true },
  { id: 'shotgun', label: 'Shotgun loadout', desc: 'Start every walk with a shotgun and 12 shells.', icon: 'shotgun', cost: 40 },
  { id: 'wallet', label: 'Deep pockets', desc: 'Start every walk with $500 instead of $200.', icon: 'money', cost: 25 },
];

export const rewardById = (id: string) => REWARDS.find((r) => r.id === id);
