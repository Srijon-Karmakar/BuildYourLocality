import type { TreeSpec } from './trees';
import type { WallSpec } from './walls';
import type { SpanSpec } from './spans';

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
  { id: 'whitebrick', label: 'White brick', swatch: '#e2ded6' },
  { id: 'basketweave', label: 'Basketweave brick', swatch: '#a8553b' },
  { id: 'limestone', label: 'Limestone blocks', swatch: '#e0d3b4' },
  { id: 'stucco', label: 'Warm stucco', swatch: '#d9966a' },
  { id: 'rammed', label: 'Rammed earth', swatch: '#b0805c' },
  { id: 'shingle', label: 'Cedar shingles', swatch: '#8a684a' },
  { id: 'marble', label: 'White marble', swatch: '#ecece8' },
  { id: 'subway', label: 'Glazed tile', swatch: '#3f9aa6' },
  { id: 'perforated', label: 'Perforated metal', swatch: '#a8865c' },
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

export type WindowStyle = 'punched' | 'arched' | 'iwan' | 'shuttered' | 'loft' | 'slit' | 'round' | 'ribbon' | 'tall' | 'none';
export const WINDOW_STYLES: { id: WindowStyle; label: string }[] = [
  { id: 'punched', label: 'Classic' },
  { id: 'arched', label: 'Arched' },
  { id: 'iwan', label: 'Pointed arch (iwan)' },
  { id: 'shuttered', label: 'Shuttered' },
  { id: 'loft', label: 'Loft grid' },
  { id: 'slit', label: 'Slits' },
  { id: 'round', label: 'Portholes' },
  { id: 'ribbon', label: 'Ribbon' },
  { id: 'tall', label: 'Floor-to-ceiling' },
  { id: 'none', label: 'None' },
];

export const MIN_FLOORS = 1;
export const MAX_FLOORS = 200;

export const ROOFS = [
  { id: 'membrane', label: 'White membrane', swatch: '#d9dcdc' },
  { id: 'solar', label: 'Solar panels', swatch: '#1f3a5f' },
  { id: 'sedum', label: 'Green roof', swatch: '#6f8f4e' },
  { id: 'slate', label: 'Slate', swatch: '#4a5568' },
  { id: 'terracotta', label: 'Terracotta', swatch: '#b4553a' },
  { id: 'green', label: 'Green metal', swatch: '#4f7a4a' },
  { id: 'gravel', label: 'Gravel', swatch: '#8a8a85' },
  { id: 'asphalt', label: 'Asphalt shingle', swatch: '#46464a' },
  { id: 'shake', label: 'Cedar shake', swatch: '#7f6244' },
  { id: 'copper', label: 'Aged copper', swatch: '#4fa08a' },
  { id: 'thatch', label: 'Thatch', swatch: '#b08e50' },
  { id: 'concrete', label: 'Concrete tile', swatch: '#969690' },
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
  | 'wall'
  | 'span'
  | 'tree'
  | 'pine'
  | 'birch'
  | 'palm'
  | 'willow'
  | 'blossom'
  | 'cypress'
  | 'bush'
  | 'grass'
  | 'tallgrass'
  | 'wildflower'
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
  | 'plaza'
  // transit
  | 'rail'
  | 'station'
  | 'crossing'
  | 'metrotrack'
  | 'metroentrance'
  | 'tram'
  | 'tramstop'
  | 'monorail'
  | 'monostation'
  // airport
  | 'runway'
  | 'taxiway'
  | 'apron'
  | 'terminal'
  | 'hangar'
  | 'controltower'
  // services and port
  | 'parking'
  | 'taxistand'
  | 'busdepot'
  | 'pier'
  | 'portcrane'
  | 'containers'
  // city services
  | 'police'
  | 'firestation'
  | 'hospital'
  | 'school';

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

export type Category = 'roads' | 'bridges' | 'buildings' | 'nature' | 'walls' | 'street' | 'transit' | 'airport' | 'port' | 'services';

// --- Roads -------------------------------------------------------------------------

export type RoadSurface = 'asphalt' | 'concrete' | 'dirt' | 'cobble';
export const ROAD_SURFACES: { id: RoadSurface; label: string; swatch: string }[] = [
  { id: 'asphalt', label: 'Asphalt', swatch: '#3c3f44' },
  { id: 'concrete', label: 'Concrete', swatch: '#8c8f93' },
  { id: 'cobble', label: 'Cobblestone', swatch: '#6e6a63' },
  { id: 'dirt', label: 'Dirt track', swatch: '#7a5b3a' },
];

export type Pavement = 'none' | 'curb' | 'wide';
export const PAVEMENTS: { id: Pavement; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'curb', label: 'Curb' },
  { id: 'wide', label: 'Wide' },
];

/** Everything about how one road cell looks and how traffic uses it. */
export interface RoadSpec {
  /** Total lanes, 1-6. Three or more makes a wide road that claims the cell on each side. */
  lanes: number;
  surface: RoadSurface;
  pavement: Pavement;
  /** Index into N, E, S, W of the only direction of travel, or null for two-way. */
  oneWay: number | null;
  /** Raised central divider (two-way roads with 3+ lanes). */
  median: boolean;
  bikeLanes: boolean;
  busLanes: boolean;
  /** Zebra crossings painted across each arm of a junction. */
  crosswalk: boolean;
  /** A zebra crossing across this cell of a straight road: cars give way to people on it. */
  zebra: boolean;
  /** Street trees along the pavement. */
  trees: boolean;
  /** A junction cell with this set becomes a roundabout. */
  roundabout: boolean;
  /** Speed limit, km/h. */
  speed: number;
}

export const DEFAULT_ROAD: RoadSpec = {
  lanes: 2,
  surface: 'asphalt',
  pavement: 'curb',
  oneWay: null,
  median: false,
  bikeLanes: false,
  busLanes: false,
  crosswalk: false,
  zebra: false,
  trees: false,
  roundabout: false,
  speed: 40,
};

export const MIN_LANES = 1;
export const MAX_LANES = 6;

export const resolveRoad = (o?: Partial<RoadSpec>): RoadSpec => ({ ...DEFAULT_ROAD, ...o });

/** Quick-start road types shown in the road palette. */
export const ROAD_PRESETS: { id: string; label: string; icon: string; spec: Partial<RoadSpec> }[] = [
  { id: 'street', label: 'Street', icon: 'street', spec: { lanes: 2, pavement: 'curb', speed: 40 } },
  { id: 'lane', label: 'Lane', icon: 'lane', spec: { lanes: 1, pavement: 'curb', speed: 25 } },
  { id: 'avenue', label: 'Avenue', icon: 'avenue', spec: { lanes: 4, median: true, pavement: 'wide', crosswalk: true, trees: true, speed: 50 } },
  { id: 'boulevard', label: 'Boulevard', icon: 'boulevard', spec: { lanes: 6, median: true, pavement: 'wide', crosswalk: true, trees: true, busLanes: true, bikeLanes: true, speed: 50 } },
  { id: 'highway', label: 'Highway', icon: 'highway', spec: { lanes: 6, median: true, pavement: 'none', surface: 'asphalt', speed: 100 } },
  { id: 'oneway', label: 'One-way', icon: 'oneway', spec: { lanes: 2, oneWay: 2, pavement: 'curb', speed: 40 } },
  { id: 'zebra', label: 'Zebra crossing', icon: 'zebra', spec: { zebra: true, pavement: 'curb', speed: 30 } },
  { id: 'roundabout', label: 'Roundabout', icon: 'roundabout', spec: { lanes: 2, roundabout: true, crosswalk: true, pavement: 'curb', speed: 30 } },
  { id: 'dirt', label: 'Dirt track', icon: 'dirt', spec: { lanes: 1, surface: 'dirt', pavement: 'none', speed: 20 } },
];

export interface RoadLayout {
  /** Cells across including the pavement: 1 (6 m) or 3 (18 m). */
  cellsWide: 1 | 3;
  /** Total width in metres, pavements included. */
  width: number;
  /** Pavement width each side. */
  pavement: number;
  /** Median width (0 if none). */
  median: number;
  laneWidth: number;
  /** Lanes available to a vehicle in one direction. */
  perDir: number;
  /** Lane-centre offsets to the right of the direction of travel, in metres. */
  laneOffsets: number[];
  /** Speed limit in world units per second. */
  speedLimit: number;
}

/** Works out where lanes, pavements and the median sit across a road of this spec. */
export function roadLayout(spec: RoadSpec): RoadLayout {
  const lanes = Math.min(MAX_LANES, Math.max(MIN_LANES, Math.round(spec.lanes)));
  const wide = lanes >= 3;
  const width = wide ? 18 : 6;
  const oneWay = spec.oneWay !== null;
  const median = spec.median && wide && !oneWay ? 1.2 : 0;
  // Two-way roads always have a lane each way; an odd lane count adds a centre turn lane.
  const physical = oneWay ? lanes : lanes <= 2 ? 2 : Math.floor(lanes / 2) * 2 + (lanes % 2);
  const wantedPav = spec.pavement === 'none' ? 0 : spec.pavement === 'curb' ? (wide ? 1.5 : 1) : wide ? 3 : 1.4;
  const laneWidth = Math.min(3.6, Math.max(2.2, (width - median - 2 * wantedPav) / physical));
  const pavement = spec.pavement === 'none' ? 0 : Math.max(0, Math.min(wantedPav, (width - median - physical * laneWidth) / 2));
  const perDir = oneWay ? lanes : Math.max(1, Math.floor(lanes / 2));
  const laneOffsets: number[] = [];
  if (oneWay) {
    for (let i = 0; i < lanes; i++) laneOffsets.push((i - (lanes - 1) / 2) * laneWidth);
  } else {
    const start = median / 2 + (lanes > 2 && lanes % 2 ? laneWidth / 2 : 0);
    for (let i = 0; i < perDir; i++) laneOffsets.push(start + (i + 0.5) * laneWidth);
  }
  return {
    cellsWide: wide ? 3 : 1,
    width,
    pavement,
    median,
    laneWidth,
    perDir,
    laneOffsets,
    speedLimit: Math.max(2.5, spec.speed / 6),
  };
}

// --- Building customisation ------------------------------------------------------

export const MIN_LOT = 1;
export const MAX_LOT = 40;
export const MAX_BLOCKS = 32;

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
  /** Storeys this block is lifted off the ground (it sits on top of another block). 0 = on the ground. */
  base?: number;
  /** Corner rounding 0-1: 0 square, 1 as round as the footprint allows (a circle on a square block). */
  round?: number;
  /** Corners are cut flat instead of curved (octagons and the like). */
  bevel?: boolean;
  /** Size at the top relative to the bottom (1 = straight sides). */
  taper?: number;
  /** Degrees the top is turned relative to the bottom. */
  twist?: number;
  /** -1 to 1: narrows (-) or swells (+) the middle of the walls. */
  curve?: number;
  /** What crowns the block. */
  top?: BlockTop;
  /** Height of the crown in metres (0 or unset = sized from the block). */
  topH?: number;
  /** Footprint outline; unset = a (rounded) rectangle or oval. */
  plan?: BlockPlan;
  /** Polygon and star: how many sides / points. */
  sides?: number;
  /** Star: inner radius ratio. Cross and Y: arm thickness. 0.1 - 0.9. */
  inner?: number;
  /** -1 to 1: widens (+) or narrows (-) the foot of the walls, like a flared base. */
  flare?: number;
  /** Fine size: fraction of the grid space the block fills (0.2 - 1). */
  fw?: number;
  fd?: number;
  /** Fine position: metres moved within the grid space. */
  ox?: number;
  oz?: number;
}

export type BlockPlan = 'rect' | 'poly' | 'star' | 'cross' | 'y';
export const BLOCK_PLANS: { id: BlockPlan; label: string }[] = [
  { id: 'rect', label: 'Box / oval' },
  { id: 'poly', label: 'Polygon' },
  { id: 'star', label: 'Star' },
  { id: 'cross', label: 'Cross' },
  { id: 'y', label: 'Y shape' },
];

export type BlockTop = 'flat' | 'dome' | 'onion' | 'cone' | 'spire';
export const BLOCK_TOPS: { id: BlockTop; label: string }[] = [
  { id: 'flat', label: 'Flat' },
  { id: 'dome', label: 'Dome' },
  { id: 'onion', label: 'Onion dome' },
  { id: 'cone', label: 'Cone / pyramid' },
  { id: 'spire', label: 'Spire' },
];

/** Does this block need the custom shaped body (anything beyond a plain straight box)? */
export function isShaped(b: Block): boolean {
  return !!((b.plan && b.plan !== 'rect') || b.flare || b.round || b.bevel || (b.taper !== undefined && b.taper !== 1) || b.twist || b.curve || (b.top && b.top !== 'flat'));
}

/** Metres of crown above a block's walls. */
export function capHeightOf(b: Block, w: number, d: number): number {
  const top = b.top ?? 'flat';
  if (top === 'flat') return 0;
  if (b.topH && b.topH > 0) return b.topH;
  const r = (Math.min(w, d) / 2) * (b.taper ?? 1);
  const k = { dome: 1, onion: 1.7, cone: 2, spire: 4.5 }[top];
  return Math.max(1.5, r * k);
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

export type LedMode =
  | 'wave'
  | 'ticker'
  | 'bars'
  | 'checker'
  | 'pulse'
  | 'solid'
  | 'text'
  | 'slides'
  | 'ads'
  | 'clock'
  | 'weather'
  | 'rainbow'
  | 'plasma'
  | 'matrix'
  | 'stripes'
  | 'draw';

export const LED_MODES: { id: LedMode; label: string; icon: string }[] = [
  { id: 'text', label: 'Message', icon: 'led-text' },
  { id: 'ticker', label: 'Scrolling text', icon: 'led-ticker' },
  { id: 'ads', label: 'Ad playlist', icon: 'led-ads' },
  { id: 'slides', label: 'Slideshow', icon: 'led-slides' },
  { id: 'draw', label: 'Pixel art', icon: 'led-draw' },
  { id: 'clock', label: 'Clock', icon: 'led-clock' },
  { id: 'weather', label: 'Weather', icon: 'led-weather' },
  { id: 'wave', label: 'Colour wave', icon: 'led-wave' },
  { id: 'rainbow', label: 'Rainbow', icon: 'led-rainbow' },
  { id: 'plasma', label: 'Plasma', icon: 'led-plasma' },
  { id: 'matrix', label: 'Matrix rain', icon: 'led-matrix' },
  { id: 'stripes', label: 'Stripes', icon: 'led-stripes' },
  { id: 'bars', label: 'Equaliser', icon: 'led-bars' },
  { id: 'checker', label: 'Pixels', icon: 'led-checker' },
  { id: 'pulse', label: 'Pulse', icon: 'led-pulse' },
  { id: 'solid', label: 'Solid', icon: 'led-solid' },
];

export type LedDetail = 'low' | 'medium' | 'high';
export type LedDots = 'square' | 'round' | 'smooth';
export type LedFont = 'bold' | 'mono' | 'serif' | 'round' | 'pixel';
export type LedScroll = 'none' | 'left' | 'right' | 'up' | 'down';
export type LedBezel = 'none' | 'thin' | 'thick';

/** How a screen is cut into pictures: one for the whole screen, or a stack / row of equal panels. */
export type LedLayout = 'auto' | 'full' | 'square' | 'wide';
/** What the panels do relative to each other. */
export type LedPanels = 'same' | 'next' | 'chase';
/** How screens keep time with each other. */
export type LedSync = 'together' | 'chase' | 'solo';
export type LedTransition = 'fade' | 'slide' | 'cut';
export type LedFit = 'contain' | 'cover';

/** One ad in a playlist: a message, or a picture (with an optional caption). */
export interface LedAd {
  text: string;
  /** A small picture as a data URL (see lib/ledImage). */
  image?: string;
  color: string;
  bg: string;
  /** Seconds on screen at normal speed. */
  seconds: number;
}

export const LED_MAX_ADS = 8;

/** Billboards: an unlimited stack of layers (text and shapes) painted over the screen's look. */
export type LedLayerKind = 'text' | 'rect' | 'ellipse' | 'line';
export type LedLayerAnim = 'none' | 'pulse' | 'blink' | 'scrollx' | 'scrolly' | 'spin' | 'rainbow';

export interface LedLayer {
  id: string;
  kind: LedLayerKind;
  /** Centre of the layer, 0 to 1 across and down the screen. */
  x: number;
  y: number;
  /** Size, as a share of the screen (text: w is ignored and h is the letter height). */
  w: number;
  h: number;
  /** Degrees. */
  rot: number;
  color: string;
  /** Second colour: a left-to-right gradient when it is set. */
  color2?: string;
  /** 0.05 to 1. */
  opacity: number;
  text?: string;
  font?: LedFont;
  anim: LedLayerAnim;
  /** Animation speed, 0.25 to 3. */
  speed: number;
}

export const LED_LAYER_KINDS: { id: LedLayerKind; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'rect', label: 'Box' },
  { id: 'ellipse', label: 'Circle' },
  { id: 'line', label: 'Line' },
];
export const LED_LAYER_ANIMS: { id: LedLayerAnim; label: string }[] = [
  { id: 'none', label: 'Still' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'blink', label: 'Blink' },
  { id: 'scrollx', label: 'Slide across' },
  { id: 'scrolly', label: 'Slide up' },
  { id: 'spin', label: 'Spin' },
  { id: 'rainbow', label: 'Rainbow' },
];
/** There is no real limit: this only stops a runaway paste from freezing the screen. */
export const LED_MAX_LAYERS = 400;

/** The billboard's own structure: how big it is, how it stands and how it faces. */
export interface BoardSpec {
  /** Screen width and height, metres. */
  w: number;
  h: number;
  /** Height of the supports, metres (the screen sits on top). */
  mast: number;
  poles: 'two' | 'one' | 'none';
  /** Degrees the screen leans back (negative: forward). */
  tilt: number;
  sides: 'two' | 'one';
  /** Frame thickness, metres. */
  thick: number;
}

export const BOARD_DEFAULT: BoardSpec = { w: 7.5, h: 3.5, mast: 5.6, poles: 'two', tilt: 0, sides: 'two', thick: 0.4 };
export const resolveBoard = (b?: Partial<BoardSpec>): BoardSpec => ({ ...BOARD_DEFAULT, ...b });
/** Longest picture data URL kept on an ad, in characters. */
export const LED_MAX_IMAGE_CHARS = 48_000;

export const LED_DEFAULT_ADS: LedAd[] = [
  { text: 'YOUR AD HERE', color: '#ffe066', bg: '#1a0a2e', seconds: 4 },
  { text: '50% OFF TODAY', color: '#ff6b6b', bg: '#06142b', seconds: 3 },
  { text: 'OPEN 24/7', color: '#35e0ff', bg: '#001018', seconds: 3 },
];

/** Pixel-art canvas size (columns x rows) for the "Pixel art" mode. */
export const LED_ART_W = 32;
export const LED_ART_H = 16;
/** Palette for pixel art: index 0 is "off", F is "the screen colour". */
export const LED_ART_PALETTE = ['#000000', '#ffffff', '#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#00d1b2', '#32d4ff', '#2f6bff', '#6b4cff', '#bf5af2', '#ff4fa3', '#8e5a3c', '#8e8e93', '#3a3a3c', '#35e0ff'];

/** A big LED screen mounted on one wall of a building (or on a billboard / bus stop). */
export interface LedSpec {
  mode: LedMode;
  color: string;
  /** Message for the text, scrolling text and slideshow modes. Slides are separated by "|". */
  text?: string;
  /** Second colour (gradients, stripes, alternating slides). Defaults to the main colour. */
  color2?: string;
  /** Colour of the unlit pixels. */
  bg?: string;
  /** Animation speed, 0.25 to 3 (1 = normal). */
  speed?: number;
  /** Glow strength, 0.4 to 3 (1 = normal). */
  brightness?: number;
  /** Pixel density: low is chunky and cheap, high is fine and sharp. */
  detail?: LedDetail;
  /** How each pixel looks. */
  dots?: LedDots;
  font?: LedFont;
  /** Text height as a share of the screen height, 0.3 to 0.95. */
  textSize?: number;
  scroll?: LedScroll;
  /** Frame around the screen. */
  bezel?: LedBezel;
  frame?: string;
  /** Switch on only after dark. */
  power?: 'always' | 'night';
  /** Soft light spilling around the screen at night. */
  glow?: boolean;
  /** How far the light reaches and how strong it is, 0 - 2 (1 = normal). */
  glowAmount?: number;
  /** How the screen is divided into pictures (auto: tall screens become stacked square panels). */
  layout?: LedLayout;
  /** With several panels: show the same thing, the next ad on each, or the same thing a beat apart. */
  panels?: LedPanels;
  /** Keeping time with other screens: together (one shared clock), chasing round the building, or on its own. */
  sync?: LedSync;
  transition?: LedTransition;
  /** Pictures and pixel art: fit whole inside the screen, or fill it and crop. */
  fit?: LedFit;
  /** The playlist for the "Ad playlist" mode. */
  ads?: LedAd[];
  /** Pixel art, one hex digit per pixel (see LED_ART_PALETTE), row by row. */
  pixels?: string;
  /** Billboards: layers painted over the look, and the structure of the board itself. */
  layers?: LedLayer[];
  board?: Partial<BoardSpec>;
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

/** A LedSpec with every optional look setting filled in. */
export type ResolvedLed = LedSpec &
  Required<Pick<LedSpec, 'text' | 'color2' | 'bg' | 'speed' | 'brightness' | 'detail' | 'dots' | 'font' | 'textSize' | 'scroll' | 'bezel' | 'frame' | 'power' | 'glow' | 'glowAmount' | 'layout' | 'panels' | 'sync' | 'transition' | 'fit' | 'ads' | 'pixels'>>;

export const LED_DEFAULT_TEXT = 'APNAGALI CITY  *  OPEN 24/7  *  WELCOME';

export function resolveLed(spec: LedSpec): ResolvedLed {
  return {
    ...spec,
    text: spec.text ?? LED_DEFAULT_TEXT,
    color2: spec.color2 ?? spec.color,
    bg: spec.bg ?? '#000000',
    speed: spec.speed ?? 1,
    brightness: spec.brightness ?? 1,
    detail: spec.detail ?? 'medium',
    dots: spec.dots ?? 'square',
    font: spec.font ?? 'bold',
    textSize: spec.textSize ?? 0.62,
    scroll: spec.scroll ?? (spec.mode === 'ticker' ? 'left' : 'none'),
    bezel: spec.bezel ?? 'thin',
    frame: spec.frame ?? '#1c1f24',
    power: spec.power ?? 'always',
    glow: spec.glow ?? true,
    glowAmount: spec.glowAmount ?? 1,
    layout: spec.layout ?? 'auto',
    panels: spec.panels ?? 'same',
    sync: spec.sync ?? 'together',
    transition: spec.transition ?? 'fade',
    fit: spec.fit ?? 'contain',
    ads: spec.ads && spec.ads.length > 0 ? spec.ads : LED_DEFAULT_ADS,
    pixels: spec.pixels ?? '',
  };
}

/** One-tap looks for the LED editor: they set the content and style together; placement is untouched. */
export const LED_PRESETS: { id: string; label: string; icon: string; spec: Partial<LedSpec> }[] = [
  { id: 'neon', label: 'Neon sign', icon: 'look-neon', spec: { mode: 'text', text: 'OPEN', color: '#ff2fd0', color2: '#ff2fd0', bg: '#12020f', dots: 'smooth', detail: 'high', font: 'round', textSize: 0.7, scroll: 'none', glow: true, brightness: 1.4 } },
  { id: 'stocks', label: 'News ticker', icon: 'look-news', spec: { mode: 'ticker', text: 'BREAKING  *  NEW PARK OPENS DOWNTOWN  *  TRAFFIC LIGHT UPGRADE COMPLETE  *  ', color: '#ffb000', bg: '#000000', dots: 'square', detail: 'medium', font: 'mono', textSize: 0.7, scroll: 'left', speed: 1.2 } },
  { id: 'cinema', label: 'Cinema', icon: 'look-cinema', spec: { mode: 'slides', text: 'NOW SHOWING|MIDNIGHT CITY|8 PM  10 PM', color: '#ffe066', color2: '#ff6b6b', bg: '#0a0614', dots: 'round', detail: 'medium', font: 'serif', textSize: 0.55, glow: true } },
  { id: 'ads', label: 'Ad rotation', icon: 'led-ads', spec: { mode: 'ads', dots: 'round', detail: 'medium', font: 'bold', textSize: 0.5, glow: true, brightness: 1.3, ads: LED_DEFAULT_ADS } },
  { id: 'clock', label: 'City clock', icon: 'led-clock', spec: { mode: 'clock', color: '#35e0ff', bg: '#00060a', dots: 'round', detail: 'medium', font: 'mono', textSize: 0.7 } },
  { id: 'weather', label: 'Weather', icon: 'led-weather', spec: { mode: 'weather', color: '#ffe066', color2: '#8fd3ff', bg: '#000814', dots: 'round', detail: 'medium', textSize: 0.5 } },
  { id: 'retro', label: 'Retro arcade', icon: 'look-retro', spec: { mode: 'matrix', color: '#4dff7a', bg: '#000a02', dots: 'square', detail: 'low', speed: 1 } },
  { id: 'rainbow', label: 'Rainbow wall', icon: 'led-rainbow', spec: { mode: 'rainbow', dots: 'smooth', detail: 'high', bg: '#000000', speed: 1 } },
  { id: 'club', label: 'Club lights', icon: 'look-club', spec: { mode: 'plasma', color: '#ff2fd0', color2: '#35e0ff', bg: '#05000f', dots: 'round', detail: 'medium', speed: 1.5, glow: true, power: 'night' } },
];

/** Most screens one building can carry (all four sides, a couple of rows each). */
export const MAX_LEDS = 8;


export type RoofExtra = 'plant' | 'antenna' | 'solar' | 'garden' | 'helipad' | 'chimney' | 'watertank' | 'skylight';
export const ROOF_EXTRAS: { id: RoofExtra; label: string }[] = [
  { id: 'plant', label: 'AC units' },
  { id: 'antenna', label: 'Antenna' },
  { id: 'solar', label: 'Solar array' },
  { id: 'garden', label: 'Roof garden' },
  { id: 'helipad', label: 'Helipad' },
  { id: 'chimney', label: 'Chimney' },
  { id: 'watertank', label: 'Water tank' },
  { id: 'skylight', label: 'Skylight' },
];

/** Moulding that runs round the top of the walls. */
export type CorniceStyle = 'none' | 'ledge' | 'classic';
export const CORNICE_STYLES: { id: CorniceStyle; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'ledge', label: 'Ledge' },
  { id: 'classic', label: 'Classic' },
];

/** What dresses the vertical corners of the walls. */
export type CornerStyle = 'none' | 'quoins' | 'pilasters';
export const CORNER_STYLES: { id: CornerStyle; label: string }[] = [
  { id: 'none', label: 'Plain' },
  { id: 'quoins', label: 'Quoin stones' },
  { id: 'pilasters', label: 'Pilasters' },
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
  /** Older saves and props: a single screen. `leds` takes over when present. */
  led?: LedSpec | null;
  /** Screens on the building, one or more per side. */
  leds?: LedSpec[];
  roofExtras?: RoofExtra[];
  balconies?: BalconyMode;
  /** Detailing: moulding under the roof, corner treatment, and a trim band at every floor line. */
  cornice?: CorniceStyle;
  corners?: CornerStyle;
  bands?: boolean;
  sign?: SignSpec | null;
  /** Roads: lanes, surface, pavements, markings and rules (merged over DEFAULT_ROAD). */
  road?: Partial<RoadSpec>;
  /** Props: main colour (foliage, paint, water, ...) and size multiplier. */
  accent?: string;
  scale?: number;
  /** Trees: shape, colours and the pattern number that shapes every lobe and branch. */
  tree?: Partial<TreeSpec>;
  /** Walls and fences: style, size, colours, caps, posts and openings. */
  wall?: Partial<WallSpec>;
  /** Bridges, overpasses and viaducts: path, deck, supports and look. */
  span?: Partial<SpanSpec>;
}

export interface BuildingStyle {
  lot: [number, number];
  blocks: Block[];
  roofStyle: 'flat' | 'gable';
  tint: string;
  windows: WindowStyle;
  door: DoorSpec;
  trim: string;
  /** The first screen (props use just this one). */
  led: LedSpec | null;
  leds: LedSpec[];
  roofExtras: RoofExtra[];
  balconies: BalconyMode;
  cornice: CorniceStyle;
  corners: CornerStyle;
  bands: boolean;
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

/** An airport building: customisable like any other, but listed under Airport. */
const airportBuilding = (...args: Parameters<typeof bld>): PieceDef => ({ ...bld(...args), category: 'airport' });

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

/** Rail, station, crossing and metro pieces: fixed-look pieces that connect into networks. */
const transit = (label: string, collider?: [number, number, number]): PieceDef => ({
  label,
  category: 'transit',
  footprint: [1, 1],
  floors: 0,
  roof: 'none',
  paintable: false,
  customisable: false,
  collider,
});

export const PIECES: Record<PieceType, PieceDef> = {
  road: { label: 'Road', category: 'roads', footprint: [1, 1], floors: 0, roof: 'none', paintable: false, customisable: true },

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

  wall: prop('Wall', 'walls'),
  span: { label: 'Bridge', category: 'bridges', footprint: [1, 1], floors: 0, roof: 'none', paintable: false, customisable: true },
  tree: prop('Tree', 'nature', [0.8, 3, 0.8]),
  pine: prop('Pine', 'nature', [0.8, 3, 0.8]),
  birch: prop('Birch', 'nature', [0.8, 3, 0.8]),
  palm: prop('Palm', 'nature', [0.8, 3, 0.8]),
  willow: prop('Willow', 'nature', [0.8, 3, 0.8]),
  blossom: prop('Cherry blossom', 'nature', [0.8, 3, 0.8]),
  cypress: prop('Cypress', 'nature', [0.8, 3, 0.8]),
  bush: prop('Bush', 'nature', [1.2, 1, 1.2]),
  grass: prop('Grass', 'nature'),
  tallgrass: prop('Tall grass', 'nature'),
  wildflower: prop('Wildflowers', 'nature'),
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

  rail: transit('Rail track'),
  station: transit('Station'),
  crossing: transit('Level crossing'),
  metrotrack: transit('Metro line'),
  metroentrance: transit('Metro entrance', [3.4, 3.2, 3.4]),
  tram: transit('Tram track'),
  tramstop: transit('Tram stop'),
  monorail: transit('Monorail'),
  monostation: transit('Monorail station'),

  runway: { ...transit('Runway'), category: 'airport' },
  taxiway: { ...transit('Taxiway'), category: 'airport' },
  apron: { ...transit('Apron / stand'), category: 'airport' },
  terminal: airportBuilding('Terminal', [3, 2], 3, 'flat', {
    facade: 'glass',
    roof: 'membrane',
    style: { roofExtras: ['plant', 'solar'], sign: { text: 'AIRPORT', color: '#35e0ff' }, balconies: 'none' },
  }),
  hangar: airportBuilding('Hangar', [3, 2], 2, 'flat', { facade: 'metal', roof: 'membrane', style: { windows: 'none', roofExtras: ['plant'] } }, 'garage', false),
  parking: { ...transit('Parking lot'), footprint: [2, 2] },
  taxistand: transit('Taxi stand', [2.6, 3, 1.4]),
  busdepot: { ...bld('Bus depot', [3, 2], 1, 'flat', { facade: 'concrete', roof: 'membrane', style: { windows: 'none', roofExtras: ['plant', 'solar'], sign: { text: 'BUS DEPOT', color: '#f2b134' } } }, 'garage', false), category: 'transit' },
  pier: { ...transit('Pier'), category: 'port' },
  portcrane: { ...transit('Port crane', [3.6, 14, 3.6]), category: 'port' },
  containers: { ...transit('Containers', [5.2, 5.5, 5.2]), category: 'port' },
  controltower: airportBuilding('Control tower', [1, 1], 9, 'flat', {
    facade: 'concrete',
    roof: 'membrane',
    style: { windows: 'ribbon', roofExtras: ['antenna'], tint: '#d7d9dc' },
  }),
  police: { ...bld('Police station', [2, 1], 2, 'flat', { facade: 'stone', roof: 'membrane', style: { windows: 'punched', roofExtras: ['antenna'], sign: { text: 'POLICE', color: '#4da3ff' } } }), category: 'services' },
  firestation: { ...bld('Fire station', [2, 1], 2, 'flat', { facade: 'ceramic', roof: 'membrane', style: { windows: 'punched', roofExtras: ['plant'], sign: { text: 'FIRE', color: '#ff5a3c' } } }, 'garage', false), category: 'services' },
  hospital: { ...bld('Hospital', [2, 2], 5, 'flat', { facade: 'plaster', roof: 'membrane', style: { windows: 'ribbon', roofExtras: ['helipad', 'plant'], sign: { text: 'HOSPITAL', color: '#ff4d6d' } } }), category: 'services' },
  school: { ...bld('School', [2, 2], 2, 'flat', { facade: 'plaster', roof: 'membrane', style: { windows: 'tall', roofExtras: ['solar'], sign: { text: 'SCHOOL', color: '#ffd23f' } } }), category: 'services' },
};

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'roads', label: 'Roads' },
  { id: 'bridges', label: 'Bridges' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'nature', label: 'Nature' },
  { id: 'walls', label: 'Walls' },
  { id: 'street', label: 'Street' },
  { id: 'services', label: 'Services' },
  { id: 'transit', label: 'Transit' },
  { id: 'airport', label: 'Airport' },
  { id: 'port', label: 'Port' },
];

export const PIECE_TYPES = Object.keys(PIECES) as PieceType[];

/**
 * Pieces that may be planted over other things: several trees to a cell, or a tree in the garden
 * of a building. They do not claim their cell, so whatever stands there stays put.
 */
export const TREE_TYPES: PieceType[] = ['tree', 'pine', 'birch', 'palm', 'willow', 'blossom', 'cypress', 'bush'];
/** Ground cover: walkable, and just as freely planted over other things. */
export const GRASS_TYPES: PieceType[] = ['grass', 'tallgrass', 'wildflower'];
/** Every plant the tree editor and the forest brush deal with. */
export const PLANT_TYPES: PieceType[] = [...TREE_TYPES, ...GRASS_TYPES];
export const isTreeType = (type: PieceType) => PLANT_TYPES.includes(type);
/** Streetlights and traffic lights stand over roads, pavements and plots too, at a corner of the cell. */
export const OVERLAY_TYPES: PieceType[] = [...PLANT_TYPES, 'lamp', 'trafficlight'];
/** Overlays that stand at a cell corner (the cursor picks which) instead of being scattered. */
export const CORNER_TYPES: PieceType[] = ['lamp', 'trafficlight'];
export const isCornerType = (type: PieceType) => CORNER_TYPES.includes(type);
/** How far from the cell centre a corner piece stands, in metres (just inside the cell edge). */
export const CORNER_REACH = CELL / 2 - 0.45;
export const isOverlay = (type: PieceType) => OVERLAY_TYPES.includes(type);

/** Pieces an overlay can never sit on: they carry traffic. */
export const keepsClear = (type: PieceType) => ROAD_LIKE.includes(type) || ['transit', 'airport', 'port'].includes(PIECES[type].category);

/** Pieces that sit on the ground like a road: level land, or water (as a bridge). */
export const ROAD_LIKE: PieceType[] = ['road', 'rail', 'crossing', 'metrotrack', 'pier', 'tram', 'monorail'];

const BIT = { N: 1, E: 2, S: 4, W: 8 } as const;

/**
 * Which sides of a level crossing carry the road and which the railway. An even turn runs the
 * road north-south and the rail east-west; an odd turn swaps them.
 */
export function crossingArms(rot: number, family: 'road' | 'rail'): number {
  const roadNS = rot % 2 === 0;
  const ns = BIT.N | BIT.S;
  const ew = BIT.E | BIT.W;
  return family === 'road' ? (roadNS ? ns : ew) : roadNS ? ew : ns;
}

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
    led: (o.leds ?? (o.led ? [o.led] : []))[0] ?? null,
    leds: o.leds ?? (o.led ? [o.led] : []),
    roofExtras: o.roofExtras ?? (def.roof === 'flat' ? ['plant'] : []),
    balconies: o.balconies ?? 'none',
    cornice: o.cornice ?? 'none',
    corners: o.corners ?? 'none',
    bands: o.bands ?? false,
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
  /** Height of the block's underside above the lot slab. */
  y: number;
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
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const w = (x1 - x0) * clamp(block.fw ?? 1, 0.2, 1);
  const d = (z1 - z0) * clamp(block.fd ?? 1, 0.2, 1);
  const slackX = (x1 - x0 - w) / 2;
  const slackZ = (z1 - z0 - d) / 2;
  return {
    y: (block.base ?? 0) * FLOOR_H,
    cx: (x0 + x1) / 2 - (lw * UNIT) / 2 + clamp(block.ox ?? 0, -slackX, slackX),
    cz: (z0 + z1) / 2 - (ld * UNIT) / 2 + clamp(block.oz ?? 0, -slackZ, slackZ),
    w,
    d,
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
): { cx: number; cz: number; w: number; h: number; d: number; cy?: number }[] {
  const def = PIECES[type];
  if (def.paintable) {
    return style.blocks.flatMap((b) => {
      const box = blockBox(b, style.lot);
      if (isShaped(b)) {
        // Shaped walls are approximated by a few stacked boxes that follow the taper, plus one for the crown.
        const taper = b.taper ?? 1;
        const slices = taper !== 1 || b.curve ? 3 : 1;
        const out: { cx: number; cz: number; w: number; h: number; d: number; cy?: number }[] = [];
        for (let i = 0; i < slices; i++) {
          const t = (i + 0.5) / slices;
          const s = Math.max(0.1, (1 + (taper - 1) * t) * (1 + 0.35 * (b.curve ?? 0) * Math.sin(Math.PI * t)));
          const h = box.h / slices;
          out.push({ cx: box.cx, cz: box.cz, w: box.w * s * 0.96, d: box.d * s * 0.96, h, cy: box.y + i * h + h / 2 });
        }
        const cap = capHeightOf(b, box.w, box.d);
        if (cap > 0) {
          const s = Math.max(0.1, taper) * 0.6;
          out.push({ cx: box.cx, cz: box.cz, w: box.w * s, d: box.d * s, h: cap * 0.6, cy: box.y + box.h + cap * 0.3 });
        }
        return out;
      }
      const roofH = style.roofStyle === 'gable' ? roofHeightOf(box) : 0;
      return [{ cx: box.cx, cz: box.cz, w: box.w, d: box.d, h: box.h + roofH, cy: box.y + (box.h + roofH) / 2 }];
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
