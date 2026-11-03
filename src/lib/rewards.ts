/**
 * What ads earn. What money buys is in shop.ts. Change the numbers here; the UI reads everything from this file.
 */

/** Money a finished rewarded ad is worth. */
export const MONEY_PER_AD = 10;
/** Ads one device can watch per day, so the loop stays a bonus instead of a chore. */
export const MAX_ADS_PER_DAY = 20;
/** Minimum gap between two ads, in seconds. */
export const AD_COOLDOWN_S = 20;
/** Money that brings a player back after a knock-out (watching an ad does it for free). */
export const REVIVE_COST = 15;
