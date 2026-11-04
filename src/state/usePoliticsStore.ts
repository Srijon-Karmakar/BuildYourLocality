import { create } from 'zustand';

/** Budget / tax settings: 0 low, 1 normal, 2 high. */
export type Level = 0 | 1 | 2;

export interface Policies {
  tax: Level;
  police: Level;
  health: Level;
  education: Level;
  freeTransit: boolean;
  greenRules: boolean;
}

export const DEFAULT_POLICIES: Policies = { tax: 1, police: 1, health: 1, education: 1, freeTransit: false, greenRules: false };

export interface Election {
  won: boolean;
  share: number;
  mayor: string;
}

interface PoliticsState {
  policies: Policies;
  mayor: string;
  /** 0..100: how much of the city backs the mayor. */
  approval: number;
  /** Seconds into the current term. */
  term: number;
  termsWon: number;
  lastElection: Election | null;
  /** What citizens are grumbling about right now. */
  complaints: string[];
  setPolicy: <K extends keyof Policies>(key: K, value: Policies[K]) => void;
}

/** Seconds a mayor's term lasts. */
export const TERM_LENGTH = 600;
export const MAYORS = ['Asha Verma', 'Tomas Berg', 'Lena Okafor', 'Ravi Menon', 'Chloe Martin', 'Diego Alvarez', 'Yuki Tanaka', 'Mara Novak'];

const KEY = 'yatc.politics.v1';

function load(): Partial<PoliticsState> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PoliticsState>;
  } catch {
    return {};
  }
}

const saved = load();

export const usePoliticsStore = create<PoliticsState>((set) => ({
  policies: { ...DEFAULT_POLICIES, ...saved.policies },
  mayor: saved.mayor ?? MAYORS[0],
  approval: saved.approval ?? 55,
  term: saved.term ?? 0,
  termsWon: saved.termsWon ?? 0,
  lastElection: saved.lastElection ?? null,
  complaints: [],
  setPolicy: (key, value) => set((s) => ({ policies: { ...s.policies, [key]: value } })),
}));

usePoliticsStore.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ policies: s.policies, mayor: s.mayor, approval: s.approval, term: s.term, termsWon: s.termsWon, lastElection: s.lastElection }));
  } catch {
    /* nothing to save to */
  }
});
