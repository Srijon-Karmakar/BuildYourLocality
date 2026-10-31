import { create } from 'zustand';
import type { FacadeId, PieceType, RoofId } from '../city/catalog';

/** `select` opens a building in the inspector; `bulldoze` deletes what you click or drag over. */
export type BuilderTool = PieceType | 'bulldoze' | 'paint' | 'select' | 'move';

interface BuilderState {
  tool: BuilderTool;
  /** Quarter-turns applied to the piece about to be placed. */
  rotation: number;
  /** Materials applied to newly placed buildings and by the paint tool. */
  facade: FacadeId | 'preset';
  roof: RoofId | 'preset';
  /** Building currently open in the inspector. */
  selectedId: string | null;
  /** Block being edited in the inspector (index into the building's blocks). */
  selectedBlock: number;
  /** Building being carried to a new spot while the move tool is active. */
  movingId: string | null;
  setTool: (tool: BuilderTool) => void;
  rotate: () => void;
  setFacade: (facade: FacadeId | 'preset') => void;
  setRoof: (roof: RoofId | 'preset') => void;
  select: (id: string | null) => void;
  selectBlock: (index: number) => void;
  /** Starts carrying a building; `rotation` seeds the ghost with its current turn. */
  startMove: (id: string, rotation: number) => void;
  cancelMove: () => void;
}

export const useBuilderStore = create<BuilderState>((set) => ({
  tool: 'road',
  rotation: 0,
  facade: 'preset',
  roof: 'preset',
  selectedId: null,
  selectedBlock: 0,
  movingId: null,
  setTool: (tool) => set({ tool }),
  rotate: () => set((state) => ({ rotation: (state.rotation + 1) % 4 })),
  setFacade: (facade) => set({ facade }),
  setRoof: (roof) => set({ roof }),
  select: (selectedId) => set({ selectedId, selectedBlock: 0 }),
  selectBlock: (selectedBlock) => set({ selectedBlock }),
  startMove: (movingId, rotation) => set({ movingId, rotation, tool: 'move' }),
  cancelMove: () => set((state) => ({ movingId: null, tool: state.tool === 'move' ? 'select' : state.tool })),
}));

/** Tools that keep applying while the pointer is dragged across cells (draw-style tools). */
export const isDragTool = (tool: BuilderTool): boolean => tool === 'road' || tool === 'bulldoze' || tool === 'paint';
