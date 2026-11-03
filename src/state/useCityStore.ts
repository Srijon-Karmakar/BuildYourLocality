import { create } from 'zustand';
import {
  MAX_BLOCKS,
  MAX_FLOORS,
  MAX_LOT,
  MIN_FLOORS,
  MIN_LOT,
  PIECES,
  fitBlocks,
  CELL,
  ROAD_LIKE,
  isOverlay,
  keepsClear,
  crossingArms,
  resolveRoad,
  roadLayout,
  rotatedFootprint,
  type RoadSpec,
  type FacadeId,
  type PieceType,
  type RoofId,
  type StyleOverrides,
} from '../city/catalog';
import { WATER_LEVEL, buildable, invalidateTerrainCache, roadable, setLockProvider, useTerrainStore } from '../terrain/terrain';

type PlaceListener = (piece: Piece) => void;
const placeListeners = new Set<PlaceListener>();
/** Called after the player places a piece (not when loading a saved city or undoing). */
export function onPiecePlaced(listener: PlaceListener): () => void {
  placeListeners.add(listener);
  return () => placeListeners.delete(listener);
}

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
  /** Overlay pieces (trees) sharing a cell are nudged apart: metres east / south of the cell centre. */
  offset?: [number, number];
}

export const cellKey = (gx: number, gz: number) => `${gx},${gz}`;

/** Overlays and walls stand over or beside other things instead of taking their cell. */
export const claimsCell = (type: PieceType) => !isOverlay(type) && type !== 'wall';

const overlayCache = new WeakMap<Record<string, Piece>, Map<string, string[]>>();

/** Overlay pieces (trees) by cell, oldest first. Recomputed only when the city changes. */
function overlaysByCell(pieces: Record<string, Piece>): Map<string, string[]> {
  let cached = overlayCache.get(pieces);
  if (!cached) {
    cached = new Map();
    for (const piece of Object.values(pieces)) {
      if (!isOverlay(piece.type)) continue;
      const key = cellKey(piece.gx, piece.gz);
      const list = cached.get(key);
      if (list) list.push(piece.id);
      else cached.set(key, [piece.id]);
    }
    overlayCache.set(pieces, cached);
  }
  return cached;
}

/** Overlay pieces (trees) whose centre lies within `radius` metres of a world point. */
export function overlaysNear(pieces: Record<string, Piece>, x: number, z: number, radius: number): Piece[] {
  const map = overlaysByCell(pieces);
  const found: Piece[] = [];
  const reach = Math.ceil(radius / CELL) + 1;
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  for (let gx = cx - reach; gx <= cx + reach; gx++) {
    for (let gz = cz - reach; gz <= cz + reach; gz++) {
      for (const id of map.get(cellKey(gx, gz)) ?? []) {
        const p = pieces[id];
        const px = (p.gx + 0.5) * CELL + (p.offset?.[0] ?? 0);
        const pz = (p.gz + 0.5) * CELL + (p.offset?.[1] ?? 0);
        if (Math.hypot(px - x, pz - z) <= radius) found.push(p);
      }
    }
  }
  return found;
}

/** The wall whose line runs closest to a ground point, if one is within `reach` metres. */
export function wallNear(pieces: Record<string, Piece>, x: number, z: number, reach: number): Piece | undefined {
  let best: Piece | undefined;
  let bestD = reach;
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  for (const p of Object.values(pieces)) {
    if (p.type !== 'wall' || Math.abs(p.gx - cx) > 1 || Math.abs(p.gz - cz) > 1) continue;
    // Distance from the point to the wall's line segment.
    const x0 = p.gx * CELL;
    const z0 = p.gz * CELL;
    const dx = p.rot === 0 ? Math.max(x0 - x, 0, x - (x0 + CELL)) : Math.abs(x - x0);
    const dz = p.rot === 0 ? Math.abs(z - z0) : Math.max(z0 - z, 0, z - (z0 + CELL));
    const d = Math.hypot(dx, dz);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** What a click on this cell means: the most recently planted overlay, else the piece that claims the cell. */
export function topIdAt(pieces: Record<string, Piece>, occupancy: Record<string, string>, gx: number, gz: number): string | undefined {
  const overlays = overlaysByCell(pieces).get(cellKey(gx, gz));
  return overlays?.[overlays.length - 1] ?? occupancy[cellKey(gx, gz)];
}

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

const NEIGHBOURS_8: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

const reservedCache = new WeakMap<Record<string, Piece>, Set<string>>();

/**
 * Cells claimed by wide roads (3+ lanes): the ring of cells around each one, which the road
 * paints over. Other pieces can't be built there, but more road can.
 */
export function reservedCells(pieces: Record<string, Piece>): Set<string> {
  let cached = reservedCache.get(pieces);
  if (cached) return cached;
  cached = new Set<string>();
  for (const piece of Object.values(pieces)) {
    if (piece.type !== 'road' || roadLayout(resolveRoad(piece.road)).cellsWide !== 3) continue;
    for (const [dx, dz] of NEIGHBOURS_8) cached.add(cellKey(piece.gx + dx, piece.gz + dz));
  }
  reservedCache.set(pieces, cached);
  return cached;
}

/** True if something other than road already stands in the ring a wide road would claim. */
export function wideRoadBlocked(
  pieces: Record<string, Piece>,
  occupancy: Record<string, string>,
  gx: number,
  gz: number,
  ignoreId?: string,
): boolean {
  return NEIGHBOURS_8.some(([dx, dz]) => {
    const id = occupancy[cellKey(gx + dx, gz + dz)];
    return !!id && id !== ignoreId && pieces[id]?.type !== 'road';
  });
}

/** Road pieces connected to `startId` through neighbouring road cells (optionally only identical ones). */
export function connectedRoads(
  pieces: Record<string, Piece>,
  occupancy: Record<string, string>,
  startId: string,
  sameSpecOnly: boolean,
): string[] {
  const start = pieces[startId];
  if (!start || start.type !== 'road') return [];
  const signature = JSON.stringify(resolveRoad(start.road));
  const seen = new Set([startId]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const id = occupancy[cellKey(cur.gx + dx, cur.gz + dz)];
      const next = id ? pieces[id] : undefined;
      if (!next || next.type !== 'road' || seen.has(id)) continue;
      if (sameSpecOnly && JSON.stringify(resolveRoad(next.road)) !== signature) continue;
      seen.add(id);
      queue.push(next);
    }
  }
  return [...seen];
}

interface Snapshot {
  pieces: Record<string, Piece>;
  occupancy: Record<string, string>;
}

const HISTORY_LIMIT = 100;

/** Fields of a piece that the inspector may change. */
export type PiecePatch = Partial<
  Pick<
    Piece,
    | 'facade'
    | 'roof'
    | 'floors'
    | 'roofStyle'
    | 'tint'
    | 'windows'
    | 'blocks'
    | 'door'
    | 'trim'
    | 'led'
    | 'leds'
    | 'roofExtras'
    | 'balconies'
    | 'cornice'
    | 'corners'
    | 'bands'
    | 'tree'
    | 'wall'
    | 'sign'
    | 'accent'
    | 'scale'
    | 'road'
  >
>;

interface CityState extends Snapshot {
  past: Snapshot[];
  future: Snapshot[];
  /** True when every cell is free (cells held by `ignoreId` count as free). */
  canPlace: (
    type: PieceType,
    gx: number,
    gz: number,
    rot: number,
    lot?: [number, number],
    ignoreId?: string,
    road?: Partial<RoadSpec>,
  ) => boolean;
  place: (piece: Omit<Piece, 'id'>) => boolean;
  /** Removes whichever piece covers the cell. */
  removeAt: (gx: number, gz: number) => boolean;
  /** Plants many trees as one undo step; each must pass the usual placement rules. Returns how many were planted. */
  placeMany: (pieces: Omit<Piece, 'id'>[]) => number;
  /** Removes many pieces as one undo step. Returns how many went. */
  removeMany: (ids: string[]) => number;
  removeById: (id: string) => boolean;
  /** Moves/rotates an existing piece to a new anchor, keeping all its customisation. */
  movePiece: (id: string, gx: number, gz: number, rot: number) => boolean;
  /** Resizes a building's lot (cells); blocks are clamped to fit. Fails if cells are taken. */
  setLot: (id: string, lot: [number, number]) => boolean;
  paintAt: (gx: number, gz: number, facade: FacadeId, roof: RoofId) => boolean;
  updatePiece: (id: string, patch: PiecePatch) => void;
  /** Applies a change to many pieces as one undo step. `change` may return null to leave a piece alone. */
  updateMany: (ids: string[], change: (piece: Piece) => PiecePatch | null) => number;
  /** Applies road settings to many road pieces as one undo step; pieces that can't widen are skipped. Returns how many changed. */
  updateRoads: (ids: string[], road: Partial<RoadSpec>) => number;
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

/** The piece with a patch applied (floors and blocks kept within limits), or null when nothing changes. */
function applyPatch(piece: Piece, patch: PiecePatch): Piece | null {
  const next = { ...piece, ...patch };
  if (patch.floors !== undefined) {
    next.floors = Math.min(MAX_FLOORS, Math.max(MIN_FLOORS, Math.round(patch.floors)));
  }
  if (patch.blocks) {
    next.blocks = fitBlocks(patch.blocks, piece.lot ?? PIECES[piece.type].footprint)
      .slice(0, MAX_BLOCKS)
      .map((b) => ({ ...b, floors: Math.min(MAX_FLOORS, Math.max(MIN_FLOORS, Math.round(b.floors))) }));
  }
  if (Object.keys(patch).every((k) => JSON.stringify(piece[k as keyof PiecePatch]) === JSON.stringify(next[k as keyof PiecePatch]))) return null;
  return next;
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

    canPlace: (type, gx, gz, rot, lot, ignoreId, road) => {
      const { occupancy, pieces } = get();
      const cells = footprintCells(type, gx, gz, rot, lot);
      if (type === 'wall') {
        // One wall to an edge (placing again restyles it), and never in water.
        const edge = Object.values(pieces).some((p) => p.type === 'wall' && p.gx === gx && p.gz === gz && p.rot === rot && p.id !== ignoreId);
        return !edge && buildable(gx, gz);
      }
      if (isOverlay(type)) {
        // Trees can go over anything that is not a road, track or airfield.
        const under = pieces[occupancy[cells[0]]];
        if (type !== 'lamp' && under && under.id !== ignoreId && keepsClear(under.type)) return false;
      } else if (!cells.every((key) => !occupancy[key] || occupancy[key] === ignoreId)) return false;
      // The ground must suit it: level for buildings, level or water (a bridge) for roads.
      const suits = ROAD_LIKE.includes(type) ? roadable : buildable;
      if (!cells.every((key) => suits(...(key.split(',').map(Number) as [number, number])))) return false;
      if (type === 'road') {
        // A wide road needs its surrounding cells free of buildings and props.
        return roadLayout(resolveRoad(road)).cellsWide === 1 || !wideRoadBlocked(pieces, occupancy, gx, gz, ignoreId);
      }
      // Everything else keeps off the cells wide roads have claimed.
      const reserved = reservedCells(pieces);
      return !cells.some((key) => reserved.has(key));
    },

    place: (piece) => {
      if (!get().canPlace(piece.type, piece.gx, piece.gz, piece.rot, piece.lot, undefined, piece.road)) return false;
      // One streetlight to a corner: placing on the same corner again does nothing.
      if (piece.type === 'lamp' && piece.offset) {
        const [ox, oz] = piece.offset;
        const taken = Object.values(get().pieces).some((p) => p.type === 'lamp' && p.gx === piece.gx && p.gz === piece.gz && Math.abs((p.offset?.[0] ?? 0) - ox) < 0.5 && Math.abs((p.offset?.[1] ?? 0) - oz) < 0.5);
        if (taken) return false;
      }
      const id = crypto.randomUUID();
      const history = record();
      set((state) => {
        const occupancy = { ...state.occupancy };
        const placed: Piece = { ...piece, id };
        if (isOverlay(piece.type)) {
          // Not claiming the cell; when it is already busy, step aside so the trees do not sit on top of each other.
          const key = cellKey(piece.gx, piece.gz);
          if (!piece.offset && (occupancy[key] || overlaysByCell(state.pieces).has(key))) {
            placed.offset = [Math.round((Math.random() - 0.5) * 4.4 * 10) / 10, Math.round((Math.random() - 0.5) * 4.4 * 10) / 10];
          }
        } else {
          if (claimsCell(piece.type)) for (const key of footprintCells(piece.type, piece.gx, piece.gz, piece.rot, piece.lot)) occupancy[key] = id;
        }
        return { ...history, pieces: { ...state.pieces, [id]: placed }, occupancy };
      });
      // Building clears any trees on the plot.
      useTerrainStore.getState().clearCover(footprintCells(piece.type, piece.gx, piece.gz, piece.rot, piece.lot));
      const placed = get().pieces[id];
      if (placed) for (const listener of placeListeners) listener(placed);
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
        if (claimsCell(piece.type)) for (const key of footprintCells(piece.type, piece.gx, piece.gz, piece.rot, piece.lot)) delete occupancy[key];
        return { ...history, pieces, occupancy };
      });
      return true;
    },

    placeMany: (list) => {
      const accepted = list.filter((p) => get().canPlace(p.type, p.gx, p.gz, p.rot, p.lot, undefined, p.road));
      if (accepted.length === 0) return 0;
      const history = record();
      set((state) => {
        const pieces = { ...state.pieces };
        for (const piece of accepted) {
          const id = crypto.randomUUID();
          pieces[id] = { ...piece, id };
        }
        return { ...history, pieces };
      });
      return accepted.length;
    },

    removeMany: (ids) => {
      const present = ids.filter((id) => get().pieces[id]);
      if (present.length === 0) return 0;
      const history = record();
      set((state) => {
        const pieces = { ...state.pieces };
        const occupancy = { ...state.occupancy };
        for (const id of present) {
          const piece = pieces[id];
          delete pieces[id];
          if (claimsCell(piece.type)) for (const key of footprintCells(piece.type, piece.gx, piece.gz, piece.rot, piece.lot)) delete occupancy[key];
        }
        return { ...history, pieces, occupancy };
      });
      return present.length;
    },

    removeAt: (gx, gz) => {
      const id = topIdAt(get().pieces, get().occupancy, gx, gz);
      return id ? get().removeById(id) : false;
    },

    movePiece: (id, gx, gz, rot) => {
      const piece = get().pieces[id];
      if (!piece || !get().canPlace(piece.type, gx, gz, rot, piece.lot, id)) return false;
      if (piece.gx === gx && piece.gz === gz && piece.rot === rot) return true;
      const history = record();
      set((state) => {
        const occupancy = { ...state.occupancy };
        if (claimsCell(piece.type)) {
          for (const key of footprintCells(piece.type, piece.gx, piece.gz, piece.rot, piece.lot)) delete occupancy[key];
          for (const key of footprintCells(piece.type, gx, gz, rot, piece.lot)) occupancy[key] = id;
        }
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

    updateRoads: (ids, road) => {
      const { pieces, occupancy } = get();
      const changed: Piece[] = [];
      for (const id of ids) {
        const piece = pieces[id];
        if (!piece || piece.type !== 'road') continue;
        const merged = { ...piece.road, ...road };
        if (roadLayout(resolveRoad(merged)).cellsWide === 3 && wideRoadBlocked(pieces, occupancy, piece.gx, piece.gz, id)) continue;
        changed.push({ ...piece, road: merged });
      }
      if (changed.length === 0) return 0;
      const history = record();
      set((state) => {
        const next = { ...state.pieces };
        for (const p of changed) next[p.id] = p;
        return { ...history, pieces: next };
      });
      return changed.length;
    },

    updatePiece: (id, patch) => {
      const piece = get().pieces[id];
      if (!piece || !PIECES[piece.type].customisable) return;
      const next = applyPatch(piece, patch);
      if (!next) return;
      const history = record();
      set((state) => ({ ...history, pieces: { ...state.pieces, [id]: next } }));
    },

    updateMany: (ids, change) => {
      const updates: Piece[] = [];
      for (const id of ids) {
        const piece = get().pieces[id];
        if (!piece || !PIECES[piece.type].customisable) continue;
        const patch = change(piece);
        const next = patch ? applyPatch(piece, patch) : null;
        if (next) updates.push(next);
      }
      if (updates.length === 0) return 0;
      const history = record();
      set((state) => {
        const pieces = { ...state.pieces };
        for (const piece of updates) pieces[piece.id] = piece;
        return { ...history, pieces };
      });
      return updates.length;
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
        if (!claimsCell(piece.type)) continue;
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
  return linkedMask(pieces, occupancy, gx, gz, 'road');
}

/** Bit of the side of a cell facing a neighbour at (dx, dz). */
const sideBit = (dx: number, dz: number) => (dz < 0 ? 1 : dx > 0 ? 2 : dz > 0 ? 4 : 8);

/** Which arms of a piece carry this kind of traffic (roads/rails link everywhere, crossings only their own axis). */
function armsOf(piece: Piece | undefined, family: 'road' | 'rail' | 'metro' | 'taxi' | 'pier'): number {
  if (!piece) return 0;
  if (family === 'road') return piece.type === 'road' ? 15 : piece.type === 'crossing' ? crossingArms(piece.rot, 'road') : 0;
  if (family === 'rail') {
    return piece.type === 'rail' || piece.type === 'station' ? 15 : piece.type === 'crossing' ? crossingArms(piece.rot, 'rail') : 0;
  }
  if (family === 'pier') return piece.type === 'pier' ? 15 : 0;
  if (family === 'taxi') return piece.type === 'runway' || piece.type === 'taxiway' || piece.type === 'apron' ? 15 : 0;
  return piece.type === 'metrotrack' ? 15 : 0;
}

/**
 * Bitmask (N=1, E=2, S=4, W=8) of the neighbours this cell is linked to for one kind of
 * network. A link needs both ends to accept it, so a level crossing only joins the road along
 * its road axis and the railway along its rail axis.
 */
export function linkedMask(
  pieces: Record<string, Piece>,
  occupancy: Record<string, string>,
  gx: number,
  gz: number,
  family: 'road' | 'rail' | 'metro' | 'taxi' | 'pier',
): number {
  const here = armsOf(pieces[occupancy[cellKey(gx, gz)]], family) || 15;
  let mask = 0;
  for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const bit = sideBit(dx, dz);
    const opposite = sideBit(-dx, -dz);
    const other = armsOf(pieces[occupancy[cellKey(gx + dx, gz + dz)]], family);
    if (here & bit && other & opposite) mask |= bit;
  }
  return mask;
}

/** Bitmask of connected rail neighbours (track, stations, and level crossings along the rail). */
export const railMaskAt = (pieces: Record<string, Piece>, occupancy: Record<string, string>, gx: number, gz: number) =>
  linkedMask(pieces, occupancy, gx, gz, 'rail');

/** Bitmask of connected airfield neighbours (runway, taxiway and apron link to each other). */
export const taxiMaskAt = (pieces: Record<string, Piece>, occupancy: Record<string, string>, gx: number, gz: number) =>
  linkedMask(pieces, occupancy, gx, gz, 'taxi');

/** Bitmask of connected pier neighbours. */
export const pierMaskAt = (pieces: Record<string, Piece>, occupancy: Record<string, string>, gx: number, gz: number) =>
  linkedMask(pieces, occupancy, gx, gz, 'pier');

/** Bitmask of connected metro-line neighbours. */
export const metroMaskAt = (pieces: Record<string, Piece>, occupancy: Record<string, string>, gx: number, gz: number) =>
  linkedMask(pieces, occupancy, gx, gz, 'metro');

// Cells under buildings and roads stay level, so editing nearby terrain never tilts them.
// Bridges (roads on water) are the exception: the water must stay dug out beneath them.
setLockProvider((gx, gz) => {
  const { occupancy, pieces } = useCityStore.getState();
  const id = occupancy[cellKey(gx, gz)];
  if (!id) return false;
  if ((pieces[id]?.type === 'road' || pieces[id]?.type === 'pier') && (useTerrainStore.getState().cells[cellKey(gx, gz)]?.h ?? 0) < WATER_LEVEL) return false;
  return true;
});
useCityStore.subscribe((state, prev) => {
  if (state.pieces !== prev.pieces) invalidateTerrainCache();
});
