import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL } from './catalog';
import { paint, slab, type Part } from './roadGeometry';

const RUNWAY = '#2a2c30';
const APRON = '#8e9094';
const WHITE = '#ececec';
const YELLOW = '#e8c547';
const JOINT = '#6f7176';
const Y = 0.08;
const PAINT = 0.012;

const N = 1;
const E = 2;
const S = 4;
const W = 8;

const cache = new Map<string, THREE.BufferGeometry>();

function merge(key: string, parts: Part[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  cache.set(key, geometry);
  return geometry;
}

/**
 * One runway cell (6 m wide). Edge lines and a dashed centre line run along it; a cell with no
 * neighbour at an end gets threshold bars there, so a laid strip reads as a proper runway.
 * Dash positions repeat every 3 m so they join across cells.
 */
export function runwayGeometry(mask: number): THREE.BufferGeometry {
  const key = `runway|${mask}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const parts: Part[] = [slab(CELL, CELL, 0, 0, 0, Y, RUNWAY)];
  const alongZ = !!(mask & (N | S)) || !(mask & (E | W));
  const along = (across: number, a: number, w: number, len: number, colour: string) =>
    parts.push(alongZ ? slab(w, len, across, a, Y, PAINT, colour) : slab(len, w, a, across, Y, PAINT, colour));

  for (const side of [-1, 1]) along(side * 2.75, 0, 0.15, CELL, WHITE);
  for (const a of [-1.5, 1.5]) along(0, a, 0.25, 1.6, WHITE);

  const ends: [number, number][] = alongZ ? [[mask & N ? 0 : 1, -1], [mask & S ? 0 : 1, 1]] : [[mask & W ? 0 : 1, -1], [mask & E ? 0 : 1, 1]];
  for (const [open, sign] of ends) {
    if (!open) continue;
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      along(i * 0.7, sign * 1.6, 0.35, 2.6, WHITE);
    }
  }
  return merge(key, parts);
}

/** Concrete stand: joints around it and a yellow stand box with a lead-in line towards the first connected side. */
export function apronGeometry(mask: number): THREE.BufferGeometry {
  const key = `apron|${mask}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const parts: Part[] = [slab(CELL, CELL, 0, 0, 0, Y, APRON)];
  for (const side of [-1, 1]) {
    parts.push(slab(CELL, 0.06, 0, side * (CELL / 2 - 0.03), Y, PAINT, JOINT));
    parts.push(slab(0.06, CELL, side * (CELL / 2 - 0.03), 0, Y, PAINT, JOINT));
  }
  // Stand box.
  const box = 4;
  for (const side of [-1, 1]) {
    parts.push(slab(box, 0.12, 0, side * (box / 2), Y, PAINT, YELLOW));
    parts.push(slab(0.12, box, side * (box / 2), 0, Y, PAINT, YELLOW));
  }
  // Lead-in line from the side a taxiway arrives on.
  const arm = mask & N ? [0, -1] : mask & E ? [1, 0] : mask & S ? [0, 1] : mask & W ? [-1, 0] : [0, 1];
  const len = CELL / 2 - 0.1;
  parts.push(arm[0] === 0 ? slab(0.14, len, 0, arm[1] * (len / 2 + 0.1), Y, PAINT, YELLOW) : slab(len, 0.14, arm[0] * (len / 2 + 0.1), 0, Y, PAINT, YELLOW));
  return merge(key, parts);
}

// --- Services and port ------------------------------------------------------------------------

/** A 12 m x 12 m car park: asphalt with a white bay line between every pair of cars in both rows. */
export function parkingGeometry(): THREE.BufferGeometry {
  const hit = cache.get('parking');
  if (hit) return hit;
  const parts: Part[] = [slab(CELL * 2 - 0.4, CELL * 2 - 0.4, 0, 0, 0, Y, '#4b4e55')];
  for (const row of [-4, 4]) {
    for (const x of [-6, -3, 0, 3, 6]) parts.push(slab(0.12, 4, Math.max(-5.7, Math.min(5.7, x)), row, Y, PAINT, WHITE));
  }
  for (const side of [-1, 1]) parts.push(slab(11.4, 0.1, 0, side * 2, Y, PAINT, YELLOW));
  return merge('parking', parts);
}

/** A timber pier deck: a square at the cell centre with a strip out to each connected side, on piles. */
export function pierGeometry(mask: number): THREE.BufferGeometry {
  const key = `pier|${mask}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const DECK = '#8b6b46';
  const RIM = '#6b4f33';
  const parts: Part[] = [slab(3.6, 3.6, 0, 0, 0.2, 0.26, DECK)];
  const arms: [number, number, number][] = [[N, 0, -1], [E, 1, 0], [S, 0, 1], [W, -1, 0]];
  for (const [bit, dx, dz] of arms) {
    if (!(mask & bit)) continue;
    parts.push(dx === 0 ? slab(3.6, 1.5, 0, dz * 2.25, 0.2, 0.26, DECK) : slab(1.5, 3.6, dx * 2.25, 0, 0.2, 0.26, DECK));
  }
  // Edge boards and bollards on the sides that have no neighbour.
  for (const [bit, dx, dz] of arms) {
    if (mask & bit) continue;
    parts.push(dx === 0 ? slab(3.6, 0.12, 0, dz * 1.74, 0.46, 0.14, RIM) : slab(0.12, 3.6, dx * 1.74, 0, 0.46, 0.14, RIM));
    const bollard = new THREE.CylinderGeometry(0.14, 0.18, 0.45, 8);
    bollard.translate(dx * 1.5 + (dx === 0 ? 1.0 : 0), 0.7, dz * 1.5 + (dz === 0 ? 1.0 : 0));
    parts.push(paint(bollard, '#2c3036'));
  }
  for (const px of [-1.5, 1.5]) {
    for (const pz of [-1.5, 1.5]) {
      const pile = new THREE.CylinderGeometry(0.2, 0.24, 6.5, 8);
      pile.translate(px, -2.8, pz);
      parts.push(paint(pile, '#4a3a2a'));
    }
  }
  return merge(key, parts);
}
