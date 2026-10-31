import { create } from 'zustand';

/** Build = orbiting city-builder camera; roam = first-person walk / fly through the city. */
export type AppMode = 'build' | 'roam';
export type RoamSubMode = 'peaceful' | 'normal' | 'survival';

export interface GraphicsSettings {
  drawDistance: number; // in chunks (16 world units each); sets fog/clip distance in walk mode
  shadows: boolean;
  textureQuality: 'low' | 'medium' | 'high';
}

interface GameState {
  mode: AppMode;
  roamSubMode: RoamSubMode;
  graphics: GraphicsSettings;
  /** Fly mode (walk view): no gravity, Space ascends, Shift descends. Toggled with F. */
  flying: boolean;
  setMode: (mode: AppMode) => void;
  setRoamSubMode: (sub: RoamSubMode) => void;
  setGraphics: (patch: Partial<GraphicsSettings>) => void;
  toggleFlying: () => void;
}

/** Phones and tablets start with lighter graphics so they run smoothly; the player can raise them. */
const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export const useGameStore = create<GameState>((set) => ({
  mode: 'build',
  roamSubMode: 'peaceful',
  graphics: {
    drawDistance: isCoarsePointer ? 5 : 8,
    shadows: !isCoarsePointer,
    textureQuality: isCoarsePointer ? 'low' : 'medium',
  },
  flying: false,
  setMode: (mode) => set({ mode }),
  setRoamSubMode: (roamSubMode) => set({ roamSubMode }),
  setGraphics: (patch) => set((state) => ({ graphics: { ...state.graphics, ...patch } })),
  toggleFlying: () => set((state) => ({ flying: !state.flying })),
}));
