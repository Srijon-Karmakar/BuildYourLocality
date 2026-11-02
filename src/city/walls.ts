/**
 * Boundary walls and fences. Each one runs along a single grid edge (one cell long) and does not
 * take up the cell, so a wall can mark the edge of a plot right beside a building.
 *
 * A wall piece's `rot` says which edge: 0 runs along x on the north edge of its cell, 1 runs
 * along z on the west edge. The edge between two cells always belongs to one canonical piece.
 */

export type WallStyleId = 'modern' | 'glass' | 'stone' | 'brick' | 'block' | 'wood' | 'iron' | 'hedge';
export type WallCap = 'none' | 'flat' | 'rounded' | 'peaked';
export type WallPosts = 'none' | 'pillars' | 'columns';
export type WallOpening = 'none' | 'gap' | 'gate' | 'arch';

export interface WallSpec {
  style: WallStyleId;
  /** Metres. */
  height: number;
  thickness: number;
  /** Main colour: tints textured walls, paints fences and hedges, tints glass. */
  colour: string;
  cap: WallCap;
  capColour: string;
  posts: WallPosts;
  /** Metres between posts along the wall (the ends always get one). */
  postEvery: number;
  postColour: string;
  /** Space between slats or bars, 0 - 0.6 m. */
  gap: number;
  opening: WallOpening;
  /** Lamps on the posts, lit at night. */
  lights: boolean;
}

export const WALL_STYLES: { id: WallStyleId; label: string; icon: string; defaults: WallSpec }[] = [
  {
    id: 'modern',
    label: 'Modern wall',
    icon: 'wall-modern',
    defaults: { style: 'modern', height: 2.2, thickness: 0.3, colour: '#e4e2dc', cap: 'flat', capColour: '#2b2f35', posts: 'pillars', postEvery: 3, postColour: '#2b2f35', gap: 0.1, opening: 'none', lights: false },
  },
  {
    id: 'glass',
    label: 'Glass wall',
    icon: 'wall-glass',
    defaults: { style: 'glass', height: 1.9, thickness: 0.08, colour: '#9fd3e8', cap: 'flat', capColour: '#2a2f36', posts: 'pillars', postEvery: 2, postColour: '#2a2f36', gap: 0, opening: 'none', lights: false },
  },
  {
    id: 'stone',
    label: 'Stone wall',
    icon: 'wall-stone',
    defaults: { style: 'stone', height: 1.8, thickness: 0.5, colour: '#ffffff', cap: 'rounded', capColour: '#8d8f93', posts: 'none', postEvery: 3, postColour: '#8d8f93', gap: 0, opening: 'none', lights: false },
  },
  {
    id: 'brick',
    label: 'Brick wall',
    icon: 'wall-brick',
    defaults: { style: 'brick', height: 1.8, thickness: 0.4, colour: '#ffffff', cap: 'peaked', capColour: '#b6564a', posts: 'pillars', postEvery: 3, postColour: '#a4492f', gap: 0, opening: 'none', lights: false },
  },
  {
    id: 'block',
    label: 'Concrete wall',
    icon: 'wall-block',
    defaults: { style: 'block', height: 2.4, thickness: 0.3, colour: '#ffffff', cap: 'flat', capColour: '#6f726f', posts: 'none', postEvery: 3, postColour: '#6f726f', gap: 0, opening: 'none', lights: false },
  },
  {
    id: 'wood',
    label: 'Wooden fence',
    icon: 'wall-wood',
    defaults: { style: 'wood', height: 1.5, thickness: 0.1, colour: '#a9794a', cap: 'none', capColour: '#a9794a', posts: 'pillars', postEvery: 3, postColour: '#8a5f36', gap: 0.05, opening: 'none', lights: false },
  },
  {
    id: 'iron',
    label: 'Iron railing',
    icon: 'wall-iron',
    defaults: { style: 'iron', height: 1.7, thickness: 0.08, colour: '#23272c', cap: 'none', capColour: '#23272c', posts: 'pillars', postEvery: 3, postColour: '#23272c', gap: 0.1, opening: 'none', lights: false },
  },
  {
    id: 'hedge',
    label: 'Hedge wall',
    icon: 'wall-hedge',
    defaults: { style: 'hedge', height: 1.4, thickness: 0.9, colour: '#3d7a35', cap: 'none', capColour: '#3d7a35', posts: 'none', postEvery: 3, postColour: '#3d7a35', gap: 0, opening: 'none', lights: false },
  },
];

export const WALL_CAPS: { id: WallCap; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'flat', label: 'Flat' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'peaked', label: 'Peaked' },
];
export const WALL_POSTS: { id: WallPosts; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'pillars', label: 'Square' },
  { id: 'columns', label: 'Round' },
];
export const WALL_OPENINGS: { id: WallOpening; label: string }[] = [
  { id: 'none', label: 'Solid' },
  { id: 'gap', label: 'Walkway' },
  { id: 'gate', label: 'Gate' },
  { id: 'arch', label: 'Arch' },
];

export const WALL_COLOURS = ['#ffffff', '#e4e2dc', '#b8b4aa', '#6f726f', '#2b2f35', '#a4492f', '#a9794a', '#3d7a35', '#9fd3e8', '#d9b43a', '#c0392b', '#2f6bff'];

export const wallStyleOf = (id: WallStyleId) => WALL_STYLES.find((s) => s.id === id) ?? WALL_STYLES[0];

/** The full settings of a wall: its style's defaults, then whatever the player changed. */
export function resolveWall(spec: Partial<WallSpec> | undefined, fallback: WallStyleId = 'modern'): WallSpec {
  const base = wallStyleOf(spec?.style ?? fallback).defaults;
  return { ...base, ...spec };
}

/** Width of a walkway, gate or arch cut into a wall, in metres. */
export const OPENING_WIDTH = 2.4;
/** Where the lintel of an arch sits above the ground. */
export const ARCH_CLEARANCE = 2.4;

/** An edge of the grid: the cell, and 0 = its north edge (runs along x) or 1 = its west edge (runs along z). */
export interface Edge {
  gx: number;
  gz: number;
  rot: 0 | 1;
}

/** The grid edge nearest a ground point, in metres. */
export function edgeNear(x: number, z: number, cell: number): Edge {
  const u = x / cell;
  const v = z / cell;
  const gx = Math.floor(u);
  const gz = Math.floor(v);
  const fx = u - gx;
  const fz = v - gz;
  const north = fz;
  const south = 1 - fz;
  const west = fx;
  const east = 1 - fx;
  const nearest = Math.min(north, south, west, east);
  if (nearest === north) return { gx, gz, rot: 0 };
  if (nearest === south) return { gx, gz: gz + 1, rot: 0 };
  if (nearest === west) return { gx, gz, rot: 1 };
  return { gx: gx + 1, gz, rot: 1 };
}

/** Where the middle of an edge is, in metres. */
export function edgeCentre(edge: Edge, cell: number): { x: number; z: number } {
  return edge.rot === 0 ? { x: (edge.gx + 0.5) * cell, z: edge.gz * cell } : { x: edge.gx * cell, z: (edge.gz + 0.5) * cell };
}
