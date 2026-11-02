import { CELL, GRASS_TYPES, PLANT_TYPES, type PieceType } from './catalog';
import { cellKey, overlaysNear, useCityStore, type Piece } from '../state/useCityStore';

/** The forest brush: scatter or clear trees inside a circle. */
export interface ForestBrush {
  /** Radius in grid cells. */
  radius: number;
  /** Trees per grid cell of brush area (a cell is 6 x 6 m). */
  density: number;
  /** Kinds of tree to mix. */
  species: PieceType[];
  /** 0 = every tree full size, 1 = anything from small to large. */
  sizeVariety: number;
  /** Plant new trees, or take them away. */
  mode: 'plant' | 'clear';
}

export const DEFAULT_FOREST: ForestBrush = { radius: 4, density: 0.6, species: ['tree', 'pine', 'birch'], sizeVariety: 0.5, mode: 'plant' };

/** Closest two trees may stand, in metres, so the forest looks natural and not like a single clump. */
const SPACING = 2.1;
/** Grass grows much closer together, and trees stand happily among it. */
const GRASS_SPACING = 0.9;
const isGrass = (type: PieceType) => GRASS_TYPES.includes(type);
const MAX_PER_STAMP = 500;

/**
 * Scatters trees round a world point on free ground. A click stamps the whole circle; while
 * dragging, each new stamp adds a lighter sprinkle so the stroke fills in evenly. Trees keep
 * clear of buildings, roads and anything else on the ground.
 */
export function plantForest(x: number, z: number, brush: ForestBrush, dragging: boolean): number {
  const species = brush.species.filter((s) => PLANT_TYPES.includes(s));
  if (species.length === 0) return 0;
  const city = useCityStore.getState();
  const radius = brush.radius * CELL;
  const areaCells = Math.PI * brush.radius * brush.radius;
  const attempts = Math.min(MAX_PER_STAMP * 2, Math.round(brush.density * areaCells * (dragging ? 0.35 : 1) * 1.6));

  // What already stands nearby, so new trees do not land on top of it.
  const taken: [number, number, boolean][] = overlaysNear(city.pieces, x, z, radius + SPACING).map((p) => [
    (p.gx + 0.5) * CELL + (p.offset?.[0] ?? 0),
    (p.gz + 0.5) * CELL + (p.offset?.[1] ?? 0),
    isGrass(p.type),
  ]);
  const wanted = Math.min(MAX_PER_STAMP, Math.round(brush.density * areaCells * (dragging ? 0.35 : 1)));
  const planted: Omit<Piece, 'id'>[] = [];

  for (let i = 0; i < attempts && planted.length < wanted; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * radius;
    const px = x + Math.cos(angle) * dist;
    const pz = z + Math.sin(angle) * dist;
    const gx = Math.floor(px / CELL);
    const gz = Math.floor(pz / CELL);
    if (city.occupancy[cellKey(gx, gz)]) continue;
    const type = species[Math.floor(Math.random() * species.length)];
    const mine = isGrass(type);
    if (taken.some(([tx, tz, theirs]) => (tx - px) ** 2 + (tz - pz) ** 2 < (mine || theirs ? GRASS_SPACING : SPACING) ** 2)) continue;
    const piece: Omit<Piece, 'id'> = {
      type,
      gx,
      gz,
      rot: 0,
      facade: 'brick',
      roof: 'gravel',
      offset: [Math.round((px - (gx + 0.5) * CELL) * 10) / 10, Math.round((pz - (gz + 0.5) * CELL) * 10) / 10],
    };
    if (brush.sizeVariety > 0) piece.scale = Math.round((1 + (Math.random() - 0.5) * brush.sizeVariety * 1.1) * 100) / 100;
    planted.push(piece);
    taken.push([px, pz, mine]);
  }
  return city.placeMany(planted);
}

/** Takes away every tree inside the brush circle. */
export function clearForest(x: number, z: number, brush: ForestBrush): number {
  const city = useCityStore.getState();
  const ids = overlaysNear(city.pieces, x, z, brush.radius * CELL).map((p) => p.id);
  return city.removeMany(ids);
}
