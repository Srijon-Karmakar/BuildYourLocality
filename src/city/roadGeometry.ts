import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, resolveRoad, roadLayout, type RoadSpec, type RoadSurface } from './catalog';

// --- Palette and heights -----------------------------------------------------------

const SURFACE: Record<RoadSurface, string> = {
  asphalt: '#3c3f44',
  concrete: '#8c8f93',
  cobble: '#6e6a63',
  dirt: '#7a5b3a',
};
const PAVEMENT = '#bdb9b0';
const PAVEMENT_WIDE = '#cfcac0';
const MEDIAN_CURB = '#a9a69e';
const MEDIAN_GRASS = '#5f8a45';
const YELLOW = '#e8c547';
const WHITE = '#ececec';
const BIKE = '#3f8f5a';
const BUS = '#a8433a';

const Y_ROAD = 0.08;
const Y_PAV = 0.16;
const Y_MEDIAN = 0.2;
const Y_PAINT = 0.012;

export type Part = THREE.BufferGeometry;

export function paint(geometry: Part, colour: string): Part {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  const count = g.getAttribute('position').count;
  const c = new THREE.Color(colour);
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) c.toArray(colours, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}

/** Axis-aligned slab with its underside at `y`, centred on (x, z). */
export function slab(w: number, d: number, x: number, z: number, y: number, h: number, colour: string, turn = 0): Part {
  const g = new THREE.BoxGeometry(w, h, d);
  if (turn) g.rotateY(turn);
  g.translate(x, y + h / 2, z);
  return paint(g, colour);
}

/** Flat ring sector around (px, pz) between two radii and two angles (x = cos, z = sin). */
export function sector(px: number, pz: number, inner: number, outer: number, phi0: number, phi1: number, y: number, h: number, colour: string): Part {
  const shape = new THREE.Shape();
  const a0 = -phi1;
  const a1 = -phi0;
  shape.moveTo(outer * Math.cos(a0), outer * Math.sin(a0));
  shape.absarc(0, 0, outer, a0, a1, false);
  if (inner > 0.01) {
    shape.lineTo(inner * Math.cos(a1), inner * Math.sin(a1));
    shape.absarc(0, 0, inner, a1, a0, true);
  } else {
    shape.lineTo(0, 0);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 14 });
  g.rotateX(-Math.PI / 2);
  g.translate(px, y, pz);
  return paint(g, colour);
}

function disc(x: number, z: number, radius: number, y: number, h: number, colour: string): Part {
  const g = new THREE.CylinderGeometry(radius, radius, h, 28);
  g.translate(x, y + h / 2, z);
  return paint(g, colour);
}

function streetTree(x: number, z: number): Part[] {
  const trunk = new THREE.CylinderGeometry(0.1, 0.14, 1.5, 6);
  trunk.translate(x, Y_PAV + 0.75, z);
  const crown = new THREE.IcosahedronGeometry(0.95, 0);
  crown.translate(x, Y_PAV + 2.1, z);
  return [paint(trunk, '#5b3a1e'), paint(crown, '#4c9a40')];
}

// --- Cell shape --------------------------------------------------------------------

const N = 1;
const E = 2;
const S = 4;
const W = 8;
const ARM_VECTORS: [number, number, number][] = [
  [N, 0, -1],
  [E, 1, 0],
  [S, 0, 1],
  [W, -1, 0],
];

/** For a corner, the cell corner it bends around and the angles (x = cos, z = sin) the road sweeps. */
function cornerOf(mask: number): { px: number; pz: number; phi0: number; phi1: number } {
  const h = CELL / 2;
  if (mask === (N | E)) return { px: h, pz: -h, phi0: Math.PI / 2, phi1: Math.PI };
  if (mask === (E | S)) return { px: h, pz: h, phi0: Math.PI, phi1: (3 * Math.PI) / 2 };
  if (mask === (S | W)) return { px: -h, pz: h, phi0: -Math.PI / 2, phi1: 0 };
  return { px: -h, pz: -h, phi0: 0, phi1: Math.PI / 2 }; // W | N
}

interface Line {
  off: number;
  kind: 'solid' | 'dashed';
  colour: string;
  width: number;
}

/** Lane markings across the road (signed offsets from the centre line). */
function markingLines(spec: RoadSpec, laneWidth: number, median: number, perDir: number): Line[] {
  if (spec.surface === 'dirt' || spec.surface === 'cobble') return [];
  const lines: Line[] = [];
  const lanes = Math.min(6, Math.max(1, Math.round(spec.lanes)));
  const solid = (off: number, colour: string, width = 0.14): Line => ({ off, kind: 'solid', colour, width });
  const dashed = (off: number, colour: string): Line => ({ off, kind: 'dashed', colour, width: 0.14 });

  if (spec.oneWay !== null) {
    for (let i = 1; i < lanes; i++) lines.push(dashed((i - lanes / 2) * laneWidth, WHITE));
    if (lanes >= 3) lines.push(solid(-(lanes * laneWidth) / 2, WHITE), solid((lanes * laneWidth) / 2, WHITE));
    return lines;
  }
  if (lanes === 1) return lines;
  const odd = lanes > 2 && lanes % 2 === 1;
  const start = median / 2 + (odd ? laneWidth / 2 : 0);
  if (!median) {
    if (odd) lines.push(dashed(-laneWidth / 2, YELLOW), dashed(laneWidth / 2, YELLOW));
    else lines.push(solid(-0.12, YELLOW), solid(0.12, YELLOW));
  }
  for (let i = 1; i < perDir; i++) lines.push(dashed(start + i * laneWidth, WHITE), dashed(-(start + i * laneWidth), WHITE));
  if (lanes >= 3) {
    const edge = start + perDir * laneWidth;
    lines.push(solid(edge, WHITE), solid(-edge, WHITE));
  }
  return lines;
}

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * One road cell as a single merged mesh (one draw call), cached per connection mask and spec.
 * Mask bits: N (-z) = 1, E (+x) = 2, S (+z) = 4, W (-x) = 8. Straight cells are strips, bends
 * are true arcs about the cell corner, junctions are squares (optionally a roundabout).
 * Everything a lane, marking, pavement or tree needs is laid out from `roadLayout` so cars
 * driving the same layout line up with the paint.
 */
export function roadGeometry(mask: number, specIn?: Partial<RoadSpec>, bridge = false): THREE.BufferGeometry {
  const spec = resolveRoad(specIn);
  const key = `${mask}|${JSON.stringify(spec)}|${bridge}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const layout = roadLayout(spec);
  const half = layout.width / 2;
  const pav = layout.pavement;
  const surface = SURFACE[spec.surface];
  const pavColour = spec.pavement === 'wide' ? PAVEMENT_WIDE : PAVEMENT;
  const parts: Part[] = [];

  const arms = ARM_VECTORS.filter(([bit]) => mask & bit);
  const count = arms.length;
  const straightNS = count >= 1 && count <= 2 && !(mask & (E | W)) && (mask & (N | S)) !== 0;
  const straightEW = count >= 1 && count <= 2 && !(mask & (N | S)) && (mask & (E | W)) !== 0;
  const straight = straightNS || straightEW;
  const corner = count === 2 && !straight;
  const junction = count >= 3;
  const alongX = straightEW;
  const lines = markingLines(spec, layout.laneWidth, layout.median, layout.perDir);

  /** A strip across the cell along the road axis, offset sideways by `off`. */
  const strip = (off: number, width: number, y: number, h: number, colour: string): Part =>
    alongX ? slab(CELL, width, 0, off, y, h, colour) : slab(width, CELL, off, 0, y, h, colour);

  /** A band at offset `off` from the road's centre line, following the bend for corners. */
  const arcBand = (off: number, width: number, y: number, h: number, colour: string): Part => {
    const c = cornerOf(mask);
    const r0 = CELL / 2 + off;
    return sector(c.px, c.pz, Math.max(0, r0 - width / 2), r0 + width / 2, c.phi0, c.phi1, y, h, colour);
  };

  // --- Carriageway ---
  if (corner) {
    const c = cornerOf(mask);
    parts.push(sector(c.px, c.pz, Math.max(0, CELL / 2 - half), CELL / 2 + half, c.phi0, c.phi1, 0, Y_ROAD, surface));
  } else if (junction || count === 0) {
    const size = Math.max(layout.width, CELL);
    parts.push(slab(size, size, 0, 0, 0, Y_ROAD, surface));
  } else {
    parts.push(strip(0, layout.width, 0, Y_ROAD, surface));
  }

  // --- Pavements ---
  if (pav > 0.05) {
    if (straight) {
      for (const side of [-1, 1]) parts.push(strip(side * (half - pav / 2), pav, 0, Y_PAV, pavColour));
    } else if (corner) {
      const c = cornerOf(mask);
      parts.push(sector(c.px, c.pz, CELL / 2 + half - pav, CELL / 2 + half, c.phi0, c.phi1, 0, Y_PAV, pavColour));
      if (CELL / 2 - half > 0) parts.push(sector(c.px, c.pz, CELL / 2 - half, CELL / 2 - half + pav, c.phi0, c.phi1, 0, Y_PAV, pavColour));
    } else {
      // Junctions and ends: a pavement cap across every edge that has no road.
      const size = Math.max(layout.width, CELL);
      for (const [bit, dx, dz] of ARM_VECTORS) {
        if (mask & bit) continue;
        const d = size / 2 - pav / 2;
        parts.push(dx === 0 ? slab(size, pav, 0, dz * d, 0, Y_PAV, pavColour) : slab(pav, size, dx * d, 0, 0, Y_PAV, pavColour));
      }
    }
  }

  // --- Median ---
  if (layout.median > 0 && (straight || corner)) {
    if (straight) {
      parts.push(strip(0, layout.median, 0, Y_MEDIAN, MEDIAN_CURB), strip(0, layout.median - 0.4, Y_MEDIAN, 0.03, MEDIAN_GRASS));
    } else {
      parts.push(arcBand(0, layout.median, 0, Y_MEDIAN, MEDIAN_CURB), arcBand(0, layout.median - 0.4, Y_MEDIAN, 0.03, MEDIAN_GRASS));
    }
  }

  // --- Bike and bus lanes (painted over the outer lane) ---
  if ((straight || corner) && spec.surface !== 'dirt') {
    const start = layout.median / 2 + (spec.oneWay === null && spec.lanes > 2 && spec.lanes % 2 === 1 ? layout.laneWidth / 2 : 0);
    const outerEdge = spec.oneWay !== null ? (Math.min(6, spec.lanes) * layout.laneWidth) / 2 : start + layout.perDir * layout.laneWidth;
    for (const side of [-1, 1]) {
      if (spec.bikeLanes) {
        const off = side * (outerEdge - 0.6);
        parts.push(straight ? strip(off, 1.1, Y_ROAD, Y_PAINT, BIKE) : arcBand(off, 1.1, Y_ROAD, Y_PAINT, BIKE));
      }
      if (spec.busLanes) {
        const off = side * (outerEdge - layout.laneWidth / 2 - (spec.bikeLanes ? 0.6 : 0));
        parts.push(straight ? strip(off, layout.laneWidth - 0.2, Y_ROAD, Y_PAINT, BUS) : arcBand(off, layout.laneWidth - 0.2, Y_ROAD, Y_PAINT, BUS));
      }
    }
  }

  // --- Lane markings ---
  if (straight || corner) {
    for (const line of lines) {
      if (straight) {
        if (line.kind === 'solid') {
          parts.push(strip(line.off, line.width, Y_ROAD, Y_PAINT, line.colour));
        } else {
          // Dashes repeat every 1.5 m from the cell centre so they join up across cells.
          for (const along of [-2.25, -0.75, 0.75, 2.25]) {
            parts.push(
              alongX
                ? slab(0.8, line.width, along, line.off, Y_ROAD, Y_PAINT, line.colour)
                : slab(line.width, 0.8, line.off, along, Y_ROAD, Y_PAINT, line.colour),
            );
          }
        }
      } else {
        const c = cornerOf(mask);
        const radius = CELL / 2 + line.off;
        if (radius < 0.4) continue;
        const steps = line.kind === 'solid' ? 8 : 10;
        const sweep = c.phi1 - c.phi0;
        for (let i = 0; i < steps; i++) {
          if (line.kind === 'dashed' && i % 2 === 1) continue;
          const phi = c.phi0 + ((i + 0.5) / steps) * sweep;
          const chord = ((sweep * radius) / steps) * (line.kind === 'solid' ? 1.05 : 0.8);
          const tx = -Math.sin(phi);
          const tz = Math.cos(phi);
          parts.push(
            slab(line.width, chord, c.px + radius * Math.cos(phi), c.pz + radius * Math.sin(phi), Y_ROAD, Y_PAINT, line.colour, Math.atan2(tx, tz)),
          );
        }
      }
    }
  }

  // --- Crosswalks at junction arms and road ends ---
  if (spec.crosswalk && spec.surface !== 'dirt' && (junction || count === 1)) {
    const span = layout.width - 2 * pav;
    const bars = Math.max(3, Math.floor(span / 1.0));
    for (const [, dx, dz] of arms) {
      const reach = CELL / 2 - 0.9; // just inside the cell edge
      for (let i = 0; i < bars; i++) {
        const across = -span / 2 + (i + 0.5) * (span / bars);
        parts.push(
          dx === 0
            ? slab(0.55, 1.9, across, dz * reach, Y_ROAD, Y_PAINT, WHITE)
            : slab(1.9, 0.55, dx * reach, across, Y_ROAD, Y_PAINT, WHITE),
        );
      }
    }
  }

  // --- Mid-block zebra crossing (straight cells) ---
  if (spec.zebra && straight && spec.surface !== 'dirt') {
    const span = layout.width - 2 * pav;
    const bars = Math.max(4, Math.floor(span / 0.95));
    for (let i = 0; i < bars; i++) {
      const across = -span / 2 + (i + 0.5) * (span / bars);
      parts.push(alongX ? slab(3.4, 0.5, 0, across, Y_ROAD, Y_PAINT, WHITE) : slab(0.5, 3.4, across, 0, Y_ROAD, Y_PAINT, WHITE));
    }
    // Stop lines a car-length either side.
    for (const side of [-1, 1]) {
      parts.push(alongX ? slab(0.3, span, side * 2.45, 0, Y_ROAD, Y_PAINT, WHITE) : slab(span, 0.3, 0, side * 2.45, Y_ROAD, Y_PAINT, WHITE));
    }
  }

  // --- Bridge: a deck beneath the carriageway, parapets along the sides, and a pier ---
  if (bridge) {
    const deck = Math.max(layout.width, CELL);
    const CONCRETE = '#8a8c90';
    parts.push(slab(deck, deck, 0, 0, -0.8, 0.8, CONCRETE));
    if (straight) {
      for (const side of [-1, 1]) {
        const off = side * (deck / 2 - 0.12);
        parts.push(alongX ? slab(CELL, 0.24, 0, off, Y_PAV, 0.9, CONCRETE) : slab(0.24, CELL, off, 0, Y_PAV, 0.9, CONCRETE));
      }
    }
    const pier = new THREE.CylinderGeometry(0.55, 0.7, 6, 10);
    pier.translate(0, -0.8 - 3, 0);
    parts.push(paint(pier, CONCRETE));
  }

  // --- Roundabout island ---
  if (junction && spec.roundabout) {
    parts.push(disc(0, 0, 1.45, Y_ROAD, 0.2, MEDIAN_CURB), disc(0, 0, 1.15, Y_ROAD + 0.2, 0.04, MEDIAN_GRASS), ...streetTree(0, 0).map((g) => g.translate(0, -Y_PAV + Y_ROAD + 0.24, 0)));
  }

  // --- Street trees ---
  if (spec.trees && straight && pav >= 1.2) {
    for (const side of [-1, 1]) {
      const off = side * (half - pav / 2);
      parts.push(...(alongX ? streetTree(0, off) : streetTree(off, 0)));
    }
  }

  const geometry = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  cache.set(key, geometry);
  return geometry;
}
