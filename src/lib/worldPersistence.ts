import {
  PAVEMENTS,
  ROAD_SURFACES,
  type RoadSpec,
  BALCONY_MODES,
  LED_MODES,
  ROOF_EXTRAS,
  type LedSpec,
  LED_ART_H,
  LED_ART_W,
  MAX_LEDS,
  type SignSpec,
  DOOR_SIDES,
  DOOR_STYLES,
  FACADES,
  MAX_BLOCKS,
  MAX_FLOORS,
  MAX_LOT,
  MIN_LOT,
  PIECES,
  ROOFS,
  WINDOW_STYLES,
  lotUnits,
  type Block,
  type DoorSpec,
  type PieceType,
} from '../city/catalog';
import { type Piece } from '../state/useCityStore';
import { COVERS, MAX_HEIGHT, MIN_HEIGHT, type TerrainCell } from '../terrain/terrain';
import { supabase } from './supabaseClient';

/**
 * Writes the city to the signed-in user's single world row. Pieces go in the existing
 * `objects` jsonb column; `chunks` (the old voxel format) is left empty.
 */
export async function pushPieces(userId: string, pieces: Piece[], terrain: Record<string, TerrainCell> = {}): Promise<string | null> {
  const { error } = await supabase.from('worlds').upsert(
    {
      owner_id: userId,
      chunks: { terrain },
      objects: pieces,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'owner_id' },
  );
  return error?.message ?? null;
}

const isPiece = (value: unknown): value is Piece => {
  const p = value as Partial<Piece> | null;
  return (
    !!p &&
    typeof p.id === 'string' &&
    typeof p.gx === 'number' &&
    typeof p.gz === 'number' &&
    typeof p.rot === 'number' &&
    typeof p.type === 'string' &&
    p.type in PIECES
  );
};

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const clampInt = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

function sanitizeLot(lot: unknown): [number, number] | undefined {
  if (!Array.isArray(lot) || lot.length !== 2) return undefined;
  return [clampInt(lot[0], MIN_LOT, MAX_LOT, 1), clampInt(lot[1], MIN_LOT, MAX_LOT, 1)];
}

function sanitizeBlocks(blocks: unknown, lot: [number, number]): Block[] | undefined {
  if (!Array.isArray(blocks) || blocks.length === 0) return undefined;
  const [lw, ld] = lotUnits(lot);
  return blocks.slice(0, MAX_BLOCKS).map((raw: Partial<Block>) => {
    const w = clampInt(raw.w, 1, lw, lw);
    const d = clampInt(raw.d, 1, ld, ld);
    const block: Block = {
      w,
      d,
      u: clampInt(raw.u, 0, lw - w, 0),
      v: clampInt(raw.v, 0, ld - d, 0),
      floors: clampInt(raw.floors, 1, MAX_FLOORS, 1),
    };
    if (FACADES.some((f) => f.id === raw.facade)) block.facade = raw.facade;
    return block;
  });
}

function sanitizeDoor(door: unknown): Partial<DoorSpec> | undefined {
  if (!door || typeof door !== 'object') return undefined;
  const raw = door as Partial<DoorSpec>;
  const out: Partial<DoorSpec> = {};
  if (DOOR_STYLES.some((s) => s.id === raw.style)) out.style = raw.style;
  if (DOOR_SIDES.some((s) => s.id === raw.side)) out.side = raw.side;
  if (typeof raw.block === 'number' && raw.block >= 0) out.block = Math.floor(raw.block);
  if (typeof raw.offset === 'number' && Number.isFinite(raw.offset)) out.offset = raw.offset;
  if (typeof raw.canopy === 'boolean') out.canopy = raw.canopy;
  if (isHex(raw.color)) out.color = raw.color;
  return out;
}

function sanitizeLed(led: unknown): LedSpec | undefined {
  if (!led || typeof led !== 'object') return undefined;
  const raw = led as Partial<LedSpec>;
  if (!LED_MODES.some((m) => m.id === raw.mode) || !DOOR_SIDES.some((sd) => sd.id === raw.side)) return undefined;
  const out: LedSpec = {
    mode: raw.mode!,
    side: raw.side!,
    color: isHex(raw.color) ? raw.color : '#35e0ff',
    block: clampInt(raw.block, 0, MAX_BLOCKS - 1, 0),
    bottom: clampInt(raw.bottom, 0, MAX_FLOORS - 1, 0),
    height: clampInt(raw.height, 1, MAX_FLOORS, 1),
    width: typeof raw.width === 'number' && raw.width >= 0 ? Math.min(raw.width, 40) : 0,
    offset: typeof raw.offset === 'number' && Number.isFinite(raw.offset) ? raw.offset : 0,
  };
  // Look settings are all optional: keep only the ones that are valid.
  const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list.includes(v as T) ? (v as T) : undefined);
  const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);
  if (typeof raw.text === 'string') out.text = raw.text.slice(0, 120);
  if (isHex(raw.color2)) out.color2 = raw.color2;
  if (isHex(raw.bg)) out.bg = raw.bg;
  if (isHex(raw.frame)) out.frame = raw.frame;
  out.speed = num(raw.speed, 0.25, 3);
  out.brightness = num(raw.brightness, 0.4, 3);
  out.textSize = num(raw.textSize, 0.3, 0.95);
  out.detail = oneOf(raw.detail, ['low', 'medium', 'high'] as const);
  out.dots = oneOf(raw.dots, ['square', 'round', 'smooth'] as const);
  out.font = oneOf(raw.font, ['bold', 'mono', 'serif', 'round', 'pixel'] as const);
  out.scroll = oneOf(raw.scroll, ['none', 'left', 'right', 'up', 'down'] as const);
  out.bezel = oneOf(raw.bezel, ['none', 'thin', 'thick'] as const);
  out.power = oneOf(raw.power, ['always', 'night'] as const);
  if (typeof raw.glow === 'boolean') out.glow = raw.glow;
  if (typeof raw.pixels === 'string' && raw.pixels.length === LED_ART_W * LED_ART_H && /^[0-9a-f]+$/.test(raw.pixels)) out.pixels = raw.pixels;
  // Drop unset keys so saved data stays small.
  for (const key of Object.keys(out) as (keyof LedSpec)[]) if (out[key] === undefined) delete out[key];
  return out;
}

function sanitizeSign(sign: unknown): SignSpec | undefined {
  if (!sign || typeof sign !== 'object') return undefined;
  const raw = sign as Partial<SignSpec>;
  if (typeof raw.text !== 'string') return undefined;
  return { text: raw.text.slice(0, 14), color: isHex(raw.color) ? raw.color : '#ffffff' };
}

function sanitizeRoad(road: unknown): Partial<RoadSpec> | undefined {
  if (!road || typeof road !== 'object') return undefined;
  const raw = road as Partial<RoadSpec>;
  const out: Partial<RoadSpec> = {};
  if (typeof raw.lanes === 'number') out.lanes = clampInt(raw.lanes, 1, 6, 2);
  if (ROAD_SURFACES.some((x) => x.id === raw.surface)) out.surface = raw.surface;
  if (PAVEMENTS.some((x) => x.id === raw.pavement)) out.pavement = raw.pavement;
  if (raw.oneWay === null || (typeof raw.oneWay === 'number' && raw.oneWay >= 0 && raw.oneWay <= 3)) out.oneWay = raw.oneWay;
  for (const flag of ['median', 'bikeLanes', 'busLanes', 'crosswalk', 'zebra', 'trees', 'roundabout'] as const) {
    if (typeof raw[flag] === 'boolean') out[flag] = raw[flag];
  }
  if (typeof raw.speed === 'number') out.speed = clampInt(raw.speed, 10, 120, 40);
  return out;
}

/** Falls back to defaults for any material / style id this version does not know. */
function sanitize(p: Piece): Piece {
  const facade = FACADES.some((f) => f.id === p.facade) ? p.facade : 'brick';
  const roof = ROOFS.some((r) => r.id === p.roof) ? p.roof : 'gravel';
  const next: Piece = { id: p.id, type: p.type as PieceType, gx: p.gx, gz: p.gz, rot: ((p.rot % 4) + 4) % 4, facade, roof };
  if (typeof p.floors === 'number') next.floors = p.floors;
  if (p.roofStyle === 'flat' || p.roofStyle === 'gable') next.roofStyle = p.roofStyle;
  if (isHex(p.tint)) next.tint = p.tint;
  if (isHex(p.trim)) next.trim = p.trim;
  const lot = sanitizeLot(p.lot);
  if (lot) next.lot = lot;
  const blocks = sanitizeBlocks(p.blocks, lot ?? PIECES[p.type].footprint);
  if (blocks) next.blocks = blocks;
  const door = sanitizeDoor(p.door);
  if (door) next.door = door;
  const led = sanitizeLed(p.led);
  if (led) next.led = led;
  if (Array.isArray(p.leds)) {
    next.leds = p.leds.map(sanitizeLed).filter((l): l is LedSpec => !!l).slice(0, MAX_LEDS);
  }
  if (Array.isArray(p.roofExtras)) {
    next.roofExtras = p.roofExtras.filter((e) => ROOF_EXTRAS.some((x) => x.id === e));
  }
  if (BALCONY_MODES.some((m) => m.id === p.balconies)) next.balconies = p.balconies;
  const road = sanitizeRoad(p.road);
  if (road) next.road = road;
  const sign = sanitizeSign(p.sign);
  if (sign) next.sign = sign;
  if (isHex(p.accent)) next.accent = p.accent;
  if (typeof p.scale === 'number' && Number.isFinite(p.scale)) next.scale = Math.min(2, Math.max(0.5, p.scale));
  if (WINDOW_STYLES.some((w) => w.id === p.windows)) next.windows = p.windows;
  return next;
}

/** Validates saved data, dropping anything from older formats this version can't understand. */
export function parsePieces(objects: unknown): Piece[] {
  const saved = Array.isArray(objects) ? (objects as unknown[]) : [];
  return saved.filter(isPiece).map(sanitize);
}

/** Fetches the user's saved city: `null` when they have none yet, or an error message. */
/** Validates saved terrain edits (heights clamped, unknown covers dropped). */
export function parseTerrain(chunks: unknown): Record<string, TerrainCell> {
  const raw = (chunks as { terrain?: unknown } | null)?.terrain;
  const out: Record<string, TerrainCell> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, TerrainCell>)) {
    if (!/^-?\d+,-?\d+$/.test(key) || !value || typeof value !== 'object') continue;
    const cell: TerrainCell = {};
    if (typeof value.h === 'number' && Number.isFinite(value.h)) cell.h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, value.h));
    if (COVERS.includes(value.cover as never)) cell.cover = value.cover;
    if (cell.h !== undefined || cell.cover) out[key] = cell;
  }
  return out;
}

export async function fetchPieces(
  userId: string,
): Promise<{ pieces: Piece[] | null; terrain: Record<string, TerrainCell>; error: string | null }> {
  const { data, error } = await supabase.from('worlds').select('objects, chunks').eq('owner_id', userId).maybeSingle();
  if (error) return { pieces: null, terrain: {}, error: error.message };
  return { pieces: data ? parsePieces(data.objects) : null, terrain: data ? parseTerrain(data.chunks) : {}, error: null };
}
