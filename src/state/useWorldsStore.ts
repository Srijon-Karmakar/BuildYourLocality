import { create } from 'zustand';

/** Worlds every player can make before unlocking more. */
export const FREE_WORLDS = 2;

/** One of the player's worlds, as shown in the world picker. */
export interface WorldMeta {
  id: string;
  name: string;
  /** Last time it was saved, ms since epoch. */
  updatedAt: number;
  /** Piece count, known once the world has been open on this device. */
  pieces?: number;
}

interface WorldsState {
  worlds: WorldMeta[];
  activeId: string | null;
  /** World slots unlocked on top of the free ones. */
  extraSlots: number;
  /** True while a world is being created, opened or deleted. */
  busy: boolean;
  error: string | null;
}

export const useWorldsStore = create<WorldsState>(() => ({
  worlds: [],
  activeId: null,
  extraSlots: 0,
  busy: false,
  error: null,
}));

export const worldLimit = (extraSlots: number) => FREE_WORLDS + extraSlots;
