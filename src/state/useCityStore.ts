import { create } from 'zustand';
import {
  MAX_BLOCKS,
  MAX_FLOORS,
  MAX_LOT,
  MIN_FLOORS,
  MIN_LOT,
  PIECES,
  fitBlocks,
  rotatedFootprint,
  type FacadeId,
  type PieceType,
  type RoofId,
  type StyleOverrides,
} from '../city/catalog';

export interface Piece extends StyleOverrides {
  id: string;
  type: PieceType;
  /** Min-corner grid cell of the (rotated) footprint. */
  gx: number;
  gz: number;
  /** Quarter-turns about the vertical axis. */
  rot: number;
  facade: FacadeId;
  roof: RoofId;
}

export const cellKey = (gx: number, gz: number) => `${gx},${gz}`;

/** Every grid cell a piece of this type covers when anchored at (gx, gz). */
export function footprintCells(
  type: PieceType,
  gx: number,
  gz: number,
  rot: number,
  lot?: [number, number],
): string[] {
  const [w, d] = rotatedFootprint(PIECES[type], rot, lot);
  const cells: string[] = [];
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) cells.push(cellKey(gx + x, gz + z));
  return cells;
}

interface Snapshot {
  pieces: Record<string, Piece>;
  occupancy: Record<string, string>;
}

const HISTORY_LIMIT = 100;

/** Fields of a piece that the inspector may change. */
export type PiecePatch = Partial<
  Pick<Piece, 'facade' | 'roof' | 'floors' | 'roofStyle' | 'tint' | 'windows' | 'blocks' | 'door' | 'trim'>
>;

interface CityState extends Snapshot {
  past: Snapshot[];
  future: Snapshot[];
  /** True when every cell is free (cells held by `ignoreId` count as free). */
  canPlace: (type: PieceType, gx: number, gz: number, rot: number, lot?: [number, number], ignoreId?: string) => boolean;
  place: (piece: Omit<Piece, 'id'>) => boolean;
  /** Removes whichever piece covers the cell. */
  removeAt: (gx: number, gz: number) => boolean;
  removeById: (id: string) => boolean;
  /** Moves/rotates an existing piece to a new anchor, keeping all its customisation. */
  movePiece: (id: string, gx: number, gz: number, rot: number) => boolean;
  /** Resizes a building's lot (cells); blocks are clamped to fit. Fails if cells are taken. */
  setLot: (id: string, lot: [number, number]) => boolean;
  paintAt: (gx: number, gz: number, facade: FacadeId, roof: RoofId) => boolean;
  updatePiece: (id: string, patch: PiecePatch) => void;
  /** Deletes every piece (undoable). */
  clear: () => void;
  /** Replaces the whole city (used when loading a save); resets undo history. */
  setPieces: (pieces: Piece[]) => void;
  /** Groups the edits between begin and end (a mouse drag) into one undo step. */
  beginStroke: () => void;
  endStroke: () => void;
  undo: () => void;
  redo: () => void;
}

// Stroke state is bookkeeping, not UI state, so it lives outside the store.
let stroking = false;
let strokeRecorded = false;

export const useCityStore = create<CityState>((set, get) => {
  /** History patch to merge into the next `set`; call it before changing pieces. */
  const record = (): Pick<CityState, 'past' | 'future'> => {
    const { pieces, occupancy, past } = get();
    if (stroking && strokeRecorded) return { past, future: get().future };
    strokeRecorded = stroking;
    return { past: [...past.slice(-(HISTORY_LIMIT - 1)), { pieces, occupancy }], future: [] };
  };

  return {
    pieces: {},
    occupancy: {},
    past: [],
    future: [],

    canPlace: (type, gx, gz, rot, lot, ignoreId) => {
      const { occupancy } = get();
      return footprintCells(type, gx, gz, rot, lot).every((key) => !occupancy[key] || occupancy[key] === ignoreId);
    },

    place: (piece) => {
      if (!get().canPlace(piece.type, piece.gx, piece.gz, piece.rot, piece.lot)) return false;
      const id = crypto.randomUUID();
      const history = record();
      set((state) => {
        const occupancy = { ...state.occupancy };
        for (const key of footprintCells(piece.type, piece.gx, piece.gz, piece.rot, piece.lot)) occupancy[key] = id;
        return { ...history, pieces: { ...state.pieces, [id]: { ...piece, id } }, occupancy };
      });
      return true;
    },

    removeById: (id) => {
      if (!get().pieces[id]) return false;
      const history = record();
      set((state) => {
        const piece = state.pieces[id];
        const pieces = { ...state.pieces };
        delete pieces[id];
        const occupancy = { ...state.occupancy };
        for (const key of footprintCells(piece.type, piece.gx, piece.gz, piece.rot, piece.lot)) delete occupancy[key];
        return { ...history, pieces, occupancy };
      });
      return true;
    },

    removeAt: (gx, gz) => {
      const id = get().occupancy[cellKey(gx, gz)];
      return id ? get().removeById(id) : false;
    },

    movePiece: (id, gx, gz, rot) => {
      const piece = get().pieces[id];
      if (!piece || !get().canPlace(piece.type, gx, gz, rot, piece.lot, id)) return false;
      if (piece.gx === gx && piece.gz === gz && piece.rot === rot) return true;
      const history = record();
      set((state) => {
        const occupancy = { ...state.occupancy };
        for (const key of footprintCells(piece.type, piece.gx, piece.gz, piece.rot, piece.lot)) delete occupancy[key];
        for (const key of footprintCells(piece.type, gx, gz, rot, piece.lot)) occupancy[key] = id;
        return { ...history, pieces: { ...state.pieces, [id]: { ...piece, gx, gz, rot } }, occupancy };
      });
      return true;
    },

    setLot: (id, lot) => {
      const piece = get().pieces[id];
      if (!piece || !PIECES[piece.type].paintable) return false;
      const next: [number, number] = [
        Math.min(MAX_LOT, Math.max(MIN_LOT, lot[0])),
        Math.min(MAX_LOT, Math.max(MIN_LOT, lot[1])),
      ];
      const current = piece.lot ?? PIECES[piece.type].footprint;
      if (next[0] === current[0] && next[1] === current[1]) return true;
      if (!get().canPlace(piece.type, piece.gx, piece.gz, piece.rot, next, id)) return false;
      const history = record();
      set((state) => {
        const occupancy = { ...state.occupancy };
        for (const key of footprintCells(piece.type, piece.gx, piece.gz, piece.rot, piece.lot)) delete occupancy[key];
        for (const key of footprintCells(piece.type, piece.gx, piece.gz, piece.rot, next)) occupancy[key] = id;
        const blocks = piece.blocks ? fitBlocks(piece.blocks, next) : undefined;
        const updated: Piece = { ...piece, lot: next, ...(blocks ? { blocks } : {}) };
        return { ...history, pieces: { ...state.pieces, [id]: updated }, occupancy };
      });
      return true;
    },

    paintAt: (gx, gz, facade, roof) => {
      const { occupancy, pieces } = get();
      const piece = pieces[occupancy[cellKey(gx, gz)]];
      if (!piece || !PIECES[piece.type].paintable) return false;
      if (piece.facade === facade && piece.roof === roof) return false;
      const history = record();
      set({ ...history, pieces: { ...pieces, [piece.id]: { ...piece, facade, roof } } });
      return true;
    },

    updatePiece: (id, patch) => {
      const piece = get().pieces[id];
      if (!piece || !PIECES[piece.type].paintable) return;
      const next = { ...piece, ...patch };
      if (patch.floors !== undefined) {
        next.floors = Math.min(MAX_FLOORS, Math.max(MIN_FLOORS, Math.round(patch.floors)));
      }
      if (patch.blocks) {
        next.blocks = fitBlocks(patch.blocks, piece.lot ?? PIECES[piece.type].footprint)
          .slice(0, MAX_BLOCKS)
          .map((b) => ({ ...b, floors: Math.min(MAX_FLOORS, Math.max(MIN_FLOORS, Math.round(b.floors))) }));
      }
      if (Object.keys(patch).every((k) => piece[k as keyof PiecePatch] === next[k as keyof PiecePatch])) return;
      const history = record();
      set((state) => ({ ...history, pieces: { ...state.pieces, [id]: next } }));
    },

    clear: () => {
      if (Object.keys(get().pieces).length === 0) return;
      const history = record();
      set({ ...history, pieces: {}, occupancy: {} });
    },

    setPieces: (list) => {
      const pieces: Record<string, Piece> = {};
      const occupancy: Record<string, string> = {};
      for (const piece of list) {
        pieces[piece.id] = piece;
        for (const key of footprintCells(piece.type, piece.gx, piece.gz, piece.rot, piece.lot)) occupancy[key] = piece.id;
      }
      set({ pieces, occupancy, past: [], future: [] });
    },

    beginStroke: () => {
      stroking = true;
      strokeRecorded = false;
    },
    endStroke: () => {
      stroking = false;
      strokeRecorded = false;
    },

    undo: () => {
      const { past, future, pieces, occupancy } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      set({ ...previous, past: past.slice(0, -1), future: [...future, { pieces, occupancy }] });
    },
    redo: () => {
      const { past, future, pieces, occupancy } = get();
      const next = future[future.length - 1];
      if (!next) return;
      set({ ...next, future: future.slice(0, -1), past: [...past, { pieces, occupancy }] });
    },
  };
});

/** Bitmask of which neighbouring cells hold a road: N (-z) = 1, E (+x) = 2, S (+z) = 4, W (-x) = 8. */
export function roadMaskAt(
  pieces: Record<string, Piece>,
  occupancy: Record<string, string>,
  gx: number,
  gz: number,
): number {
  const isRoad = (x: number, z: number) => pieces[occupancy[cellKey(x, z)]]?.type === 'road';
  return (isRoad(gx, gz - 1) ? 1 : 0) | (isRoad(gx + 1, gz) ? 2 : 0) | (isRoad(gx, gz + 1) ? 4 : 0) | (isRoad(gx - 1, gz) ? 8 : 0);
}
