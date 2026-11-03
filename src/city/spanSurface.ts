import { CELL } from './catalog';
import { sampleSpan, resolveSpan, spanWidth, type SpanPath } from './spans';
import { useCityStore, type Piece } from '../state/useCityStore';
import { useTerrainStore } from '../terrain/terrain';

interface Runtime {
  piece: Piece;
  path: SpanPath;
  half: number;
  ax: number;
  az: number;
  /** Bounding box in world metres, widened by the deck's half width. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

let cache = new WeakMap<Piece, Runtime>();
let listFor: Record<string, Piece> | null = null;
let list: Runtime[] = [];
useTerrainStore.subscribe(() => {
  cache = new WeakMap();
  listFor = null;
});

function runtimeOf(piece: Piece): Runtime {
  let hit = cache.get(piece);
  if (!hit) {
    const spec = resolveSpan(piece.span);
    const ax = (piece.gx + 0.5) * CELL;
    const az = (piece.gz + 0.5) * CELL;
    const path = sampleSpan(spec, ax, az);
    const half = spanWidth(spec) / 2;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const p of path.samples) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z);
      z1 = Math.max(z1, p.z);
    }
    hit = { piece, path, half, ax, az, x0: x0 + ax - half, x1: x1 + ax + half, z0: z0 + az - half, z1: z1 + az + half };
    cache.set(piece, hit);
  }
  return hit;
}

/** Every bridge in the city, with its path worked out once. */
function spans(): Runtime[] {
  const pieces = useCityStore.getState().pieces;
  if (listFor !== pieces) {
    listFor = pieces;
    list = Object.values(pieces)
      .filter((p) => p.type === 'span')
      .map(runtimeOf);
  }
  return list;
}

export const hasSpans = () => spans().length > 0;

interface Hit {
  runtime: Runtime;
  /** Metres from the path's centre line. */
  distance: number;
  /** Deck height at that point. */
  y: number;
}

/** The deck point nearest (x, z), if it lies within `reach` metres of the centre line beyond the deck's edge. */
function nearest(r: Runtime, x: number, z: number, reach: number): Hit | null {
  if (x < r.x0 - reach || x > r.x1 + reach || z < r.z0 - reach || z > r.z1 + reach) return null;
  const px = x - r.ax;
  const pz = z - r.az;
  const s = r.path.samples;
  let best: Hit | null = null;
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i];
    const b = s[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((px - a.x) * dx + (pz - a.z) * dz) / len2));
    const d = Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
    if (d <= r.half + reach && (!best || d < best.distance)) best = { runtime: r, distance: d, y: a.y + (b.y - a.y) * t };
  }
  return best;
}

/**
 * Height of a bridge deck at (x, z) that a car or person at height `refY` could be on, or null when
 * they are not over one. A deck far above or below `refY` is ignored, so what drives under a bridge
 * stays under it.
 */
export function spanSurfaceAt(x: number, z: number, refY: number, margin = 1.8): number | null {
  const all = spans();
  if (all.length === 0) return null;
  let best: number | null = null;
  for (const r of all) {
    const hit = nearest(r, x, z, 0);
    if (!hit || hit.distance > r.half) continue;
    // A deck above the car's head is a bridge it is driving under.
    if (hit.y > refY + margin) continue;
    if (best === null || hit.y > best) best = hit.y;
  }
  return best;
}

/** The bridge whose deck passes within `reach` metres of a ground point, for picking it in build mode. */
export function spanNear(x: number, z: number, reach: number): Piece | undefined {
  const all = spans();
  if (all.length === 0) return undefined;
  let best: Piece | undefined;
  let bestD = Infinity;
  for (const r of all) {
    const hit = nearest(r, x, z, reach);
    if (hit && hit.distance - r.half < bestD) {
      bestD = hit.distance - r.half;
      best = r.piece;
    }
  }
  return bestD <= reach ? best : undefined;
}
