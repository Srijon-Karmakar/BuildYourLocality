import { create } from 'zustand';
import type { ShopCategory } from '../lib/shop';

interface ShopState {
  open: boolean;
  category: ShopCategory;
  /** Opens the shop, on a category when one is given. */
  show: (category?: ShopCategory) => void;
  hide: () => void;
  setCategory: (category: ShopCategory) => void;
}

export const useShopStore = create<ShopState>((set) => ({
  open: false,
  category: 'weapons',
  show: (category) => {
    // The mouse is captured while walking: give it back so the shop can be used.
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
    set((s) => ({ open: true, category: category ?? s.category }));
  },
  hide: () => set({ open: false }),
  setCategory: (category) => set({ category }),
}));
