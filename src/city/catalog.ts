/** Edge length of one city grid cell, in world units (1 unit is about 1 metre). */
export const CELL = 6;
export const FLOOR_H = 2.4;

export const FACADES = [
  { id: 'mirror', label: 'Mirror glass', swatch: '#8fb4d2' },
  { id: 'glass', label: 'Glass curtain wall', swatch: '#3d6e8f' },
  { id: 'led', label: 'LED media wall', swatch: '#1a1f2e' },
  { id: 'ceramic', label: 'Ceramic panels', swatch: '#e9ebec' },
  { id: 'stone', label: 'Stone cladding', swatch: '#8b8e92' },
  { id: 'corten', label: 'Weathering steel', swatch: '#8a4b2a' },
  { id: 'slats', label: 'Timber slats', swatch: '#b98550' },
  { id: 'metal', label: 'Metal cladding', swatch: '#8a96a3' },
  { id: 'concrete', label: 'Concrete', swatch: '#9a9a96' },
  { id: 'plaster', label: 'Plaster', swatch: '#ece4d2' },
  { id: 'darkbrick', label: 'Dark brick', swatch: '#463e3c' },
  { id: 'brick', label: 'Brick', swatch: '#a4492f' },
  { id: 'wood', label: 'Wood siding', swatch: '#9a6b3f' },
  { id: 'sandstone', label: 'Sandstone', swatch: '#cfae7f' },
] as const;
export type FacadeId = (typeof FACADES)[number]['id'];

/** Multiplied over the facade texture to recolour it; white leaves it untouched. */
export const TINTS = [
  { id: '#ffffff', label: 'Natural / silver' },
  { id: '#7fb7d9', label: 'Blue mirror' },
  { id: '#58b09c', label: 'Teal' },
  { id: '#d4a373', label: 'Bronze' },
  { id: '#8d9aa6', label: 'Slate grey' },
  { id: '#3c4650', label: 'Charcoal' },
  { id: '#f4d9a8', label: 'Warm sand' },
  { id: '#e8b4a0', label: 'Blush' },
  { id: '#b9d6b0', label: 'Sage' },
  { id: '#f0e08a', label: 'Butter' },
  { id: '#c9b8e0', label: 'Lavender' },
] as const;

export type WindowStyle = 'punched' | 'ribbon' | 'tall' | 'none';
export const WINDOW_STYLES: { id: WindowStyle; label: string }[] = [
  { id: 'punched', label: 'Classic' },
  { id: 'ribbon', label: 'Ribbon' },
  { id: 'tall', label: 'Floor-to-ceiling' },
  { id: 'none', label: 'None' },
];

export const MIN_FLOORS = 1;
export const MAX_FLOORS = 40;

export const ROOFS = [
  { id: 'membrane', label: 'White membrane', swatch: '#d9dcdc' },
  { id: 'solar', label: 'Solar panels', swatch: '#1f3a5f' },
  { id: 'sedum', label: 'Green roof', swatch: '#6f8f4e' },
  { id: 'slate', label: 'Slate', swatch: '#4a5568' },
  { id: 'terracotta', label: 'Terracotta', swatch: '#b4553a' },
  { id: 'green', label: 'Green metal', swatch: '#4f7a4a' },
  { id: 'gravel', label: 'Gravel', swatch: '#8a8a85' },
] as const;
export type RoofId = (typeof ROOFS)[number]['id'];

export type PieceType =
  | 'road'
  // buildings
  | 'house'
  | 'villa'
  | 'shop'
  | 'cafe'
  | 'apartment'
  | 'warehouse'
  | 'office'
  | 'hotel'
  | 'mall'
  | 'tower'
  | 'skyscraper'
  // nature
  | 'tree'
  | 'pine'
  | 'hedge'
  | 'park'
  | 'fountain'
  // street furniture
  | 'lamp'
  | 'bench'
  | 'busstop'
  | 'billboard'
  | 'kiosk'
  | 'trafficlight'
  | 'plaza';

/** Size of one layout unit (a block's width/depth/position step), in world units. */
export const UNIT = 3;
/** Layout units across one grid cell. */
export const UNITS_PER_CELL = CELL / UNIT;
/** Gap between a block and the lot edge, so buildings never touch the street. */
export const LOT_MARGIN = 0.6;

/** Ridge height of a pitched roof over a span (metres): scales with the span, within limits. */
export function gableHeightForSpan(span: number): number {
  return Math.min(4, Math.max(1.6, span * 0.3));
}

export type Category = 'roads' | 'buildings' | 'nature' | 'street';

// --- Building customisation ------------------------------------------------------

export const MIN_LOT = 1;
export const MAX_LOT = 4;
export const MAX_BLOCKS = 8;

/**
 * One rectangular volume of a building, on the lot's layout grid (UNIT metres per step,
 * origin at the lot's min corner). A building is the union of its blocks.
 */
export interface Block {
  u: number;
  v: number;
  w: number;
  d: number;
  floors: number;
  /** Overrides the building's facade material for just this block. */
  facade?: FacadeId;
}

export type DoorStyle = 'none' | 'single' | 'double' | 'glass' | 'garage';
export const DOOR_STYLES: { id: DoorStyle; label: string }[] = [
  { id: 'single', label: 'Single' },
  { id: 'double', label: 'Double' },
  { id: 'glass', label: 'Glass' },
  { id: 'garage', label: 'Garage' },
  { id: 'none', label: 'None' },
];

export type DoorSide = 'front' | 'back' | 'left' | 'right';
export const DOOR_SIDES: { id: DoorSide; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
];

export interface DoorSpec {
  style: DoorStyle;
  /** Index into the building's blocks. */
  block: number;
  side: DoorSide;
  /** Metres along that wall from its centre (positive = to the right as you face it). */
  offset: number;
  canopy: boolean;
  color: string;
}

export type LedMode = 'wave' | 'ticker' | 'bars' | 'checker' | 'pulse' | 'solid';
export const LED_MODES: { id: LedMode; label: string }[] = [
  { id: 'wave', label: 'Colour wave' },
  { id: 'ticker', label: 'Scrolling text' },
  { id: 'bars', label: 'Equaliser' },
  { id: 'checker', label: 'Pixels' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'solid', label: 'Solid' },
];

/** A big LED screen mounted on one wall of a building. */
export interface LedSpec {
  mode: LedMode;
  color: string;
  /** Block index and wall it is mounted on. */
  block: number;
  side: DoorSide;
  /** First storey the screen covers (0 = ground floor) and how many storeys tall it is. */
  bottom: number;
  height: number;
  /** Width in metres; 0 means the whole wall. */
  width: number;
  /** Metres along the wall from its centre. */
  offset: number;
}

export type RoofExtra = 'plant' | 'antenna' | 'solar' | 'garden' | 'helipad';
export const ROOF_EXTRAS: { id: RoofExtra; label: string }[] = [
  { id: 'plant', label: 'AC units' },
  { id: 'antenna', label: 'Antenna' },
  { id: 'solar', label: 'Solar array' },
  { id: 'garden', label: 'Roof garden' },
  { id: 'helipad', label: 'Helipad' },
];

export type BalconyMode = 'none' | 'front' | 'all';
export const BALCONY_MODES: { id: BalconyMode; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'front', label: 'Front' },
  { id: 'all', label: 'All sides' },
];

export interface SignSpec {
  text: string;
  color: string;
}

/** Everything a player can change about a piece; unset fields use the preset. */
export interface StyleOverrides {
  /** Floors of the default single block (ignored once `blocks` is set). */
  floors?: number;
  roofStyle?: 'flat' | 'gable';
  /** Wall colour: multiplied over the facade texture. */
  tint?: string;
  windows?: WindowStyle;
  /** Lot size in cells (before rotation). */
  lot?: [number, number];
  blocks?: Block[];
  door?: Partial<DoorSpec>;
  /** Colour of plinth, parapet and canopy trim. */
  trim?: string;
  led?: LedSpec | null;
  roofExtras?: RoofExtra[];
  balconies?: BalconyMode;
  sign?: SignSpec | null;
  /** Props: main colour (foliage, paint, water, ...) and size multiplier. */
  accent?: string;
  scale?: number;
}

export interface BuildingStyle {
  lot: [number, number];
  blocks: Block[];
  roofStyle: 'flat' | 'gable';
  tint: string;
  windows: WindowStyle;
  door: DoorSpec;
  trim: string;
  led: LedSpec | null;
  roofExtras: RoofExtra[];
  balconies: BalconyMode;
  sign: SignSpec | null;
}

/** The look a preset starts with when the palette is set to "Preset look". */
export interface PresetLook {
  facade: FacadeId;
  roof: RoofId;
  style?: StyleOverrides;
}

export interface PieceDef {
  label: string;
  category: Category;
  /** Grid cells covered, [width (x), depth (z)], before rotation. */
  footprint: [number, number];
  /** Storeys; 0 for roads and props. */
  floors: number;
  roof: 'flat' | 'gable' | 'none';
  /** Full building editor (blocks, doors, facades, ...). */
  paintable: boolean;
  /** Can be opened in the inspector (buildings and props; not roads). */
  customisable: boolean;
  /** Solid collider [w, h, d] (roam mode) for props; buildings derive theirs from their blocks. */
  collider?: [number, number, number];
  look?: PresetLook;
  /** Which door a fresh building gets. */
  door?: DoorStyle;
  canopy?: boolean;
}

const bld = (
  label: string,
  footprint: [number, number],
  floors: number,
  roof: 'flat' | 'gable',
  look: PresetLook,
  door: DoorStyle = 'glass',
  canopy = true,
): PieceDef => ({ label, category: 'buildings', footprint, floors, roof, paintable: true, customisable: true, look, door, canopy });

const prop = (label: string, category: Category, collider?: [number, number, number]): PieceDef => ({
  label,
  category,
  footprint: [1, 1],
  floors: 0,
  roof: 'none',
  paintable: false,
  customisable: true,
  collider,
});

export const PIECES: Record<PieceType, PieceDef> = {
  road: { label: 'Road', category: 'roads', footprint: [1, 1], floors: 0, roof: 'none', paintable: false, customisable: false },

  house: bld('House', [1, 1], 2, 'gable', { facade: 'plaster', roof: 'slate' }, 'single', false),
  villa: bld('Modern villa', [2, 1], 2, 'flat', { facade: 'ceramic', roof: 'membrane', style: { windows: 'tall', roofExtras: ['solar'], balconies: 'front', trim: '#2c3036' } }),
  shop: bld('Shop', [1, 1], 1, 'flat', { facade: 'ceramic', roof: 'membrane', style: { windows: 'tall', sign: { text: 'SHOP', color: '#ffb02e' } } }),
  cafe: bld('Café', [1, 1], 1, 'flat', { facade: 'slats', roof: 'sedum', style: { windows: 'tall', roofExtras: ['garden'], sign: { text: 'CAFÉ', color: '#ffffff' } } }),
  apartment: bld('Apartments', [2, 1], 5, 'flat', { facade: 'stone', roof: 'membrane', style: { windows: 'punched', balconies: 'front', roofExtras: ['plant', 'solar'] } }),
  warehouse: bld('Warehouse', [3, 2], 1, 'flat', { facade: 'metal', roof: 'membrane', style: { windows: 'none', roofExtras: ['plant', 'solar'] } }, 'garage', false),
  office: bld('Office', [2, 2], 8, 'flat', { facade: 'glass', roof: 'membrane', style: { roofExtras: ['plant'] } }),
  hotel: bld('Hotel', [2, 2], 10, 'flat', { facade: 'ceramic', roof: 'sedum', style: { windows: 'ribbon', balconies: 'all', roofExtras: ['garden', 'plant'], sign: { text: 'HOTEL', color: '#ff4d6d' } } }),
  mall: bld('Shopping mall', [3, 2], 3, 'flat', {
    facade: 'glass',
    roof: 'membrane',
    style: { roofExtras: ['plant', 'solar'], led: { mode: 'ticker', color: '#35e0ff', block: 0, side: 'front', bottom: 1, height: 1, width: 0, offset: 0 }, sign: { text: 'MALL', color: '#ffffff' } },
  }),
  tower: bld('Tower', [2, 2], 14, 'flat', { facade: 'metal', roof: 'membrane', style: { roofExtras: ['plant', 'antenna'] } }),
  skyscraper: bld('Skyscraper', [2, 2], 28, 'flat', {
    facade: 'mirror',
    roof: 'membrane',
    style: { roofExtras: ['helipad', 'antenna'], led: { mode: 'wave', color: '#ff3df0', block: 0, side: 'front', bottom: 20, height: 4, width: 0, offset: 0 } },
  }),

  tree: prop('Tree', 'nature', [0.8, 3, 0.8]),
  pine: prop('Pine', 'nature', [0.8, 3, 0.8]),
  hedge: prop('Hedge', 'nature', [5, 1.2, 1]),
  park: prop('Park', 'nature'),
  fountain: prop('Fountain', 'nature', [3.4, 1, 3.4]),

  lamp: prop('Streetlight', 'street', [0.4, 5, 0.4]),
  bench: prop('Bench', 'street', [2, 0.9, 0.8]),
  busstop: prop('Bus stop', 'street', [3.4, 2.6, 1.4]),
  billboard: prop('LED billboard', 'street', [1.2, 6, 0.8]),
  kiosk: prop('Kiosk', 'street', [2.4, 2.6, 2.4]),
  trafficlight: prop('Traffic light', 'street', [0.4, 5, 0.4]),
  plaza: prop('Plaza', 'street'),
};

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'roads', label: 'Roads' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'nature', label: 'Nature' },
  { id: 'street', label: 'Street' },
];

export const PIECE_TYPES = Object.keys(PIECES) as PieceType[];

/** Footprint after `rot` quarter-turns (odd rotations swap width and depth). */
export function rotatedFootprint(def: PieceDef, rot: number, lot?: [number, number]): [number, number] {
  const [w, d] = lot ?? def.footprint;
  return rot % 2 === 0 ? [w, d] : [d, w];
}

export const DEFAULT_TRIM = '#b5b3ad';
export const DEFAULT_DOOR_COLOR = '#4a3020';

export function lotUnits(lot: [number, number]): [number, number] {
  return [lot[0] * UNITS_PER_CELL, lot[1] * UNITS_PER_CELL];
}

export function defaultBlocks(def: PieceDef, o: StyleOverrides): Block[] {
  const lot = o.lot ?? def.footprint;
  const [lw, ld] = lotUnits(lot);
  return [{ u: 0, v: 0, w: lw, d: ld, floors: o.floors ?? def.floors }];
}

/** Style overrides a freshly placed piece starts with (the preset's look, or just the palette's). */
export function presetStyle(type: PieceType): StyleOverrides {
  return PIECES[type].look?.style ?? {};
}

export function resolveStyle(type: PieceType, o: StyleOverrides): BuildingStyle {
  const def = PIECES[type];
  const lot = o.lot ?? def.footprint;
  const blocks = o.blocks ?? defaultBlocks(def, o);
  const door: DoorSpec = {
    style: def.door ?? 'glass',
    block: 0,
    side: 'front',
    offset: 0,
    canopy: def.canopy ?? true,
    color: DEFAULT_DOOR_COLOR,
    ...o.door,
  };
  if (door.block >= blocks.length) door.block = 0;
  return {
    lot,
    blocks,
    roofStyle: o.roofStyle ?? (def.roof === 'gable' ? 'gable' : 'flat'),
    tint: o.tint ?? '#ffffff',
    windows: o.windows ?? 'punched',
    door,
    trim: o.trim ?? DEFAULT_TRIM,
    led: o.led ?? null,
    roofExtras: o.roofExtras ?? (def.roof === 'flat' ? ['plant'] : []),
    balconies: o.balconies ?? 'none',
    sign: o.sign ?? null,
  };
}

/** Resolves the palette's facade/roof ('preset' = the piece's own look) for a piece type. */
export function resolveLook(
  type: PieceType,
  facade: FacadeId | 'preset',
  roof: RoofId | 'preset',
): { facade: FacadeId; roof: RoofId } {
  const look = PIECES[type].look;
  return {
    facade: facade === 'preset' ? (look?.facade ?? 'plaster') : facade,
    roof: roof === 'preset' ? (look?.roof ?? 'membrane') : roof,
  };
}

/** Footprint of a placed piece after rotation, honouring a custom lot size. */
export function pieceFootprint(piece: { type: PieceType; rot: number; lot?: [number, number] }): [number, number] {
  return rotatedFootprint(PIECES[piece.type], piece.rot, piece.lot);
}

/** A block's walls in the lot's local frame (metres, origin at lot centre, +z = front). */
export interface BlockBox {
  cx: number;
  cz: number;
  w: number;
  d: number;
  h: number;
}

/** World-size box of a block: inset from the lot edge where it touches it. */
export function blockBox(block: Block, lot: [number, number]): BlockBox {
  const [lw, ld] = lotUnits(lot);
  const x0 = block.u * UNIT + (block.u === 0 ? LOT_MARGIN : 0);
  const x1 = (block.u + block.w) * UNIT - (block.u + block.w >= lw ? LOT_MARGIN : 0);
  const z0 = block.v * UNIT + (block.v === 0 ? LOT_MARGIN : 0);
  const z1 = (block.v + block.d) * UNIT - (block.v + block.d >= ld ? LOT_MARGIN : 0);
  return {
    cx: (x0 + x1) / 2 - (lw * UNIT) / 2,
    cz: (z0 + z1) / 2 - (ld * UNIT) / 2,
    w: x1 - x0,
    d: z1 - z0,
    h: block.floors * FLOOR_H,
  };
}

/** Ridge height for the pitched roof of a block box. */
export function roofHeightOf(box: BlockBox): number {
  return gableHeightForSpan(Math.min(box.w, box.d));
}

/** Solid colliders (roam mode): one box per building block, or the prop's single box. */
export function collidersOf(
  type: PieceType,
  style: BuildingStyle,
  scale = 1,
): { cx: number; cz: number; w: number; h: number; d: number }[] {
  const def = PIECES[type];
  if (def.paintable) {
    return style.blocks.map((b) => {
      const box = blockBox(b, style.lot);
      const roofH = style.roofStyle === 'gable' ? roofHeightOf(box) : 0;
      return { cx: box.cx, cz: box.cz, w: box.w, d: box.d, h: box.h + roofH };
    });
  }
  return def.collider
    ? [{ cx: 0, cz: 0, w: def.collider[0] * scale, h: def.collider[1] * scale, d: def.collider[2] * scale }]
    : [];
}

/** Clamps blocks so they fit a lot of the given size, keeping each at least 1 unit. */
export function fitBlocks(blocks: Block[], lot: [number, number]): Block[] {
  const [lw, ld] = lotUnits(lot);
  return blocks.map((b) => {
    const w = Math.max(1, Math.min(b.w, lw));
    const d = Math.max(1, Math.min(b.d, ld));
    return { ...b, w, d, u: Math.max(0, Math.min(b.u, lw - w)), v: Math.max(0, Math.min(b.v, ld - d)) };
  });
}

export type LayoutPreset = 'box' | 'l' | 'u' | 'podium';
export const LAYOUT_PRESETS: { id: LayoutPreset; label: string; minUnits: number }[] = [
  { id: 'box', label: 'Box', minUnits: 1 },
  { id: 'l', label: 'L-shape', minUnits: 2 },
  { id: 'u', label: 'U-shape', minUnits: 3 },
  { id: 'podium', label: 'Podium + tower', minUnits: 3 },
];

/** Ready-made layouts for a lot, using `floors` for the main volume. */
export function layoutPreset(preset: LayoutPreset, lot: [number, number], floors: number): Block[] {
  const [lw, ld] = lotUnits(lot);
  switch (preset) {
    case 'box':
      return [{ u: 0, v: 0, w: lw, d: ld, floors }];
    case 'l': {
      const back = Math.max(1, Math.floor(ld / 2));
      const wing = Math.max(1, Math.floor(lw / 2));
      return [
        { u: 0, v: 0, w: lw, d: back, floors },
        { u: 0, v: back, w: wing, d: ld - back, floors: Math.max(1, floors - 1) },
      ];
    }
    case 'u': {
      const back = Math.max(1, Math.floor(ld / 2));
      const wing = Math.max(1, Math.floor(lw / 3));
      return [
        { u: 0, v: 0, w: lw, d: back, floors },
        { u: 0, v: back, w: wing, d: ld - back, floors: Math.max(1, floors - 1) },
        { u: lw - wing, v: back, w: wing, d: ld - back, floors: Math.max(1, floors - 1) },
      ];
    }
    case 'podium': {
      const tw = Math.max(1, lw - 2);
      const td = Math.max(1, ld - 2);
      return [
        { u: 0, v: 0, w: lw, d: ld, floors: Math.min(2, Math.max(1, floors - 1)) },
        { u: Math.floor((lw - tw) / 2), v: Math.floor((ld - td) / 2), w: tw, d: td, floors },
      ];
    }
  }
}
