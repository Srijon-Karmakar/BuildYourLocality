import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL } from './catalog';
import { paint, sector, slab, type Part } from './roadGeometry';

// --- Layout (metres) -----------------------------------------------------------------
// A rail cell is double track: two lines either side of the centre, so trains pass each other
// like cars on a two-lane road. Platforms sit between them.

/** Offset of each track's centre line from the cell centre (trains run on the right). */
export const TRACK_OFFSET = 1.9;
const GAUGE = 0.72; // rail centre from track centre
const BED_HALF = 2.95;
const Y_BED = 0.14;
const Y_ROAD = 0.08;

const BALLAST = '#6e6a62';
const SLEEPER = '#4a3f33';
const STEEL = '#a1a7ad';
const PLANK = '#58504a';
const PLATFORM = '#cbc7bd';
const PLATFORM_EDGE = '#e6c84a';
const ROOF = '#2c3036';
const CONCRETE = '#8a8c90';
const TUNNEL = '#4a8dff';

const N = 1;
const E = 2;
const S = 4;
const W = 8;
const ARMS: [number, number, number][] = [
  [N, 0, -1],
  [E, 1, 0],
  [S, 0, 1],
  [W, -1, 0],
];

function cornerOf(mask: number) {
  const h = CELL / 2;
  if (mask === (N | E)) return { px: h, pz: -h, phi0: Math.PI / 2, phi1: Math.PI };
  if (mask === (E | S)) return { px: h, pz: h, phi0: Math.PI, phi1: (3 * Math.PI) / 2 };
  if (mask === (S | W)) return { px: -h, pz: h, phi0: -Math.PI / 2, phi1: 0 };
  return { px: -h, pz: -h, phi0: 0, phi1: Math.PI / 2 };
}

export interface RailOptions {
  /** Laid flush with a road (level crossing): no ballast, planks between the rails. */
  flush?: boolean;
  /** Island platform with a shelter between the two tracks. */
  platform?: boolean;
  /** Carried over water on a deck with a pier. */
  bridge?: boolean;
}

const cache = new Map<string, THREE.BufferGeometry>();

/** Straight section of double track along an axis between two distances from the cell centre. */
function straight(alongX: boolean, from: number, to: number, y: number, flush: boolean, parts: Part[]) {
  const len = to - from;
  const mid = (from + to) / 2;
  const box = (across: number, long: number, off: number, along: number, yy: number, h: number, colour: string) =>
    parts.push(alongX ? slab(long, across, along, off, yy, h, colour) : slab(across, long, off, along, yy, h, colour));

  if (flush) box(BED_HALF * 2, len, 0, mid, Y_ROAD, 0.02, PLANK);
  else box(BED_HALF * 2, len, 0, mid, 0, y, BALLAST);
  for (const side of [-1, 1]) {
    const c = side * TRACK_OFFSET;
    if (!flush) {
      for (let a = Math.ceil(from / 0.75) * 0.75; a <= to; a += 0.75) box(2.1, 0.28, c, a, y, 0.1, SLEEPER);
    }
    for (const r of [-GAUGE, GAUGE]) box(0.12, len, c + r, mid, flush ? Y_ROAD + 0.02 : y + 0.1, 0.14, STEEL);
  }
}

/**
 * Double-track railway for one cell, merged into one mesh. Straight cells are tracks with
 * sleepers and rails, bends are true arcs about the cell corner (matching the path trains
 * follow), junctions run a track out along every arm.
 */
export function railGeometry(mask: number, opts: RailOptions = {}): THREE.BufferGeometry {
  const key = `${mask}|${!!opts.flush}|${!!opts.platform}|${!!opts.bridge}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const parts: Part[] = [];
  const flush = !!opts.flush;
  const arms = ARMS.filter(([bit]) => mask & bit);
  const count = arms.length;
  const straightNS = count <= 2 && !(mask & (E | W)) && (mask & (N | S)) !== 0;
  const straightEW = count <= 2 && !(mask & (N | S)) && (mask & (E | W)) !== 0;
  const corner = count === 2 && !straightNS && !straightEW;
  const alongX = straightEW;
  const half = CELL / 2;

  if (corner) {
    const c = cornerOf(mask);
    if (!flush) parts.push(sector(c.px, c.pz, 0.05, CELL / 2 + BED_HALF, c.phi0, c.phi1, 0, Y_BED, BALLAST));
    const sweep = c.phi1 - c.phi0;
    for (const side of [-1, 1]) {
      const r = CELL / 2 + side * TRACK_OFFSET;
      for (const g of [-GAUGE, GAUGE]) {
        parts.push(sector(c.px, c.pz, r + g - 0.06, r + g + 0.06, c.phi0, c.phi1, flush ? Y_ROAD + 0.02 : Y_BED + 0.1, 0.14, STEEL));
      }
      if (!flush) {
        const steps = 9;
        for (let i = 0; i < steps; i++) {
          const phi = c.phi0 + ((i + 0.5) / steps) * sweep;
          parts.push(
            slab(2.1, 0.28, c.px + r * Math.cos(phi), c.pz + r * Math.sin(phi), Y_BED, 0.1, SLEEPER, -phi),
          );
        }
      }
    }
  } else if (count >= 3 || count === 0) {
    // Junction (or a lone cell): a track out along every arm, over a square bed.
    if (!flush) parts.push(slab(BED_HALF * 2, BED_HALF * 2, 0, 0, 0, Y_BED, BALLAST));
    const list = count === 0 ? [ARMS[0], ARMS[2]] : arms;
    for (const [, dx, dz] of list) {
      const sign = dx !== 0 ? dx : dz;
      straight(dx !== 0, sign > 0 ? 0 : -half, sign > 0 ? half : 0, Y_BED, flush, parts);
    }
  } else {
    straight(alongX, -half, half, Y_BED, flush, parts);
  }

  if (opts.platform) {
    const length = CELL - 0.4;
    parts.push(alongX ? slab(length, 1.9, 0, 0, 0, 0.38, PLATFORM) : slab(1.9, length, 0, 0, 0, 0.38, PLATFORM));
    for (const side of [-1, 1]) {
      parts.push(alongX ? slab(length, 0.12, 0, side * 0.9, 0.38, 0.02, PLATFORM_EDGE) : slab(0.12, length, side * 0.9, 0, 0.38, 0.02, PLATFORM_EDGE));
    }
    // Shelter: a flat roof on four posts, with a bench.
    parts.push(alongX ? slab(4, 1.6, 0, 0, 2.9, 0.14, ROOF) : slab(1.6, 4, 0, 0, 2.9, 0.14, ROOF));
    for (const a of [-1.8, 1.8]) {
      for (const s of [-0.65, 0.65]) parts.push(alongX ? slab(0.1, 0.1, a, s, 0.38, 2.52, ROOF) : slab(0.1, 0.1, s, a, 0.38, 2.52, ROOF));
    }
    parts.push(alongX ? slab(1.8, 0.4, 0, 0, 0.38, 0.45, '#8a5a2b') : slab(0.4, 1.8, 0, 0, 0.38, 0.45, '#8a5a2b'));
  }

  if (opts.bridge) {
    parts.push(slab(CELL, CELL, 0, 0, -0.8, 0.8, CONCRETE));
    const pier = new THREE.CylinderGeometry(0.6, 0.75, 6, 10);
    pier.translate(0, -3.8, 0);
    parts.push(paint(pier, CONCRETE));
  }

  const geometry = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  cache.set(key, geometry);
  return geometry;
}

const metroCache = new Map<number, THREE.BufferGeometry>();

/** The underground metro line, drawn as glowing dashes on the ground (only shown while building). */
export function metroGeometry(mask: number): THREE.BufferGeometry {
  const hit = metroCache.get(mask);
  if (hit) return hit;
  const parts: Part[] = [slab(1.1, 1.1, 0, 0, 0.1, 0.03, TUNNEL)];
  for (const [bit, dx, dz] of ARMS) {
    if (!(mask & bit)) continue;
    for (const d of [1.2, 2.2]) {
      parts.push(dx === 0 ? slab(0.7, 0.7, 0, dz * d, 0.1, 0.03, TUNNEL) : slab(0.7, 0.7, dx * d, 0, 0.1, 0.03, TUNNEL));
    }
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  metroCache.set(mask, geometry);
  return geometry;
}
