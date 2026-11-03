/**
 * Buying money with real money.
 *
 * Payments are not connected yet, so every pack is shown but cannot be bought. When a provider is
 * chosen (Razorpay, Stripe…) the purchase must be confirmed on a server (a Supabase Edge Function
 * that checks the payment and then adds the money to the account), never by the browser alone:
 * anything the browser can say about a payment, a player can fake.
 */

export const PAYMENTS_ENABLED = false;

export interface MoneyPack {
  id: string;
  label: string;
  /** In-game money the pack adds. */
  money: number;
  /** Price in US cents (shown to the player; the provider's own price list will replace it). */
  cents: number;
  badge?: string;
}

export const MONEY_PACKS: MoneyPack[] = [
  { id: 'pack_small', label: 'Pocket change', money: 500, cents: 99 },
  { id: 'pack_medium', label: 'Fat wallet', money: 3000, cents: 499, badge: 'Popular' },
  { id: 'pack_large', label: 'Briefcase', money: 8000, cents: 999 },
  { id: 'pack_huge', label: 'Vault', money: 25000, cents: 2499, badge: 'Best value' },
];

/** Starts a purchase. Resolves to a message for the player. */
export async function buyMoneyPack(_id: string): Promise<string> {
  if (!PAYMENTS_ENABLED) return 'Real-money purchases are not available yet.';
  return 'Payments are not set up.';
}
