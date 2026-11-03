import { create } from 'zustand';

/** Worlds every player can make before unlocking more. */
export const FREE_WORLDS = 2;

/** Private: the owner and invited friends. Public: listed in Community for everyone to visit. */
export type WorldVisibility = 'private' | 'public';

/** One of the player's worlds, as shown in the world picker. */
export interface WorldMeta {
  id: string;
  name: string;
  /** Last time it was saved, ms since epoch. */
  updatedAt: number;
  /** Piece count, known once the world has been open on this device. */
  pieces?: number;
  /** False for a friend's world you joined or a community world you are visiting. Missing means yours. */
  owned?: boolean;
  visibility?: WorldVisibility;
  /** Public worlds: visitors may build (otherwise they can only explore). */
  publicBuild?: boolean;
  ownerName?: string;
  /** Owner only: invite code for friends, and how many have joined. */
  joinCode?: string;
  memberCount?: number;
  /** Friends joined (or the world is public with building on): edits are merged, not overwritten. */
  shared?: boolean;
}

/** Someone else building in the open world right now. */
export interface Collaborator {
  userId: string;
  name: string;
  /** What they are doing right now. */
  mode?: 'build' | 'roam';
}

interface WorldsState {
  /** The player's own worlds, then the private worlds they joined. */
  worlds: WorldMeta[];
  activeId: string | null;
  /** A community world being visited; it is not saved in the player's list. */
  visiting: WorldMeta | null;
  /** The open world can only be explored, not built in. */
  readOnly: boolean;
  /** Other players connected to the open world. */
  online: Collaborator[];
  /** World slots unlocked on top of the free ones. */
  extraSlots: number;
  /** True while a world is being created, opened or deleted. */
  busy: boolean;
  error: string | null;
}

export const useWorldsStore = create<WorldsState>(() => ({
  worlds: [],
  activeId: null,
  visiting: null,
  readOnly: false,
  online: [],
  extraSlots: 0,
  busy: false,
  error: null,
}));

export const worldLimit = (extraSlots: number) => FREE_WORLDS + extraSlots;

/** How many of the worlds count against the player's slots (joined worlds do not). */
export const ownedCount = (worlds: WorldMeta[]) => worlds.filter((w) => w.owned !== false).length;
