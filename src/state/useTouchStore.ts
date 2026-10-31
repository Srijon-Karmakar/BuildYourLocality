import { create } from 'zustand';

/**
 * Touch placement is two-step: a tap puts a ghost on the map ("pending"), and the player
 * confirms with the on-screen button (or taps the ghost again). The builder registers the
 * confirm / cancel handlers; the UI just calls them.
 */
interface TouchState {
  /** A placement / move is waiting for confirmation. */
  pending: boolean;
  /** Whether the pending ghost is currently in a valid spot. */
  valid: boolean;
  confirm: () => void;
  cancel: () => void;
  setPending: (pending: boolean, valid?: boolean) => void;
  setHandlers: (confirm: () => void, cancel: () => void) => void;
}

export const useTouchStore = create<TouchState>((set) => ({
  pending: false,
  valid: false,
  confirm: () => {},
  cancel: () => {},
  setPending: (pending, valid = false) => set((s) => (s.pending === pending && s.valid === valid ? s : { pending, valid })),
  setHandlers: (confirm, cancel) => set({ confirm, cancel }),
}));
