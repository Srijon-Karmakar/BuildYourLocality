import { create } from 'zustand';
import { CELL } from '../city/catalog';

/**
 * Terrain is a sparse set of per-cell edits over an otherwise flat world: a height offset
 * (metres) and an optional ground cover. Height below WATER_LEVEL fills with water, so a
 * lake, a river or the sea is simply a dug-out depression. Everything is interpolated from
 * cell-corner heights so slopes are smooth.
 */

export type Cover = 'forest' | 'jungle' | 'sand' | 'rock';
export const COVERS: Cover[] = ['forest', 'jungle', 'sand', 'rock'];

export interface TerrainCell {
  /** Ground height offset in metres (negative digs a hollow). */
  h?: number;
  cover?: Cover;
}

export const WATER_LEVEL = -0.25;
/** Cells per terrain mesh chunk along one side (aligned with the 96 m ground-variation tile). */
export const CHUNK_CELLS = 16;
export const CHUNK_SIZE = CHUNK_CELLS * CELL;
export const MAX_HEIGHT = 120;
export const MIN_HEIGHT = -30;

/** How far from level a cell's corners may be and still take a building. */
const FLAT_EPS = 0.35;

const cellKey = (gx: number, gz: number) => `${gx},${gz}`;

// --- Brushes ---------------------------------------------------------------------------

export type BrushId =
  | 'mountain'
  | 'hill'
  | 'lake'
  | 'pond'
  | 'sea'
  | 'river'
  | 'flatten'
  | 'forest'
  | 'jungle'
  | 'sand'
  | 'rock'
  | 'clear';

export interface BrushDef {
  id: BrushId;
  label: string;
  icon: string;
  kind: 'raise' | 'lower' | 'flatten' | 'cover' | 'clearCover';
  /** Height (raise) or depth (lower) reached at the centre, metres. */
  magnitude: number;
  /** Brush radius in cells. */
  radius: number;
  cover?: Cover;
}

export const BRUSHES: BrushDef[] = [
  { id: 'mountain', label: 'Mountain', icon: 'mountain', kind: 'raise', magnitude: 32, radius: 6 },
  { id: 'hill', label: 'Hills', icon: 'hill', kind: 'raise', magnitude: 7, radius: 5 },
  { id: 'lake', label: 'Lake', icon: 'lake', kind: 'lower', magnitude: -3.5, radius: 5 },
  { id: 'pond', label: 'Pond', icon: 'pond', kind: 'lower', magnitude: -2, radius: 2.5 },
  { id: 'sea', label: 'Sea', icon: 'sea', kind: 'lower', magnitude: -6, radius: 12 },
  { id: 'river', label: 'River', icon: 'river', kind: 'lower', magnitude: -4, radius: 1.8 },
  { id: 'flatten', label: 'Flatten', icon: 'flatten', kind: 'flatten', magnitude: 0, radius: 4 },
  { id: 'forest', label: 'Forest', icon: 'forest', kind: 'cover', magnitude: 0, radius: 4, cover: 'forest' },
  { id: 'jungle', label: 'Jungle', icon: 'jungle', kind: 'cover', magnitude: 0, radius: 4, cover: 'jungle' },
  { id: 'sand', label: 'Sand', icon: 'sand', kind: 'cover', magnitude: 0, radius: 4, cover: 'sand' },
  { id: 'rock', label: 'Rock', icon: 'rock', kind: 'cover', magnitude: 0, radius: 4, cover: 'rock' },
  { id: 'clear', label: 'Clear cover', icon: 'clear', kind: 'clearCover', magnitude: 0, radius: 4 },
];

export const brushOf = (id: BrushId): BrushDef => BRUSHES.find((b) => b.id === id) ?? BRUSHES[0];

// --- Locks and caches ----------------------------------------------------------------------

/**
 * Cells under buildings and roads stay level, so terrain edits never tilt them. The city
 * registers this at start-up (the terrain code knows nothing about pieces).
 */
let lockProvider: (gx: number, gz: number) => boolean = () => false;

const cache = { version: -1, lock: 0, corners: new Map<string, number>() };
let lockVersion = 0;

export function setLockProvider(fn: (gx: number, gz: number) => boolean) {
  lockProvider = fn;
  invalidateTerrainCache();
}

/** Call when pieces change: corner heights next to them may need to flatten. */
export function invalidateTerrainCache() {
  lockVersion++;
}

// --- Store -------------------------------------------------------------------------------

type Cells = Record<string, TerrainCell>;
const HISTORY = 30;

interface TerrainState {
  cells: Cells;
  /** Bumped on every change; meshes and caches key on it. */
  version: number;
  past: Cells[];
  future: Cells[];
  /** Applies a brush at a world position. Returns true if anything changed. */
  paint: (brush: BrushDef, wx: number, wz: number, radius: number, magnitude: number) => boolean;
  /** Blasts a crater (a bowl with a low rim) and strips forest cover from it. No undo step. Returns how many cells of woodland were stripped. */
  crater: (wx: number, wz: number, radiusCells: number, depth: number) => number;
  /** Removes tree/sand/rock cover from these cells (used when something is built there). */
  clearCover: (cells: string[]) => void;
  clear: () => void;
  /** Replaces all terrain (loading a save). */
  setCells: (cells: Cells) => void;
  beginStroke: () => void;
  endStroke: () => void;
  undo: () => void;
  redo: () => void;
}

let stroking = false;
let strokeRecorded = false;

const smooth = (t: number) => t * t * (3 - 2 * t);
const hash = (x: number, z: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
/** Smooth value noise in [0, 1]. */
function noise2(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export const useTerrainStore = create<TerrainState>((set, get) => {
  const record = (): Pick<TerrainState, 'past' | 'future'> => {
    const { cells, past } = get();
    if (stroking && strokeRecorded) return { past, future: get().future };
    strokeRecorded = stroking;
    return { past: [...past.slice(-(HISTORY - 1)), cells], future: [] };
  };

  return {
    cells: {},
    version: 0,
    past: [],
    future: [],

    paint: (brush, wx, wz, radius, magnitude) => {
      const cells = get().cells;
      const next: Cells = { ...cells };
      let changed = false;
      const cx = wx / CELL - 0.5;
      const cz = wz / CELL - 0.5;
      const reach = Math.ceil(radius) + 1;
      for (let gx = Math.floor(cx) - reach; gx <= Math.floor(cx) + reach; gx++) {
        for (let gz = Math.floor(cz) - reach; gz <= Math.floor(cz) + reach; gz++) {
          const d = Math.hypot(gx - cx, gz - cz) / radius;
          if (d >= 1 || lockProvider(gx, gz)) continue;
          const w = smooth(1 - d);
          const key = cellKey(gx, gz);
          const cur = next[key] ?? {};
          const h = cur.h ?? 0;
          let nh = h;
          let cover = cur.cover;

          if (brush.kind === 'raise' || brush.kind === 'lower') {
            // Ragged mountains: scale the target by smooth noise so peaks aren't perfect domes.
            const rough = brush.id === 'mountain' ? 0.65 + 0.7 * noise2(gx * 0.33, gz * 0.33) : 1;
            const target = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, magnitude * rough));
            if (brush.kind === 'raise' && target > h) nh = h + (target - h) * w;
            if (brush.kind === 'lower' && target < h) nh = h + (target - h) * w;
            if (brush.kind === 'lower' && nh < WATER_LEVEL) cover = undefined; // a lake bed has no trees
          } else if (brush.kind === 'flatten') {
            nh = h + (0 - h) * w;
          } else if (brush.kind === 'cover' && w > 0.3 && brush.cover) {
            cover = brush.cover;
          } else if (brush.kind === 'clearCover' && w > 0.3) {
            cover = undefined;
          }

          nh = Math.round(nh * 20) / 20;
          if (nh === h && cover === cur.cover) continue;
          changed = true;
          if (Math.abs(nh) < 0.02 && !cover) delete next[key];
          else next[key] = { ...(Math.abs(nh) >= 0.02 ? { h: nh } : {}), ...(cover ? { cover } : {}) };
        }
      }
      if (!changed) return false;
      const history = record();
      set((s) => ({ ...history, cells: next, version: s.version + 1 }));
      return true;
    },

    crater: (wx, wz, radius, depth) => {
      const cells = get().cells;
      const next: Cells = { ...cells };
      let changed = false;
      let woods = 0;
      const cx = wx / CELL - 0.5;
      const cz = wz / CELL - 0.5;
      const reach = Math.ceil(radius) + 1;
      for (let gx = Math.floor(cx) - reach; gx <= Math.floor(cx) + reach; gx++) {
        for (let gz = Math.floor(cz) - reach; gz <= Math.floor(cz) + reach; gz++) {
          const d = Math.hypot(gx - cx, gz - cz) / radius;
          if (d >= 1 || lockProvider(gx, gz)) continue;
          const key = cellKey(gx, gz);
          const cur = next[key] ?? {};
          const h = cur.h ?? 0;
          // A bowl in the middle, and the earth thrown up into a low rim round it.
          const bowl = d < 0.78 ? -depth * smooth(1 - d / 0.78) : depth * 0.5 * Math.sin(((d - 0.78) / 0.22) * Math.PI);
          // The first blast on a spot digs down to the water table and stops, leaving a dry hole. Blasting the same spot again
          // digs below it, and the hole floods.
          const floor = h > WATER_LEVEL + 0.12 ? WATER_LEVEL + 0.05 : MIN_HEIGHT;
          const nh = Math.round(Math.max(floor, Math.min(MAX_HEIGHT, h + bowl)) * 20) / 20;
          let cover = cur.cover;
          if (cover === 'forest' || cover === 'jungle') {
            cover = undefined;
            woods++;
          }
          if (nh === h && cover === cur.cover) continue;
          changed = true;
          if (Math.abs(nh) < 0.02 && !cover) delete next[key];
          else next[key] = { ...(Math.abs(nh) >= 0.02 ? { h: nh } : {}), ...(cover ? { cover } : {}) };
        }
      }
      if (changed) set((s) => ({ cells: next, version: s.version + 1 }));
      return woods;
    },

    clearCover: (keys) => {
      const cells = get().cells;
      const next: Cells = { ...cells };
      let changed = false;
      for (const k of keys) {
        const cell = next[k];
        if (cell?.cover === 'forest' || cell?.cover === 'jungle') {
          changed = true;
          if (cell.h === undefined) delete next[k];
          else next[k] = { h: cell.h };
        }
      }
      if (changed) set((s) => ({ cells: next, version: s.version + 1 }));
    },

    clear: () => {
      if (Object.keys(get().cells).length === 0) return;
      const history = record();
      set((s) => ({ ...history, cells: {}, version: s.version + 1 }));
    },

    setCells: (cells) => set((s) => ({ cells, past: [], future: [], version: s.version + 1 })),

    beginStroke: () => {
      stroking = true;
      strokeRecorded = false;
    },
    endStroke: () => {
      stroking = false;
      strokeRecorded = false;
    },
    undo: () => {
      const { past, future, cells } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      set((s) => ({ cells: previous, past: past.slice(0, -1), future: [...future, cells], version: s.version + 1 }));
    },
    redo: () => {
      const { past, future, cells } = get();
      const next = future[future.length - 1];
      if (!next) return;
      set((s) => ({ cells: next, future: future.slice(0, -1), past: [...past, cells], version: s.version + 1 }));
    },
  };
});

// --- Queries ---------------------------------------------------------------------------------

/** True once any terrain has been edited; the world is a plain flat plane until then. */
export const hasTerrain = (): boolean => {
  const cells = useTerrainStore.getState().cells;
  for (const _ in cells) return true;
  return false;
};

function freshCache() {
  const version = useTerrainStore.getState().version;
  if (cache.version !== version || cache.lock !== lockVersion) {
    cache.version = version;
    cache.lock = lockVersion;
    cache.corners.clear();
  }
  return cache.corners;
}

/** Height at the corner shared by four cells; level (0) if any of them is under a building. */
function corner(ix: number, iz: number): number {
  const corners = freshCache();
  const key = `${ix},${iz}`;
  const hit = corners.get(key);
  if (hit !== undefined) return hit;
  const cells = useTerrainStore.getState().cells;
  let sum = 0;
  let locked = false;
  for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
    const gx = ix + dx;
    const gz = iz + dz;
    if (lockProvider(gx, gz)) {
      locked = true;
      break;
    }
    sum += cells[cellKey(gx, gz)]?.h ?? 0;
  }
  const value = locked ? 0 : sum / 4;
  corners.set(key, value);
  return value;
}

/** Ground height (metres) at a world position, smoothly interpolated between cell corners. */
export function heightAt(x: number, z: number): number {
  if (!hasTerrain()) return 0;
  const gx = x / CELL;
  const gz = z / CELL;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const sx = smooth(gx - ix);
  const sz = smooth(gz - iz);
  const h00 = corner(ix, iz);
  const h10 = corner(ix + 1, iz);
  const h01 = corner(ix, iz + 1);
  const h11 = corner(ix + 1, iz + 1);
  return h00 + (h10 - h00) * sx + (h01 - h00) * sz + (h00 - h10 - h01 + h11) * sx * sz;
}

export function coverAt(gx: number, gz: number): Cover | undefined {
  return useTerrainStore.getState().cells[cellKey(gx, gz)]?.cover;
}

export interface CellTerrain {
  /** Height at the cell centre. */
  h: number;
  water: boolean;
  /** Corners all within a few centimetres of level, and dry. */
  flat: boolean;
  /** Spread between the highest and lowest corner. */
  relief: number;
  cover: Cover | undefined;
}

export function cellTerrain(gx: number, gz: number): CellTerrain {
  if (!hasTerrain()) return { h: 0, water: false, flat: true, relief: 0, cover: undefined };
  const c = [corner(gx, gz), corner(gx + 1, gz), corner(gx, gz + 1), corner(gx + 1, gz + 1)];
  const h = heightAt((gx + 0.5) * CELL, (gz + 0.5) * CELL);
  const water = h < WATER_LEVEL + 0.1;
  const relief = Math.max(...c) - Math.min(...c);
  return {
    h,
    water,
    flat: !water && c.every((v) => Math.abs(v) <= FLAT_EPS),
    relief,
    cover: coverAt(gx, gz),
  };
}

/** A building (or anything but a bridge) can stand here. */
export function buildable(gx: number, gz: number): boolean {
  const t = cellTerrain(gx, gz);
  return t.flat && t.cover !== 'rock';
}

/** A road can go here: on level ground, or across water as a bridge. */
export function roadable(gx: number, gz: number): boolean {
  const t = cellTerrain(gx, gz);
  if (t.water) return t.relief < 3.5 || t.h < WATER_LEVEL - 0.5; // shallow banks are fine; sea bed too
  return t.flat && t.cover !== 'rock';
}

export const isWaterCell = (gx: number, gz: number): boolean => hasTerrain() && cellTerrain(gx, gz).water;

/** People and vehicles on foot can't cross open water, steep slopes or dense woods. */
export function walkableTerrain(gx: number, gz: number): boolean {
  if (!hasTerrain()) return true;
  const t = cellTerrain(gx, gz);
  return !t.water && t.relief < 2.2 && t.cover !== 'forest' && t.cover !== 'jungle' && t.cover !== 'rock';
}

/**
 * Where a ray first meets the ground. Marches in steps then bisects; on untouched terrain it
 * is just the y = 0 plane.
 */
export function raycastTerrain(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDistance = 900,
): { x: number; y: number; z: number } | null {
  if (!hasTerrain()) {
    if (dy > -1e-4) return null;
    const t = -oy / dy;
    return t > maxDistance || t < 0 ? null : { x: ox + dx * t, y: 0, z: oz + dz * t };
  }
  const len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const above = (t: number) => oy + uy * t - heightAt(ox + ux * t, oz + uz * t);
  let prev = 0;
  if (above(0) < 0) return { x: ox, y: oy, z: oz };
  for (let t = 4; t <= maxDistance; t += Math.max(2, t * 0.01)) {
    if (above(t) < 0) {
      let lo = prev;
      let hi = t;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (above(mid) < 0) hi = mid;
        else lo = mid;
      }
      const x = ox + ux * hi;
      const z = oz + uz * hi;
      return { x, y: heightAt(x, z), z };
    }
    prev = t;
  }
  return null;
}

/** Counts changes to the pieces standing on the terrain (for re-meshing chunks). */
export const getLockVersion = (): number => lockVersion;
