import { create } from 'zustand';
import { DEFAULT_BLOCK, type BlockConfig } from '../lib/blockGen';

interface BlockGenState {
  config: BlockConfig;
  /** What the last stamp did, shown in the panel. */
  last: string | null;
  set: (patch: Partial<BlockConfig>) => void;
  shuffle: () => void;
}

export const useBlockGenStore = create<BlockGenState>((set) => ({
  config: DEFAULT_BLOCK,
  last: null,
  set: (patch) => set((s) => ({ config: { ...s.config, ...patch }, last: null })),
  shuffle: () => set((s) => ({ config: { ...s.config, seed: Math.floor(Math.random() * 99999) + 1 } })),
}));
