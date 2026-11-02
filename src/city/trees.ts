import type { PieceType } from './catalog';

/**
 * Procedural trees. A tree is a handful of parts (trunk pieces and leafy lobes) generated from a
 * few settings plus a pattern number: the same number always grows the same tree, and any of the
 * million-odd numbers grows a different one, so no two trees in a forest need look alike.
 */

export type TreeShape = 'round' | 'oval' | 'cone' | 'tiered' | 'palm' | 'weeping' | 'columnar' | 'bush' | 'grass';

export const TREE_SHAPES: { id: TreeShape; label: string }[] = [
  { id: 'round', label: 'Broadleaf' },
  { id: 'oval', label: 'Oval' },
  { id: 'cone', label: 'Conifer' },
  { id: 'tiered', label: 'Layered' },
  { id: 'palm', label: 'Palm' },
  { id: 'weeping', label: 'Weeping' },
  { id: 'columnar', label: 'Column' },
  { id: 'bush', label: 'Bush' },
  { id: 'grass', label: 'Grass' },
];

export interface TreeSpec {
  shape: TreeShape;
  /** Trunk colour. */
  trunk: string;
  /** Leaf colour (the piece's accent colour overrides it). */
  leaf: string;
  /** Trunk and overall height, 0.5 - 2. */
  height: number;
  /** Width of the crown, 0.5 - 2. */
  canopy: number;
  /** How many lobes / tiers / fronds, 0 - 1. */
  fullness: number;
  /** Sideways bend of the trunk, 0 - 1. */
  lean: number;
  /** Shade difference between lobes, 0 - 1. */
  variety: number;
  /** Pattern number: any whole number. */
  seed: number;
  /** Grass: how many flowers, 0 - 1, and their colour. */
  bloom: number;
  flower: string;
}

/** What each kind of tree starts as. */
export const TREE_DEFAULTS: Partial<Record<PieceType, TreeSpec>> = {
  tree: { shape: 'round', trunk: '#5b3a1e', leaf: '#4c9a40', height: 1, canopy: 1, fullness: 0.3, lean: 0, variety: 0.35, seed: 0, bloom: 0, flower: '#ffd84a' },
  pine: { shape: 'cone', trunk: '#4a3018', leaf: '#2f6b36', height: 1, canopy: 1, fullness: 0.2, lean: 0, variety: 0.25, seed: 0, bloom: 0, flower: '#ffd84a' },
  birch: { shape: 'oval', trunk: '#e4dfd0', leaf: '#86b455', height: 1, canopy: 1, fullness: 0.4, lean: 0.1, variety: 0.4, seed: 0, bloom: 0, flower: '#ffd84a' },
  palm: { shape: 'palm', trunk: '#a07a4a', leaf: '#4fa64a', height: 1, canopy: 1, fullness: 0.5, lean: 0.4, variety: 0.3, seed: 0, bloom: 0, flower: '#ffd84a' },
  willow: { shape: 'weeping', trunk: '#6b4a2b', leaf: '#7bab57', height: 1, canopy: 1, fullness: 0.6, lean: 0.1, variety: 0.3, seed: 0, bloom: 0, flower: '#ffd84a' },
  blossom: { shape: 'round', trunk: '#4d3320', leaf: '#f2a7c3', height: 0.9, canopy: 1.05, fullness: 0.7, lean: 0.15, variety: 0.5, seed: 0, bloom: 0, flower: '#ffd84a' },
  cypress: { shape: 'columnar', trunk: '#4a3018', leaf: '#2a5a34', height: 1.1, canopy: 0.8, fullness: 0.5, lean: 0, variety: 0.3, seed: 0, bloom: 0, flower: '#ffd84a' },
  grass: { shape: 'grass', trunk: '#8a7a4a', leaf: '#7cc04a', height: 1, canopy: 1, fullness: 0.5, lean: 0.25, variety: 0.5, seed: 0, bloom: 0, flower: '#ffd84a' },
  tallgrass: { shape: 'grass', trunk: '#8a7a4a', leaf: '#cdb85c', height: 2.2, canopy: 1.3, fullness: 0.6, lean: 0.5, variety: 0.5, seed: 0, bloom: 0, flower: '#ffd84a' },
  wildflower: { shape: 'grass', trunk: '#8a7a4a', leaf: '#5da340', height: 1.1, canopy: 1.2, fullness: 0.55, lean: 0.2, variety: 0.5, seed: 0, bloom: 0.8, flower: '#ff6fa8' },
  bush: { shape: 'bush', trunk: '#4a3018', leaf: '#3d7a35', height: 1, canopy: 1, fullness: 0.5, lean: 0, variety: 0.4, seed: 0, bloom: 0, flower: '#ffd84a' },
};

export const FALLBACK_TREE: TreeSpec = TREE_DEFAULTS.tree!;

/** Leaf colours worth reaching for. */
export const LEAF_SWATCHES: { label: string; color: string }[] = [
  { label: 'Spring green', color: '#6fbf4a' },
  { label: 'Summer green', color: '#3f8a3a' },
  { label: 'Deep green', color: '#245c34' },
  { label: 'Olive', color: '#7d8a3a' },
  { label: 'Gold', color: '#d9b43a' },
  { label: 'Autumn orange', color: '#d9791f' },
  { label: 'Maple red', color: '#b3301f' },
  { label: 'Blossom pink', color: '#f2a7c3' },
  { label: 'Plum', color: '#7a3b6e' },
  { label: 'Blue spruce', color: '#4d7f8a' },
];

/** Leaf colours for grass. */
export const GRASS_SWATCHES: { label: string; color: string }[] = [
  { label: 'Lawn', color: '#6fae3f' },
  { label: 'Fresh', color: '#8fcf4a' },
  { label: 'Meadow', color: '#5da340' },
  { label: 'Dark', color: '#3a7a35' },
  { label: 'Dry', color: '#b9a64a' },
  { label: 'Straw', color: '#cdb85c' },
  { label: 'Pampas', color: '#e6d9a8' },
  { label: 'Autumn', color: '#b8793a' },
  { label: 'Frost', color: '#9fc4b8' },
  { label: 'Purple fescue', color: '#7a6a9a' },
];

export const FLOWER_SWATCHES: { label: string; color: string }[] = [
  { label: 'Pink', color: '#ff6fa8' },
  { label: 'Yellow', color: '#ffd84a' },
  { label: 'White', color: '#f4f1e6' },
  { label: 'Red', color: '#e03a3a' },
  { label: 'Blue', color: '#5a7fe0' },
  { label: 'Purple', color: '#9a5ad6' },
  { label: 'Orange', color: '#f08a2a' },
];

export const TRUNK_SWATCHES: { label: string; color: string }[] = [
  { label: 'Oak brown', color: '#5b3a1e' },
  { label: 'Dark bark', color: '#3a2616' },
  { label: 'Birch white', color: '#e4dfd0' },
  { label: 'Driftwood', color: '#a07a4a' },
  { label: 'Grey', color: '#7b7770' },
  { label: 'Red bark', color: '#7a3a26' },
];

/** A stable 0..1 number from a piece id, so trees sharing a cell still differ. */
export function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1_000_003) / 1_000_003;
}

/** The settings a tree actually grows from: the type's defaults, then the player's changes. */
export function resolveTree(type: PieceType, accent: string | undefined, spec: Partial<TreeSpec> | undefined, pieceSeed: number): TreeSpec {
  const base = TREE_DEFAULTS[type] ?? FALLBACK_TREE;
  return {
    ...base,
    ...spec,
    leaf: accent ?? spec?.leaf ?? base.leaf,
    seed: spec?.seed ?? Math.floor(pieceSeed * 1_000_000),
  };
}

/** One piece of a tree. `tone` runs -1 (darker) .. 1 (lighter) and is scaled by the tree's variety. */
export interface TreePart {
  kind: 'cyl' | 'sphere' | 'cone' | 'box';
  /** Where it sits (the group origin when `yaw` is used). */
  pos: [number, number, number];
  /** Turn about the vertical axis, applied to the group at `pos`; `local` then offsets inside it. */
  yaw?: number;
  local?: [number, number, number];
  /** cyl: [top radius, bottom radius, height]; sphere: [rx, ry, rz]; cone: [radius, height]; box: [x, y, z]. */
  size: [number, number, number];
  /** Tilt (x, y, z) of the part itself. */
  rot?: [number, number, number];
  paint: 'trunk' | 'leaf' | 'flower';
  tone: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grows the parts of a tree. Pure: the same spec always gives the same parts. */
export function growTree(spec: TreeSpec): TreePart[] {
  const rnd = mulberry32(Math.floor(Math.abs(spec.seed)) * 2654435761 + 12345);
  const range = (a: number, b: number) => a + (b - a) * rnd();
  const parts: TreePart[] = [];
  const H = spec.height;
  const C = spec.canopy;
  const jitter = 0.92 + rnd() * 0.18; // a little natural size difference between neighbours
  const full = spec.fullness;
  const bend = spec.lean * (rnd() < 0.5 ? -1 : 1);
  const bendDir = rnd() * Math.PI * 2;

  /** A straight, slightly leaning trunk; returns the offset of its top so the crown can sit on it. */
  const trunk = (height: number, r0: number, r1: number): [number, number] => {
    const lean = bend * height * 0.32;
    const ox = Math.cos(bendDir) * lean;
    const oz = Math.sin(bendDir) * lean;
    const tilt = Math.atan2(lean, height);
    parts.push({
      kind: 'cyl',
      pos: [ox / 2, height / 2, oz / 2],
      size: [r1, r0, Math.hypot(height, lean)],
      rot: [Math.sin(bendDir) * tilt, 0, -Math.cos(bendDir) * tilt],
      paint: 'trunk',
      tone: 0,
    });
    return [ox, oz];
  };

  const lobe = (x: number, y: number, z: number, rx: number, ry: number, rz: number, tone = range(-1, 1)) =>
    parts.push({ kind: 'sphere', pos: [x, y, z], size: [rx, ry, rz], paint: 'leaf', tone });

  if (spec.shape === 'grass') {
    // The blades are one merged shape (see growBlades); only the flower heads are separate parts.
    const tips = grassBlades(spec).tips;
    const flowers = Math.round(spec.bloom * 16);
    for (let i = 0; i < flowers && tips.length > 0; i++) {
      const tip = tips[Math.floor(rnd() * tips.length)];
      const r = range(0.08, 0.15) * (0.8 + C * 0.2);
      parts.push({ kind: 'sphere', pos: [tip[0], tip[1] + r * 0.4, tip[2]], size: [r, r * 0.8, r], paint: 'flower', tone: range(-1, 1) });
    }
    return parts;
  }

  switch (spec.shape) {
    case 'round':
    case 'oval': {
      const tall = spec.shape === 'oval';
      const trunkH = (tall ? 2.9 : 2.4) * H * jitter;
      const [ox, oz] = trunk(trunkH, 0.3, 0.2);
      const R = (tall ? 1.35 : 1.7) * C * jitter;
      const stretch = tall ? 1.55 : 1;
      const cy = trunkH + R * stretch * 0.55;
      lobe(ox, cy, oz, R, R * stretch, R, 0);
      const extra = Math.round(full * 7) + 1;
      for (let i = 0; i < extra; i++) {
        const a = rnd() * Math.PI * 2;
        const e = range(-0.45, 0.75);
        const d = R * range(0.55, 0.85);
        const r = R * range(0.42, 0.7);
        lobe(ox + Math.cos(a) * Math.cos(e) * d, cy + Math.sin(e) * d * stretch, oz + Math.sin(a) * Math.cos(e) * d, r, r * (tall ? 1.3 : 1), r);
      }
      break;
    }
    case 'cone':
    case 'tiered': {
      const layered = spec.shape === 'tiered';
      const trunkH = 1.3 * H * jitter;
      const [ox, oz] = trunk(trunkH, 0.26, 0.18);
      const tiers = 3 + Math.round(full * 3);
      const total = (layered ? 4 : 4.4) * H * jitter;
      const step = total / tiers;
      for (let i = 0; i < tiers; i++) {
        const t = i / tiers;
        const r = (layered ? 2 : 1.6) * C * (1 - t * 0.78) * jitter;
        const h = step * (layered ? 1.15 : 1.85);
        parts.push({ kind: 'cone', pos: [ox * (1 - t), trunkH + 0.4 + i * step + h / 2, oz * (1 - t)], size: [r, h, 0], paint: 'leaf', tone: range(-1, 1) });
      }
      break;
    }
    case 'columnar': {
      const trunkH = 0.9 * H * jitter;
      const [ox, oz] = trunk(trunkH, 0.24, 0.16);
      const n = 3 + Math.round(full * 3);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const r = 0.95 * C * (1 - Math.abs(t - 0.35) * 0.8) * jitter;
        lobe(ox, trunkH + 0.6 + (i * 4.6 * H) / n, oz, r, r * 1.55, r);
      }
      break;
    }
    case 'bush': {
      const n = 3 + Math.round(full * 4);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const d = i === 0 ? 0 : range(0.3, 0.9) * C;
        const r = range(0.55, 0.95) * C * H;
        lobe(Math.cos(a) * d, r * 0.8, Math.sin(a) * d, r, r * 0.85, r);
      }
      break;
    }
    case 'weeping': {
      const trunkH = 2.6 * H * jitter;
      const [ox, oz] = trunk(trunkH, 0.34, 0.22);
      const R = 1.6 * C * jitter;
      const cy = trunkH + R * 0.35;
      lobe(ox, cy, oz, R, R * 0.72, R, 0);
      const side = Math.round(full * 3) + 1;
      for (let i = 0; i < side; i++) {
        const a = rnd() * Math.PI * 2;
        lobe(ox + Math.cos(a) * R * 0.5, cy + range(-0.2, 0.3), oz + Math.sin(a) * R * 0.5, R * 0.6, R * 0.45, R * 0.6);
      }
      const strands = 10 + Math.round(full * 14);
      for (let i = 0; i < strands; i++) {
        const a = (i / strands) * Math.PI * 2 + rnd() * 0.4;
        const d = R * range(0.85, 1.25);
        const len = range(1.5, 3.1) * H;
        parts.push({ kind: 'box', pos: [ox + Math.cos(a) * d, cy - len / 2 - 0.1, oz + Math.sin(a) * d], size: [0.2, len, 0.2], paint: 'leaf', tone: range(0.2, 1) });
      }
      break;
    }
    case 'palm': {
      const total = 5.2 * H * jitter;
      const segs = 5;
      let x = 0;
      let z = 0;
      let y = 0;
      for (let i = 0; i < segs; i++) {
        const h = total / segs;
        const t = i / segs;
        const dx = Math.cos(bendDir) * bend * 0.55 * (0.4 + t);
        const dz = Math.sin(bendDir) * bend * 0.55 * (0.4 + t);
        const len = Math.hypot(h, dx, dz);
        parts.push({
          kind: 'cyl',
          pos: [x + dx / 2, y + h / 2, z + dz / 2],
          size: [0.15 - t * 0.02, 0.19 - t * 0.02, len],
          rot: [Math.atan2(dz, h), 0, -Math.atan2(dx, h)],
          paint: 'trunk',
          tone: 0,
        });
        x += dx;
        y += h;
        z += dz;
      }
      const fronds = 6 + Math.round(full * 6);
      for (let i = 0; i < fronds; i++) {
        const a = (i / fronds) * Math.PI * 2 + rnd() * 0.3;
        const len = range(2.1, 3) * C;
        parts.push({
          kind: 'box',
          pos: [x, y + 0.1, z],
          yaw: a,
          local: [0, -Math.sin(0.5) * len * 0.5, len * 0.5],
          size: [range(0.5, 0.8) * C, 0.06, len],
          rot: [0.5 + range(0, 0.35), 0, 0],
          paint: 'leaf',
          tone: range(-1, 1),
        });
      }
      parts.push({ kind: 'sphere', pos: [x, y - 0.1, z], size: [0.3, 0.3, 0.3], paint: 'trunk', tone: -0.5 });
      break;
    }
  }
  return parts;
}

/** Blades of grass for a clump: a flat list of triangles (3 numbers a corner) and a shade for each corner. */
export interface GrassBlades {
  positions: number[];
  /** One grey value per corner (multiplied over the leaf colour). */
  shades: number[];
  /** Where each blade ends, for putting flowers on. */
  tips: [number, number, number][];
}

const bladeCache = new Map<string, GrassBlades>();

export function grassBlades(spec: TreeSpec): GrassBlades {
  const key = JSON.stringify([spec.seed, spec.height, spec.canopy, spec.fullness, spec.lean, spec.variety]);
  const cached = bladeCache.get(key);
  if (cached) return cached;
  const rnd = mulberry32(Math.floor(Math.abs(spec.seed)) * 2246822519 + 777);
  const range = (a: number, b: number) => a + (b - a) * rnd();
  const count = 14 + Math.round(spec.fullness * 46);
  const wind = rnd() * Math.PI * 2;
  const positions: number[] = [];
  const shades: number[] = [];
  const tips: [number, number, number][] = [];

  for (let i = 0; i < count; i++) {
    const around = rnd() * Math.PI * 2;
    const out = Math.sqrt(rnd()) * 0.6 * spec.canopy;
    const bx = Math.cos(around) * out;
    const bz = Math.sin(around) * out;
    const h = range(0.45, 1) * 0.75 * spec.height;
    const w = range(0.07, 0.13) * (0.7 + spec.canopy * 0.3);
    // Leans away from the middle, and all together towards the wind.
    const lean = range(0.1, 0.4) * h;
    const lx = Math.cos(around) * lean + Math.cos(wind) * spec.lean * h * 0.7;
    const lz = Math.sin(around) * lean + Math.sin(wind) * spec.lean * h * 0.7;
    // The blade's width runs across its lean.
    const ang = Math.atan2(lz, lx) + Math.PI / 2;
    const sx = Math.cos(ang) * w * 0.5;
    const sz = Math.sin(ang) * w * 0.5;
    const mx = bx + lx * 0.3;
    const mz = bz + lz * 0.3;
    const my = h * 0.55;
    const tx = bx + lx;
    const tz = bz + lz;
    const ty = h * (1 - Math.min(0.25, Math.hypot(lx, lz) / (h * 3)));
    const shade = 1 + (rnd() - 0.5) * spec.variety * 0.9;
    const dark = shade * 0.72; // the foot of a blade sits in shadow
    const quad = (a: number[], b: number[], c: number[], sa: number, sb: number, sc: number) => {
      positions.push(...a, ...b, ...c);
      shades.push(sa, sb, sc);
    };
    const b1 = [bx - sx, 0, bz - sz];
    const b2 = [bx + sx, 0, bz + sz];
    const m1 = [mx - sx * 0.75, my, mz - sz * 0.75];
    const m2 = [mx + sx * 0.75, my, mz + sz * 0.75];
    const tip = [tx, ty, tz];
    quad(b1, b2, m2, dark, dark, shade);
    quad(b1, m2, m1, dark, shade, shade);
    quad(m1, m2, tip, shade, shade, shade * 1.1);
    tips.push([tx, ty, tz]);
  }
  const result = { positions, shades, tips };
  if (bladeCache.size > 400) bladeCache.clear();
  bladeCache.set(key, result);
  return result;
}
