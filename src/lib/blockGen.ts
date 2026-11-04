import {
  CELL,
  CORNER_REACH,
  FACADES,
  MAX_FLOORS,
  PIECES,
  ROAD_PRESETS,
  presetStyle,
  resolveLook,
  rotatedFootprint,
  type FacadeId,
  type PieceType,
  type RoofId,
} from '../city/catalog';
import type { Piece } from '../state/useCityStore';

/**
 * The block generator: fills a rectangle of the city with a street grid, houses and towers,
 * parks, trees and street furniture, from a handful of settings and a seed. The same settings and
 * seed always give the same block, so the preview shows exactly what will be placed.
 */

export type BlockStyle = 'suburb' | 'town' | 'downtown' | 'industrial' | 'park';

export interface BlockConfig {
  /** Size in grid cells (6 m each). */
  w: number;
  d: number;
  style: BlockStyle;
  /** 0..1: how many of the plots get a building. */
  density: number;
  /** 0..1: low-rise to high-rise within the style. */
  height: number;
  /** A road all round the edge. */
  ring: boolean;
  /** An inner street every this many cells (0 = none). */
  streets: number;
  road: 'lane' | 'street';
  /** 0..1: trees on the open ground. */
  trees: number;
  /** 0..1: how much of the open ground is laid out as park. */
  parks: number;
  /** 0..1: streetlights, benches, bus stops, fountains. */
  props: number;
  /** Mix facades and roofs instead of each building's own look. */
  variety: boolean;
  seed: number;
  /** Pick a new seed after every stamp, so the next block differs. */
  reroll: boolean;
}

export const BLOCK_MIN = 4;
export const BLOCK_MAX = 30;

export const DEFAULT_BLOCK: BlockConfig = {
  w: 12,
  d: 12,
  style: 'town',
  density: 0.75,
  height: 0.4,
  ring: true,
  streets: 6,
  road: 'street',
  trees: 0.5,
  parks: 0.25,
  props: 0.5,
  variety: true,
  seed: 1,
  reroll: true,
};

export const BLOCK_STYLES: { id: BlockStyle; label: string }[] = [
  { id: 'suburb', label: 'Suburb' },
  { id: 'town', label: 'Town' },
  { id: 'downtown', label: 'Downtown' },
  { id: 'industrial', label: 'Industrial' },
  { id: 'park', label: 'Parkland' },
];

const MIX: Record<BlockStyle, [PieceType, number][]> = {
  suburb: [['house', 7], ['villa', 2], ['cafe', 0.6], ['shop', 0.6]],
  town: [['house', 3], ['shop', 3], ['cafe', 1.5], ['villa', 1], ['apartment', 2.5], ['office', 0.6], ['hotel', 0.3]],
  downtown: [['office', 4], ['apartment', 3], ['hotel', 1.5], ['tower', 1.6], ['skyscraper', 1], ['shop', 2], ['mall', 0.7]],
  industrial: [['warehouse', 6], ['office', 0.8], ['shop', 0.4]],
  park: [['house', 1], ['cafe', 1]],
};

const FACADES_BY_STYLE: Record<BlockStyle, FacadeId[]> = {
  suburb: ['plaster', 'brick', 'stucco', 'whitebrick', 'wood', 'sandstone', 'limestone'],
  town: ['brick', 'plaster', 'stone', 'darkbrick', 'stucco', 'ceramic', 'concrete', 'basketweave'],
  downtown: ['glass', 'mirror', 'ceramic', 'stone', 'concrete', 'metal', 'limestone'],
  industrial: ['metal', 'concrete', 'brick', 'corten', 'darkbrick'],
  park: ['plaster', 'wood', 'stone', 'slats'],
};
const ROOFS_LOW: RoofId[] = ['slate', 'terracotta', 'asphalt', 'shake', 'green', 'gravel'];
const ROOFS_FLAT: RoofId[] = ['membrane', 'gravel', 'sedum', 'concrete'];
const knownFacade = new Set<string>(FACADES.map((f) => f.id));

const TREES: Record<BlockStyle, PieceType[]> = {
  suburb: ['tree', 'tree', 'birch', 'bush', 'blossom'],
  town: ['tree', 'birch', 'bush', 'pine'],
  downtown: ['tree', 'bush', 'birch'],
  industrial: ['pine', 'bush', 'tree'],
  park: ['tree', 'pine', 'birch', 'willow', 'blossom', 'bush', 'cypress'],
};

/** Small seeded random numbers (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where a piece's front points after `rot` quarter-turns. */
const frontOf = (rot: number): [number, number] => {
  const a = (rot * Math.PI) / 2;
  return [Math.round(Math.sin(a)), Math.round(Math.cos(a))];
};

export interface BlockPiece extends Omit<Piece, 'id'> {}

export interface BlockStats {
  buildings: number;
  trees: number;
  roads: number;
  props: number;
  parks: number;
}

export function blockStats(pieces: BlockPiece[]): BlockStats {
  const s: BlockStats = { buildings: 0, trees: 0, roads: 0, props: 0, parks: 0 };
  for (const p of pieces) {
    if (p.type === 'road') s.roads++;
    else if (p.type === 'park') s.parks++;
    else if (PIECES[p.type].paintable) s.buildings++;
    else if (PIECES[p.type].category === 'nature') s.trees++;
    else s.props++;
  }
  return s;
}

/** Builds the block with its top-left grid cell at (`ox`, `oz`). */
export function generateBlock(cfg: BlockConfig, ox: number, oz: number): BlockPiece[] {
  const W = Math.max(BLOCK_MIN, Math.min(BLOCK_MAX, Math.round(cfg.w)));
  const D = Math.max(BLOCK_MIN, Math.min(BLOCK_MAX, Math.round(cfg.d)));
  const rand = rng(cfg.seed * 7919 + W * 131 + D * 17 + cfg.style.length);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  const between = (a: number, b: number) => a + rand() * (b - a);

  type Kind = 'free' | 'road' | 'used';
  const grid: Kind[][] = Array.from({ length: W }, () => Array.from({ length: D }, () => 'free' as Kind));
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < W && z < D;
  const out: BlockPiece[] = [];
  const roadSpec = ROAD_PRESETS.find((r) => r.id === cfg.road)?.spec ?? ROAD_PRESETS[0].spec;

  // --- Streets ----------------------------------------------------------------------------------
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      const edge = x === 0 || z === 0 || x === W - 1 || z === D - 1;
      const inner = cfg.streets >= 3 && ((x > 0 && x < W - 1 && x % cfg.streets === 0) || (z > 0 && z < D - 1 && z % cfg.streets === 0));
      if ((cfg.ring && edge) || inner) {
        grid[x][z] = 'road';
        out.push({ type: 'road', gx: ox + x, gz: oz + z, rot: 0, facade: 'brick', roof: 'gravel', road: { ...roadSpec } });
      }
    }
  }
  const isRoad = (x: number, z: number) => inside(x, z) && grid[x][z] === 'road';

  // --- Buildings --------------------------------------------------------------------------------
  const mix = MIX[cfg.style];
  const total = mix.reduce((n, [, w]) => n + w, 0);
  const density = cfg.style === 'park' ? Math.min(cfg.density, 0.12) : cfg.density;
  const heightFactor = 0.55 + cfg.height * 1.35;
  const facades = FACADES_BY_STYLE[cfg.style].filter((f) => knownFacade.has(f));

  const chooseType = (): PieceType => {
    let roll = rand() * total;
    for (const [type, weight] of mix) {
      roll -= weight;
      if (roll <= 0) return type;
    }
    return mix[0][0];
  };

  /** How well a rotation faces a street: the share of the strip in front of the footprint that is road. */
  const frontScore = (x: number, z: number, fw: number, fd: number, rot: number) => {
    const [fx, fz] = frontOf(rot);
    let hits = 0;
    let n = 0;
    const cells: [number, number][] = [];
    if (fz !== 0) for (let i = 0; i < fw; i++) cells.push([x + i, fz > 0 ? z + fd : z - 1]);
    else for (let i = 0; i < fd; i++) cells.push([fx > 0 ? x + fw : x - 1, z + i]);
    for (const [cx, cz] of cells) {
      n++;
      if (isRoad(cx, cz)) hits++;
    }
    return n ? hits / n : 0;
  };

  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      if (grid[x][z] !== 'free' || rand() > density) continue;
      let placed = false;
      for (let attempt = 0; attempt < 6 && !placed; attempt++) {
        const type = chooseType();
        const def = PIECES[type];
        const options: { rot: number; fw: number; fd: number; score: number }[] = [];
        for (let rot = 0; rot < 4; rot++) {
          const [fw, fd] = rotatedFootprint(def, rot);
          let fits = true;
          for (let i = 0; i < fw && fits; i++) for (let j = 0; j < fd && fits; j++) fits = inside(x + i, z + j) && grid[x + i][z + j] === 'free';
          if (fits) options.push({ rot, fw, fd, score: frontScore(x, z, fw, fd, rot) + rand() * 0.25 });
        }
        if (options.length === 0) continue;
        options.sort((a, b) => b.score - a.score);
        const { rot, fw, fd } = options[0];
        for (let i = 0; i < fw; i++) for (let j = 0; j < fd; j++) grid[x + i][z + j] = 'used';

        const look = resolveLook(type, 'preset', 'preset');
        const piece: BlockPiece = { type, gx: ox + x, gz: oz + z, rot, ...look, ...presetStyle(type) };
        if (cfg.variety) {
          if (facades.length > 0 && def.look?.facade !== 'glass' && def.look?.facade !== 'mirror') piece.facade = pick(facades);
          else if (facades.length > 0 && cfg.style === 'downtown') piece.facade = pick(facades);
          piece.roof = def.roof === 'gable' ? pick(ROOFS_LOW) : pick(ROOFS_FLAT);
        }
        piece.floors = Math.max(1, Math.min(MAX_FLOORS, Math.round(def.floors * heightFactor * between(0.8, 1.25))));
        out.push(piece);
        placed = true;
      }
    }
  }

  // --- Open ground: parks, gardens, trees, benches --------------------------------------------------
  const treeKinds = TREES[cfg.style];
  const parkShare = cfg.style === 'park' ? Math.max(cfg.parks, 0.6) : cfg.parks;
  const treeCells: [number, number][] = [];
  const parkCells: [number, number][] = [];
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      if (grid[x][z] !== 'free') continue;
      if (rand() < parkShare) {
        grid[x][z] = 'used';
        parkCells.push([x, z]);
        out.push({ type: 'park', gx: ox + x, gz: oz + z, rot: 0, facade: 'brick', roof: 'gravel' });
      } else {
        treeCells.push([x, z]);
      }
    }
  }
  if (cfg.props > 0.45 && parkCells.length > 4) {
    // One fountain in the middle-most park cell.
    const [mx, mz] = [(W - 1) / 2, (D - 1) / 2];
    const best = [...parkCells].sort((a, b) => Math.hypot(a[0] - mx, a[1] - mz) - Math.hypot(b[0] - mx, b[1] - mz))[0];
    const i = out.findIndex((p) => p.type === 'park' && p.gx === ox + best[0] && p.gz === oz + best[1]);
    if (i >= 0) out[i] = { type: 'fountain', gx: ox + best[0], gz: oz + best[1], rot: 0, facade: 'brick', roof: 'gravel' };
  }

  const plant = (x: number, z: number, count: number) => {
    for (let k = 0; k < count; k++) {
      const type = pick(treeKinds);
      out.push({
        type,
        gx: ox + x,
        gz: oz + z,
        rot: 0,
        facade: 'brick',
        roof: 'gravel',
        offset: [Math.round(between(-2.4, 2.4) * 10) / 10, Math.round(between(-2.4, 2.4) * 10) / 10],
        scale: Math.round(between(0.7, 1.7) * 100) / 100,
      });
    }
  };
  for (const [x, z] of parkCells) plant(x, z, Math.round(cfg.trees * between(1.5, 4.5)));
  for (const [x, z] of treeCells) {
    // Open ground between buildings: gardens, shrubs and the odd bench or bus stop beside a street.
    const nearRoad = isRoad(x + 1, z) || isRoad(x - 1, z) || isRoad(x, z + 1) || isRoad(x, z - 1);
    if (nearRoad && rand() < cfg.props * 0.18) {
      const towards = ([[0, 1], [1, 0], [0, -1], [-1, 0]] as const).findIndex(([dx, dz]) => isRoad(x + dx, z + dz));
      out.push({ type: rand() < 0.6 ? 'bench' : 'busstop', gx: ox + x, gz: oz + z, rot: towards < 0 ? 0 : [0, 1, 2, 3][towards], facade: 'brick', roof: 'gravel' });
      continue;
    }
    plant(x, z, Math.round(cfg.trees * between(0, 3.2)));
  }

  // --- Streetlights along the streets, alternating sides ----------------------------------------------
  if (cfg.props > 0) {
    const every = cfg.props > 0.75 ? 2 : 3;
    let n = 0;
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        if (grid[x][z] !== 'road' || (x + z) % every !== 0) continue;
        const sx = n % 2 === 0 ? -1 : 1;
        const sz = (n >> 1) % 2 === 0 ? -1 : 1;
        n++;
        out.push({ type: 'lamp', gx: ox + x, gz: oz + z, rot: 0, facade: 'brick', roof: 'gravel', offset: [sx * CORNER_REACH, sz * CORNER_REACH] });
      }
    }
  }
  void CELL;
  return out;
}
