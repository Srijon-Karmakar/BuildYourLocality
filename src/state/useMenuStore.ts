import { create } from 'zustand';

export type MenuTab = 'sky' | 'worlds' | 'rewards' | 'graphics' | 'account' | 'walk';

interface MenuState {
  open: boolean;
  tab: MenuTab;
  /** Open the menu on a tab (or close it if that tab is already showing). */
  toggle: (tab?: MenuTab) => void;
  /** Switch to a tab, keeping the menu open. */
  select: (tab: MenuTab) => void;
  close: () => void;
}

/** The single menu that holds sky, graphics, account and walk options. */
export const useMenuStore = create<MenuState>((set) => ({
  open: false,
  tab: 'sky',
  toggle: (tab) =>
    set((s) => {
      if (!tab) return { open: !s.open };
      return s.open && s.tab === tab ? { open: false } : { open: true, tab };
    }),
  select: (tab) => set({ open: true, tab }),
  close: () => set({ open: false }),
}));
