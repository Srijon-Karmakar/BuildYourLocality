import { CELL } from './catalog';
import { hasTerrain, heightAt } from '../terrain/terrain';

/**
 * Bridges, overpasses, viaducts, footbridges and flyover ramps. A span is one piece that does not
 * take up grid cells: it follows a path of waypoints (metres from the centre of its anchor cell),
 * climbs from the ground on a ramp, runs level at its deck height, and comes back down. Cars and
 * the walking player ride on it; whatever is underneath stays where it is.
 */

export type SpanKind = 'road' | 'rail' | 'foot';
export type SpanStructure = 'beam' | 'arch' | 'truss' | 'suspension' | 'cable';
export type SpanSupport = 'none' | 'pillars' | 'piers' | 'arches';
export type SpanRailing = 'none' | 'parapet' | 'rail' | 'glass';

export interface SpanSpec {
  kind: SpanKind;
  /** What carries the deck: nothing special (beam), an arch, a truss, suspension cables or cable stays. */
  structure: SpanStructure;
  /** What holds the deck up from below. */
  support: SpanSupport;
  railing: SpanRailing;
  /** Waypoints in metres from the anchor cell's centre: [x, z]. The first is always [0, 0]. */
  pts: [number, number][];
  /** True: bends are smooth curves. False: sharp corners between straight pieces. */
  smooth: boolean;
  /** Deck height above the highest ground it crosses, in metres. */
  height: number;
  /** Ramp length at each end in metres; 0 works it out from the height. */
  ramp: number;
  /** False: that end stays up at deck height (to join another span) instead of coming down. */
  rampA: boolean;
  rampB: boolean;
  /** Road lanes (1 - 6) or railway tracks (1 - 3). */
  lanes: number;
  /** Footbridge width in metres. */
  width: number;
  /** How deep the deck slab is. */
  thickness: number;
  /** Height of the arch, truss or tower above the deck, in metres. */
  frameH: number;
  /** Metres between supports. */
  spacing: number;
  /** Thickness of a pillar or pier in metres. */
  pillar: number;
  lights: boolean;
  /** Colours: the deck's sides, the road or walkway top, the frame (arch, truss, towers, cables), and the supports. */
  deck: string;
  surface: string;
  frame: string;
  support_colour: string;
}

export const DEFAULT_SPAN: SpanSpec = {
  kind: 'road',
  structure: 'beam',
  support: 'pillars',
  railing: 'parapet',
  pts: [
    [0, 0],
    [CELL * 4, 0],
  ],
  smooth: true,
  height: 8,
  ramp: 0,
  rampA: true,
  rampB: true,
  lanes: 2,
  width: 4,
  thickness: 1.4,
  frameH: 14,
  spacing: 24,
  pillar: 2,
  lights: true,
  deck: '#9a9a96',
  surface: '#3c3f44',
  frame: '#c8c8c4',
  support_colour: '#8e8e8a',
};

export interface SpanPreset {
  id: string;
  label: string;
  icon: string;
  /** What this preset changes from the defaults. */
  spec: Partial<SpanSpec>;
  /** A ready-made path (metres, first point at 0,0) placed in one click, for loops and ramps. Missing: you draw the path. */
  template?: [number, number][];
}

/** Points round a loop ramp: 270 degrees about a point 18 m to the side, like the loop of a cloverleaf. */
function loopPath(): [number, number][] {
  const r = 18;
  const pts: [number, number][] = [[0, 0]];
  for (let k = 0; k <= 6; k++) {
    const a = (-90 + k * 45) * (Math.PI / 180);
    pts.push([Math.round((r + r * Math.cos(a)) * 10) / 10 + 12, Math.round((r + r * Math.sin(a)) * 10) / 10]);
  }
  return pts;
}

export const SPAN_PRESETS: SpanPreset[] = [
  { id: 'overpass', label: 'Overpass', icon: 'span-road', spec: { structure: 'beam', support: 'pillars', height: 7, lanes: 2 } },
  { id: 'bridge', label: 'River bridge', icon: 'span-road', spec: { structure: 'beam', support: 'piers', height: 6, lanes: 2, spacing: 30 } },
  { id: 'viaduct', label: 'Stone viaduct', icon: 'span-arches', spec: { structure: 'beam', support: 'arches', height: 14, lanes: 2, spacing: 18, deck: '#b7aa94', support_colour: '#b7aa94', railing: 'parapet', thickness: 1.2 } },
  { id: 'arch', label: 'Arch bridge', icon: 'span-arch', spec: { structure: 'arch', support: 'piers', height: 8, lanes: 2, frameH: 16, spacing: 40, frame: '#d9564a' } },
  { id: 'truss', label: 'Truss bridge', icon: 'span-truss', spec: { structure: 'truss', support: 'piers', height: 8, lanes: 2, frameH: 7, spacing: 40, frame: '#5b7fa6', railing: 'none', thickness: 1.0 } },
  { id: 'suspension', label: 'Suspension bridge', icon: 'span-suspension', spec: { structure: 'suspension', support: 'none', height: 18, lanes: 3, frameH: 36, frame: '#c0392b', thickness: 1.8, ramp: 70, railing: 'rail' } },
  { id: 'cable', label: 'Cable-stayed bridge', icon: 'span-cable', spec: { structure: 'cable', support: 'none', height: 16, lanes: 3, frameH: 32, frame: '#e8e6e0', thickness: 1.6, ramp: 70, railing: 'rail' } },
  { id: 'rail', label: 'Rail viaduct', icon: 'span-rail', spec: { kind: 'rail', structure: 'beam', support: 'arches', height: 10, lanes: 2, spacing: 18, railing: 'parapet', deck: '#a49c8c', support_colour: '#a49c8c' } },
  { id: 'railbridge', label: 'Rail bridge', icon: 'span-rail', spec: { kind: 'rail', structure: 'truss', support: 'piers', height: 8, lanes: 2, frameH: 7, spacing: 40, frame: '#4d5862', railing: 'none' } },
  { id: 'foot', label: 'Footbridge', icon: 'span-foot', spec: { kind: 'foot', structure: 'beam', support: 'pillars', height: 6, width: 3.4, railing: 'rail', thickness: 0.7, spacing: 18, pillar: 0.9, ramp: 0, lights: true } },
  { id: 'footarch', label: 'Arched footbridge', icon: 'span-foot', spec: { kind: 'foot', structure: 'arch', support: 'none', height: 4, width: 3.2, railing: 'glass', thickness: 0.6, frameH: 6, frame: '#2b2f35', ramp: 16 } },
  { id: 'loop', label: 'Loop ramp', icon: 'span-loop', spec: { structure: 'beam', support: 'pillars', height: 7, lanes: 1, ramp: 90, rampB: false, spacing: 16, railing: 'parapet' }, template: loopPath() },
  { id: 'slip', label: 'Slip ramp', icon: 'span-slip', spec: { structure: 'beam', support: 'pillars', height: 7, lanes: 1, ramp: 70, rampB: false, spacing: 16, railing: 'parapet' }, template: [[0, 0], [24, 0], [48, 6], [70, 24], [76, 48]] },
];

export const SPAN_KINDS: { id: SpanKind; label: string }[] = [
  { id: 'road', label: 'Road' },
  { id: 'rail', label: 'Railway' },
  { id: 'foot', label: 'Footbridge' },
];
export const SPAN_STRUCTURES: { id: SpanStructure; label: string }[] = [
  { id: 'beam', label: 'Plain deck' },
  { id: 'arch', label: 'Arch' },
  { id: 'truss', label: 'Truss' },
  { id: 'suspension', label: 'Suspension' },
  { id: 'cable', label: 'Cable-stayed' },
];
export const SPAN_SUPPORTS: { id: SpanSupport; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'pillars', label: 'Pillars' },
  { id: 'piers', label: 'Piers' },
  { id: 'arches', label: 'Arches' },
];
export const SPAN_RAILINGS: { id: SpanRailing; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'parapet', label: 'Solid wall' },
  { id: 'rail', label: 'Railing' },
  { id: 'glass', label: 'Glass' },
];

export const SPAN_COLOURS = ['#9a9a96', '#c8c8c4', '#b7aa94', '#8e8e8a', '#3c3f44', '#2b2f35', '#c0392b', '#d9564a', '#5b7fa6', '#e8e6e0', '#d9b43a', '#3d7a35'];

export const MAX_SPAN_POINTS = 40;
export const MAX_SPAN_LENGTH = 1500;

/** The full settings of a span: the defaults, then whatever was changed. */
export function resolveSpan(spec: Partial<SpanSpec> | undefined): SpanSpec {
  const merged = { ...DEFAULT_SPAN, ...spec };
  if (!merged.pts || merged.pts.length < 2) merged.pts = DEFAULT_SPAN.pts;
  return merged;
}

/** Width of the deck in metres. */
export function spanWidth(spec: SpanSpec): number {
  if (spec.kind === 'road') return spec.lanes * 3.3 + 1.8;
  if (spec.kind === 'rail') return spec.lanes * 4 + 1.6;
  return spec.width;
}

export interface SpanSample {
  /** Metres from the anchor cell's centre. */
  x: number;
  z: number;
  /** Top of the deck. */
  y: number;
  /** Unit direction along the path (flat). */
  tx: number;
  tz: number;
  /** Distance along the path. */
  s: number;
}

export interface SpanPath {
  samples: SpanSample[];
  length: number;
  /** Where the level part of the deck starts and ends along the path, and the deck height it holds. */
  levelFrom: number;
  levelTo: number;
  deckY: number;
}

const STEP = 2;

function curvePoints(pts: [number, number][], smooth: boolean): [number, number][] {
  const out: [number, number][] = [];
  const push = (x: number, z: number) => {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last[0] - x, last[1] - z) > 0.05) out.push([x, z]);
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.ceil(len / STEP));
    if (!smooth || pts.length < 3) {
      for (let k = 0; k < n; k++) push(p1[0] + ((p2[0] - p1[0]) * k) / n, p1[1] + ((p2[1] - p1[1]) * k) / n);
      continue;
    }
    // Catmull-Rom through the waypoints; the end pieces repeat their end point.
    const p0 = pts[Math.max(0, i - 1)];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      push(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]));
    }
  }
  const last = pts[pts.length - 1];
  push(last[0], last[1]);
  return out;
}

const ease = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Ground a deck is measured from: dry land, or the water surface. */
const groundAt = (x: number, z: number) => (hasTerrain() ? Math.max(0, heightAt(x, z)) : 0);

/**
 * The path of a span: sampled every couple of metres with the deck height worked out, so it
 * climbs from the ground on a smooth ramp, stays level, and comes back down.
 */
export function sampleSpan(spec: SpanSpec, anchorX: number, anchorZ: number): SpanPath {
  const flat = curvePoints(spec.pts, spec.smooth);
  const raw: SpanSample[] = [];
  let s = 0;
  for (let i = 0; i < flat.length; i++) {
    if (i > 0) s += Math.hypot(flat[i][0] - flat[i - 1][0], flat[i][1] - flat[i - 1][1]);
    const a = flat[Math.max(0, i - 1)];
    const b = flat[Math.min(flat.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const d = Math.hypot(dx, dz) || 1;
    raw.push({ x: flat[i][0], z: flat[i][1], y: 0, tx: dx / d, tz: dz / d, s });
  }
  const length = s;

  let peak = 0;
  for (const p of raw) peak = Math.max(peak, groundAt(anchorX + p.x, anchorZ + p.z));
  const first = raw[0];
  const last = raw[raw.length - 1];
  const y0 = groundAt(anchorX + first.x, anchorZ + first.z);
  const y1 = groundAt(anchorX + last.x, anchorZ + last.z);
  const deckY = peak + spec.height;
  const rampLen = spec.ramp > 0 ? spec.ramp : spec.height * 6 + 6;
  // Short spans cannot fit two full ramps: shrink them and the climb with them.
  const fit = Math.min(1, length / (rampLen * ((spec.rampA ? 1 : 0) + (spec.rampB ? 1 : 0)) || 1));
  const ra = spec.rampA ? rampLen * fit : 0;
  const rb = spec.rampB ? rampLen * fit : 0;
  const top = deckY - (1 - fit) * (spec.height * 0.9);
  for (const p of raw) {
    if (ra > 0 && p.s < ra) p.y = y0 + (top - y0) * ease(p.s / ra);
    else if (rb > 0 && p.s > length - rb) p.y = y1 + (top - y1) * ease((length - p.s) / rb);
    else p.y = top;
  }
  return { samples: raw, length, levelFrom: ra, levelTo: length - rb, deckY: top };
}

/** Interpolated sample at a distance along the path. */
export function sampleAt(path: SpanPath, s: number): SpanSample {
  const list = path.samples;
  const c = Math.min(path.length, Math.max(0, s));
  let lo = 0;
  let hi = list.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (list[mid].s <= c) lo = mid;
    else hi = mid;
  }
  const a = list[lo];
  const b = list[hi];
  const span = b.s - a.s || 1;
  const t = (c - a.s) / span;
  const tx = a.tx + (b.tx - a.tx) * t;
  const tz = a.tz + (b.tz - a.tz) * t;
  const d = Math.hypot(tx, tz) || 1;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t, tx: tx / d, tz: tz / d, s: c };
}

/** Rough length of the waypoint path (before smoothing), used to keep absurd spans out. */
export function pathLength(pts: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return total;
}
