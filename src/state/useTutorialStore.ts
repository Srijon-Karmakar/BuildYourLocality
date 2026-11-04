import { create } from 'zustand';

export const useTutorialStore = create<{ open: boolean; launch: () => void; close: () => void }>((set) => ({
  open: false,
  launch: () => {
    if (document.pointerLockElement) document.exitPointerLock();
    set({ open: true });
  },
  close: () => set({ open: false }),
}));
