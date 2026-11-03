import type { WeaponId } from '../sim/combat';

/**
 * Everything the shop sells. Change names, texts and prices here; the shop page reads this file.
 * The server keeps its own price list (shop_items in supabase/schema.sql) and charges that, so
 * keep the two in step.
 */

export type ShopCategory = 'weapons' | 'worlds' | 'buildings' | 'services' | 'money' | 'sky';

export const SHOP_CATEGORIES: { id: ShopCategory; label: string; icon: string }[] = [
  { id: 'weapons', label: 'Weapons', icon: 'pistol' },
  { id: 'worlds', label: 'Worlds', icon: 'worlds' },
  { id: 'buildings', label: 'Buildings', icon: 'skyscraper' },
  { id: 'services', label: 'Services', icon: 'heart' },
  { id: 'money', label: 'Money', icon: 'coins' },
  { id: 'sky', label: 'Sky & weather', icon: 'sky' },
];

export type ShopKind = 'unlock' | 'slot' | 'service';

export interface ShopItem {
  id: string;
  category: ShopCategory;
  label: string;
  desc: string;
  /** Icon name from ui/icons.tsx. */
  icon: string;
  /** Price of the first one; world slots rise (see slotPrice). */
  cost: number;
  kind: ShopKind;
}

/** What the first extra world costs, and how much more each one after it costs. */
export const SLOT_BASE = 100;
export const SLOT_STEP = 50;
export const slotPrice = (extraSlots: number) => SLOT_BASE + SLOT_STEP * extraSlots;

/** Guns that come with a walk's loadout once bought: the item id is the weapon id. */
export const WEAPON_ITEMS: WeaponId[] = ['revolver', 'shotgun', 'crossbow', 'smg', 'rifle', 'rocket'];

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'revolver', category: 'weapons', label: 'Revolver', desc: 'A heavy six-shooter. Start every walk with it and 18 rounds.', icon: 'revolver', cost: 30, kind: 'unlock' },
  { id: 'shotgun', category: 'weapons', label: 'Shotgun', desc: 'Start every walk with a shotgun and 12 shells.', icon: 'shotgun', cost: 40, kind: 'unlock' },
  { id: 'crossbow', category: 'weapons', label: 'Crossbow', desc: 'Almost silent, so nobody hears you. Start every walk with it and 12 bolts.', icon: 'crossbow', cost: 50, kind: 'unlock' },
  { id: 'smg', category: 'weapons', label: 'Submachine gun', desc: 'Sprays bullets fast. Start every walk with it and 60 rounds.', icon: 'smg', cost: 60, kind: 'unlock' },
  { id: 'rocket', category: 'weapons', label: 'Rocket launcher', desc: 'Fires rockets that blow up on impact and bring buildings down. Start every walk with it and 4 rockets.', icon: 'rocket', cost: 150, kind: 'unlock' },
  { id: 'rifle', category: 'weapons', label: 'Hunting rifle', desc: 'Long range, hard-hitting. Start every walk with it and 20 rounds.', icon: 'rifle', cost: 80, kind: 'unlock' },

  { id: 'slot', category: 'worlds', label: 'Extra world', desc: 'One more world slot, to build somewhere new. Each extra world costs a little more than the last.', icon: 'worlds', cost: SLOT_BASE, kind: 'slot' },

  { id: 'ammo', category: 'services', label: 'Ammo refill', desc: 'Restocks every gun you carry. Only during a walk.', icon: 'pistol', cost: 10, kind: 'service' },
  { id: 'revive', category: 'services', label: 'Revive', desc: 'Get back up where you fell. Only after a knock-out.', icon: 'heart', cost: 15, kind: 'service' },

  { id: 'weather_pack', category: 'sky', label: 'Storm pack', desc: 'Rain, storms, snow and fog, set whenever you like.', icon: 'storm', cost: 120, kind: 'unlock' },
  { id: 'sky_pack', category: 'sky', label: 'Time pack', desc: 'Pick the time of day and how fast days pass.', icon: 'sunset', cost: 100, kind: 'unlock' },
];

export const shopItemById = (id: string) => SHOP_ITEMS.find((i) => i.id === id);

/** The price right now (world slots get dearer with every one bought). */
export const priceOf = (item: ShopItem, extraSlots: number) => (item.kind === 'slot' ? slotPrice(extraSlots) : item.cost);
