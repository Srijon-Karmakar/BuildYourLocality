import { create } from 'zustand';

/** How new buildings appear: at once, or built by a crew of workers. */
export type ConstructionMode = 'instant' | 'fast' | 'realistic';

interface BuildRulesState {
  construction: ConstructionMode;
  setConstruction: (mode: ConstructionMode) => void;
}

const KEY = 'apnagali.construction.v1';
const MODES: ConstructionMode[] = ['instant', 'fast', 'realistic'];

function load(): ConstructionMode {
  try {
    const raw = localStorage.getItem(KEY);
    if (MODES.includes(raw as ConstructionMode)) return raw as ConstructionMode;
  } catch {
    /* storage blocked */
  }
  return 'fast';
}

export const useBuildRulesStore = create<BuildRulesState>((set) => ({
  construction: load(),
  setConstruction: (construction) => {
    set({ construction });
    try {
      localStorage.setItem(KEY, construction);
    } catch {
      /* the choice just will not be remembered */
    }
  },
}));
