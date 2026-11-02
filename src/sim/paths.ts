import { CELL } from '../city/catalog';
import { cellCentre } from './world';

/** A drivable curve through one road cell, from the midpoint of the entry edge to the exit edge. */
export interface CellPath {
  x: number[];
  z: number[];
  /** Cumulative distance along the path at each point. */
  cum: number[];
  length: number;
}

const HALF = CELL / 2;
const RING_RADIUS = 2.3;
const cache = new Map<string, CellPath>();

type Cell = [number, number];
const dirOf = (a: Cell, b: Cell): [number, number] => [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Builds the line a vehicle follows through `cell` when arriving from `prev` and leaving
 * towards `next`, with its lane offset sliding from `offIn` to `offOut` (metres to the right
 * of the road's centre line). Straight cells are lines, 90-degree turns are true arcs about
 * the cell corner, dead ends are U-turns and roundabouts are a loop around the island.
 */
export function cellPath(prev: Cell | null, cell: Cell, next: Cell | null, offIn: number, offOut: number, roundabout: boolean): CellPath {
  const key = `${prev?.join(',')}|${cell.join(',')}|${next?.join(',')}|${offIn.toFixed(2)}|${offOut.toFixed(2)}|${roundabout}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const cx = cellCentre(cell[0]);
  const cz = cellCentre(cell[1]);
  const din = prev ? dirOf(prev, cell) : next ? dirOf(cell, next) : ([0, -1] as [number, number]);
  const dout = next ? dirOf(cell, next) : din;
  const ex = cx - din[0] * HALF;
  const ez = cz - din[1] * HALF;
  const xx = cx + dout[0] * HALF;
  const xz = cz + dout[1] * HALF;

  const cl: [number, number][] = []; // centre line
  let scale = 1;
  let baked = false; // points already include their lateral offset

  const turnsBack = din[0] === -dout[0] && din[1] === -dout[1];
  if (roundabout) {
    // Counter-clockwise on screen: the angle (x = cos, z = sin) decreases.
    const a0 = Math.atan2(ez - cz, ex - cx);
    const a1 = Math.atan2(xz - cz, xx - cx);
    let sweep = (((a0 - a1) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (sweep < 0.3) sweep = Math.PI * 2;
    cl.push([ex, ez]);
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const a = a0 - (sweep * i) / steps;
      cl.push([cx + RING_RADIUS * Math.cos(a), cz + RING_RADIUS * Math.sin(a)]);
    }
    cl.push([xx, xz]);
    scale = 0.3; // stay in the ring rather than sliding across the island
  } else if (turnsBack) {
    // Dead end: slide in towards the middle, swing round in a half circle, and head back out
    // in the other lane. The circle is kept small so even a wide road's cars stay on the cell.
    const right: [number, number] = [-din[1], din[0]];
    const radius = Math.min(2.1, Math.max(1, (offIn + offOut) / 2));
    const mx = cx - din[0] * 0.4;
    const mz = cz - din[1] * 0.4;
    cl.push([ex + right[0] * offIn, ez + right[1] * offIn]);
    for (let i = 0; i <= 10; i++) {
      const t = (Math.PI * i) / 10;
      cl.push([
        mx + right[0] * radius * Math.cos(t) + din[0] * radius * Math.sin(t),
        mz + right[1] * radius * Math.cos(t) + din[1] * radius * Math.sin(t),
      ]);
    }
    cl.push([ex - right[0] * offOut, ez - right[1] * offOut]);
    baked = true;
  } else if (din[0] === dout[0] && din[1] === dout[1]) {
    cl.push([ex, ez], [lerp(ex, xx, 0.5), lerp(ez, xz, 0.5)], [xx, xz]);
  } else {
    // 90-degree turn: an arc around the corner shared by the entry and exit edges.
    const px = cx + (-din[0] + dout[0]) * HALF;
    const pz = cz + (-din[1] + dout[1]) * HALF;
    const a0 = Math.atan2(ez - pz, ex - px);
    let da = Math.atan2(xz - pz, xx - px) - a0;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (da * i) / steps;
      cl.push([px + HALF * Math.cos(a), pz + HALF * Math.sin(a)]);
    }
  }

  const n = cl.length;
  const x: number[] = [];
  const z: number[] = [];
  for (let i = 0; i < n; i++) {
    if (baked) {
      x.push(cl[i][0]);
      z.push(cl[i][1]);
      continue;
    }
    const a = cl[Math.max(0, i - 1)];
    const b = cl[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0];
    const tz = b[1] - a[1];
    const len = Math.hypot(tx, tz) || 1;
    const off = lerp(offIn, offOut, i / (n - 1)) * scale;
    x.push(cl[i][0] + (-tz / len) * off);
    z.push(cl[i][1] + (tx / len) * off);
  }
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]));
  const path = { x, z, cum, length: cum[n - 1] || 1 };
  cache.set(key, path);
  return path;
}

/** Position and heading (forward = (sin, cos)) a fraction `u` (0..1) of the way along a path. */
export function samplePath(path: CellPath, u: number): { x: number; z: number; heading: number } {
  const target = Math.min(1, Math.max(0, u)) * path.length;
  let i = 1;
  while (i < path.cum.length - 1 && path.cum[i] < target) i++;
  const seg = path.cum[i] - path.cum[i - 1] || 1;
  const f = (target - path.cum[i - 1]) / seg;
  const dx = path.x[i] - path.x[i - 1];
  const dz = path.z[i] - path.z[i - 1];
  return {
    x: path.x[i - 1] + dx * f,
    z: path.z[i - 1] + dz * f,
    heading: Math.atan2(dx, dz),
  };
}
