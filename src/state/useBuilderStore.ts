import { create } from 'zustand';
import { BRUSHES, brushOf, type BrushId } from '../terrain/terrain';
import { DEFAULT_FOREST, type ForestBrush } from '../city/forest';
import { WALL_STYLES, wallStyleOf, type WallSpec, type WallStyleId } from '../city/walls';
import { ROAD_PRESETS, type FacadeId, type PieceType, type RoadSpec, type RoofId } from '../city/catalog';

/** `select` opens a building in the inspector; `bulldoze` deletes what you click or drag over. */
export type BuilderTool = PieceType | 'bulldoze' | 'paint' | 'select' | 'move' | 'terrain' | 'forest' | 'wall';

interface BuilderState {
  tool: BuilderTool;
  /** Quarter-turns applied to the piece about to be placed. */
  rotation: number;
  /** Materials applied to newly placed buildings and by the paint tool. */
  facade: FacadeId | 'preset';
  roof: RoofId | 'preset';
  /** Settings given to roads as they are placed. */
  roadSpec: Partial<RoadSpec>;
  roadPreset: string;
  /** Terrain tool: which brush, its radius (cells) and its height / depth (metres). */
  brush: BrushId;
  brushRadius: number;
  brushMagnitude: number;
  /** Wall tool: the style and settings of the wall about to be drawn. */
  wall: WallSpec;
  setWall: (patch: Partial<WallSpec>) => void;
  applyWallStyle: (id: WallStyleId) => void;
  /** Forest tool: how wide, how dense and which trees. */
  forest: ForestBrush;
  setForest: (patch: Partial<ForestBrush>) => void;
  /** Building currently open in the inspector (the latest one picked when several are). */
  selectedId: string | null;
  /** Everything picked: more than one means the group inspector is open. */
  selectedIds: string[];
  /** While on, clicks add to / remove from the selection instead of replacing it (Shift or Ctrl does the same). */
  multiSelect: boolean;
  /** Block being edited in the inspector (index into the building's blocks). */
  selectedBlock: number;
  /** Building being carried to a new spot while the move tool is active. */
  movingId: string | null;
  setTool: (tool: BuilderTool) => void;
  rotate: () => void;
  setFacade: (facade: FacadeId | 'preset') => void;
  setRoof: (roof: RoofId | 'preset') => void;
  setRoadSpec: (patch: Partial<RoadSpec>) => void;
  applyRoadPreset: (id: string) => void;
  setBrush: (id: BrushId) => void;
  setBrushRadius: (radius: number) => void;
  setBrushMagnitude: (magnitude: number) => void;
  select: (id: string | null) => void;
  toggleSelect: (id: string) => void;
  /** Selects these pieces; `add` keeps what was already selected. */
  selectMany: (ids: string[], add?: boolean) => void;
  setMultiSelect: (on: boolean) => void;
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
  roadSpec: { ...ROAD_PRESETS[0].spec },
  roadPreset: ROAD_PRESETS[0].id,
  brush: BRUSHES[0].id,
  brushRadius: BRUSHES[0].radius,
  brushMagnitude: BRUSHES[0].magnitude,
  wall: { ...WALL_STYLES[0].defaults },
  setWall: (patch) => set((state) => ({ wall: { ...state.wall, ...patch } })),
  applyWallStyle: (id) => set({ wall: { ...wallStyleOf(id).defaults } }),
  forest: DEFAULT_FOREST,
  setForest: (patch) => set((state) => ({ forest: { ...state.forest, ...patch } })),
  selectedId: null,
  selectedIds: [],
  multiSelect: false,
  selectedBlock: 0,
  movingId: null,
  setTool: (tool) => set({ tool }),
  rotate: () => set((state) => ({ rotation: (state.rotation + 1) % 4 })),
  setFacade: (facade) => set({ facade }),
  setRoof: (roof) => set({ roof }),
  setRoadSpec: (patch) => set((state) => ({ roadSpec: { ...state.roadSpec, ...patch }, roadPreset: 'custom' })),
  applyRoadPreset: (id) => {
    const preset = ROAD_PRESETS.find((p) => p.id === id);
    if (preset) set({ roadSpec: { ...preset.spec }, roadPreset: id });
  },
  setBrush: (id) => set({ brush: id, brushRadius: brushOf(id).radius, brushMagnitude: brushOf(id).magnitude }),
  setBrushRadius: (brushRadius) => set({ brushRadius }),
  setBrushMagnitude: (brushMagnitude) => set({ brushMagnitude }),
  select: (selectedId) => set({ selectedId, selectedIds: selectedId ? [selectedId] : [], selectedBlock: 0 }),
  toggleSelect: (id) =>
    set((state) => {
      const selectedIds = state.selectedIds.includes(id) ? state.selectedIds.filter((s) => s !== id) : [...state.selectedIds, id];
      return { selectedIds, selectedId: selectedIds[selectedIds.length - 1] ?? null, selectedBlock: 0 };
    }),
  selectMany: (ids, add = false) =>
    set((state) => {
      const selectedIds = add ? [...new Set([...state.selectedIds, ...ids])] : [...new Set(ids)];
      return { selectedIds, selectedId: selectedIds[selectedIds.length - 1] ?? null, selectedBlock: 0 };
    }),
  setMultiSelect: (multiSelect) => set({ multiSelect }),
  selectBlock: (selectedBlock) => set({ selectedBlock }),
  startMove: (movingId, rotation) => set({ movingId, rotation, tool: 'move' }),
  cancelMove: () => set((state) => ({ movingId: null, tool: state.tool === 'move' ? 'select' : state.tool })),
}));

/** Tools that keep applying while the pointer is dragged across cells (draw-style tools). */
export const isDragTool = (tool: BuilderTool): boolean => tool === 'road' || tool === 'rail' || tool === 'metrotrack' || tool === 'pier' || tool === 'runway' || tool === 'taxiway' || tool === 'apron' || tool === 'bulldoze' || tool === 'paint' || tool === 'terrain' || tool === 'forest' || tool === 'wall';
