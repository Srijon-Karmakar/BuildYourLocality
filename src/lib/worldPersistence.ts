import {
  PAVEMENTS,
  ROAD_SURFACES,
  type RoadSpec,
  BALCONY_MODES,
  CORNER_STYLES,
  CORNICE_STYLES,
  LED_MODES,
  ROOF_EXTRAS,
  type LedSpec,
  LED_ART_H,
  LED_ART_W,
  LED_MAX_ADS,
  LED_MAX_IMAGE_CHARS,
  type LedAd,
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
  BLOCK_TOPS,
  BLOCK_PLANS,
  type DoorSpec,
  type PieceType,
} from '../city/catalog';
import { type Piece } from '../state/useCityStore';
import { TREE_SHAPES, type TreeSpec } from '../city/trees';
import { WALL_CAPS, WALL_OPENINGS, WALL_POSTS, WALL_STYLES, type WallSpec } from '../city/walls';
import { COVERS, MAX_HEIGHT, MIN_HEIGHT, type TerrainCell } from '../terrain/terrain';
import { supabase } from './supabaseClient';
import type { WorldVisibility } from '../state/useWorldsStore';

/** A saved world as listed in the world picker (the city itself is fetched on demand). */
export interface WorldRow {
  id: string;
  name: string;
  updatedAt: number;
  ownerId?: string;
  ownerName?: string;
  visibility?: WorldVisibility;
  publicBuild?: boolean;
  /** Owner only: the invite code and how many friends have joined. */
  joinCode?: string;
  memberCount?: number;
}

/** Postgres "unique violation" / our limit trigger: the database has not been migrated for several worlds yet. */
const friendly = (error: { message: string; code?: string }): string =>
  error.code === '23514'
    ? 'World limit reached: unlock another world slot first.'
    : error.code === '23505'
    ? 'Your database still allows one world per account: run the latest supabase/schema.sql.'
    : error.message;

/** Creates or updates one of the signed-in user's worlds. Pieces go in the `objects` jsonb column. */
export async function pushWorld(
  userId: string,
  id: string,
  name: string,
  pieces: Piece[],
  terrain: Record<string, TerrainCell> = {},
  extra: { visibility?: WorldVisibility; ownerName?: string } = {},
): Promise<string | null> {
  const { error } = await supabase.from('worlds').upsert(
    {
      id,
      owner_id: userId,
      name,
      chunks: { terrain },
      objects: pieces,
      updated_at: new Date().toISOString(),
      ...(extra.visibility ? { visibility: extra.visibility } : {}),
      ...(extra.ownerName ? { owner_name: extra.ownerName } : {}),
    },
    { onConflict: 'id' },
  );
  return error ? friendly(error) : null;
}

const WORLD_COLUMNS = 'id, name, updated_at, owner_id, owner_name, visibility, public_build';

interface RawWorld {
  id: unknown;
  name: unknown;
  updated_at: unknown;
  owner_id?: unknown;
  owner_name?: unknown;
  visibility?: unknown;
  public_build?: unknown;
  join_code?: unknown;
  world_members?: { count: number }[] | null;
}

const toRow = (r: RawWorld): WorldRow => ({
  id: String(r.id),
  name: String(r.name ?? 'My World'),
  updatedAt: Date.parse(String(r.updated_at)) || 0,
  ownerId: r.owner_id ? String(r.owner_id) : undefined,
  ownerName: r.owner_name ? String(r.owner_name) : undefined,
  visibility: r.visibility === 'public' ? 'public' : 'private',
  publicBuild: r.public_build !== false,
  joinCode: r.join_code ? String(r.join_code) : undefined,
  memberCount: r.world_members?.[0]?.count,
});

/** Lists the user's worlds, newest first, without their contents. */
export async function listWorlds(userId: string): Promise<{ worlds: WorldRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('worlds')
    .select(`${WORLD_COLUMNS}, join_code, world_members(count)`)
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });
  if (error) return { worlds: [], error: error.message };
  return { worlds: (data ?? []).map((r) => toRow(r as RawWorld)), error: null };
}

/** Worlds the player joined as a friend (their own are not included). */
export async function listJoinedWorlds(userId: string): Promise<WorldRow[]> {
  const { data, error } = await supabase.from('world_members').select(`worlds(${WORLD_COLUMNS})`).eq('user_id', userId);
  if (error) return [];
  const rows: WorldRow[] = [];
  for (const m of data ?? []) {
    const w = (m as unknown as { worlds: RawWorld | RawWorld[] | null }).worlds;
    const one = Array.isArray(w) ? w[0] : w;
    if (one) rows.push(toRow(one));
  }
  return rows;
}

/** Public worlds for the Community tab, most recently built in first. */
export async function listPublicWorlds(): Promise<{ worlds: WorldRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('worlds')
    .select(WORLD_COLUMNS)
    .eq('visibility', 'public')
    .order('updated_at', { ascending: false })
    .limit(60);
  if (error) return { worlds: [], error: error.message };
  return { worlds: (data ?? []).map((r) => toRow(r as RawWorld)), error: null };
}

/** One world's details (null when it does not exist or is not visible to this player). */
export async function fetchWorldInfo(id: string): Promise<WorldRow | null> {
  const { data } = await supabase.from('worlds').select(`${WORLD_COLUMNS}, join_code`).eq('id', id).maybeSingle();
  return data ? toRow(data as RawWorld) : null;
}

export async function renameWorldRow(userId: string, id: string, name: string): Promise<string | null> {
  const { error } = await supabase.from('worlds').update({ name }).eq('id', id).eq('owner_id', userId);
  return error?.message ?? null;
}

export async function deleteWorldRow(userId: string, id: string): Promise<string | null> {
  const { error } = await supabase.from('worlds').delete().eq('id', id).eq('owner_id', userId);
  return error?.message ?? null;
}

/** Extra world slots the account has unlocked (null when it could not be read). */
export async function fetchExtraSlots(userId: string): Promise<number | null> {
  const { data, error } = await supabase.from('player_limits').select('extra_worlds').eq('user_id', userId).maybeSingle();
  if (error) return null;
  return data ? Math.max(0, Number(data.extra_worlds) || 0) : 0;
}

export async function saveExtraSlots(userId: string, extra: number): Promise<string | null> {
  const { error } = await supabase.from('player_limits').upsert({ user_id: userId, extra_worlds: extra }, { onConflict: 'user_id' });
  return error ? friendly(error) : null;
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
    const num = (v: unknown, min: number, max: number, step: number): number | undefined =>
      typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v)) / step) * step : undefined;
    const base = num(raw.base, 0, MAX_FLOORS, 0.5);
    if (base) block.base = base;
    const round = num(raw.round, 0, 1, 0.05);
    if (round) block.round = round;
    if (raw.bevel === true) block.bevel = true;
    const taper = num(raw.taper, 0, 3, 0.05);
    if (taper !== undefined && taper !== 1) block.taper = taper;
    const twist = num(raw.twist, -720, 720, 1);
    if (twist) block.twist = twist;
    const curve = num(raw.curve, -1, 1, 0.05);
    if (curve) block.curve = curve;
    if (BLOCK_TOPS.some((t) => t.id === raw.top) && raw.top !== 'flat') block.top = raw.top;
    const topH = num(raw.topH, 0, 400, 0.5);
    if (topH) block.topH = topH;
    if (BLOCK_PLANS.some((p) => p.id === raw.plan) && raw.plan !== 'rect') block.plan = raw.plan;
    const sides = num(raw.sides, 3, 16, 1);
    if (sides) block.sides = sides;
    const inner = num(raw.inner, 0.1, 0.9, 0.05);
    if (inner) block.inner = inner;
    const flare = num(raw.flare, -1, 1, 0.05);
    if (flare) block.flare = flare;
    const fw = num(raw.fw, 0.2, 1, 0.05);
    if (fw !== undefined && fw !== 1) block.fw = fw;
    const fd = num(raw.fd, 0.2, 1, 0.05);
    if (fd !== undefined && fd !== 1) block.fd = fd;
    const ox = num(raw.ox, -120, 120, 0.25);
    if (ox) block.ox = ox;
    const oz = num(raw.oz, -120, 120, 0.25);
    if (oz) block.oz = oz;
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
  out.glowAmount = num(raw.glowAmount, 0, 2);
  out.layout = oneOf(raw.layout, ['auto', 'full', 'square', 'wide'] as const);
  out.panels = oneOf(raw.panels, ['same', 'next', 'chase'] as const);
  out.sync = oneOf(raw.sync, ['together', 'chase', 'solo'] as const);
  out.transition = oneOf(raw.transition, ['fade', 'slide', 'cut'] as const);
  out.fit = oneOf(raw.fit, ['contain', 'cover'] as const);
  if (Array.isArray(raw.ads)) {
    const ads = raw.ads
      .slice(0, LED_MAX_ADS)
      .map((a: Partial<LedAd>): LedAd | null => {
        if (!a || typeof a !== 'object') return null;
        const ad: LedAd = {
          text: typeof a.text === 'string' ? a.text.slice(0, 80) : '',
          color: isHex(a.color) ? a.color : '#ffffff',
          bg: isHex(a.bg) ? a.bg : '#000000',
          seconds: typeof a.seconds === 'number' && Number.isFinite(a.seconds) ? Math.min(30, Math.max(1, Math.round(a.seconds))) : 4,
        };
        // Only small pictures made by this game's own resizer are kept.
        if (typeof a.image === 'string' && a.image.length <= LED_MAX_IMAGE_CHARS && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.image)) ad.image = a.image;
        return ad;
      })
      .filter((a: LedAd | null): a is LedAd => !!a);
    if (ads.length > 0) out.ads = ads;
  }
  if (typeof raw.pixels === 'string' && raw.pixels.length === LED_ART_W * LED_ART_H && /^[0-9a-f]+$/.test(raw.pixels)) out.pixels = raw.pixels;
  // Drop unset keys so saved data stays small.
  for (const key of Object.keys(out) as (keyof LedSpec)[]) if (out[key] === undefined) delete out[key];
  return out;
}

function sanitizeTree(tree: unknown): Partial<TreeSpec> | undefined {
  if (!tree || typeof tree !== 'object') return undefined;
  const raw = tree as Partial<TreeSpec>;
  const out: Partial<TreeSpec> = {};
  if (TREE_SHAPES.some((s) => s.id === raw.shape)) out.shape = raw.shape;
  if (isHex(raw.trunk)) out.trunk = raw.trunk;
  if (isHex(raw.leaf)) out.leaf = raw.leaf;
  const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);
  const height = num(raw.height, 0.4, 2.5);
  if (height !== undefined) out.height = height;
  const canopy = num(raw.canopy, 0.4, 2.5);
  if (canopy !== undefined) out.canopy = canopy;
  const fullness = num(raw.fullness, 0, 1);
  if (fullness !== undefined) out.fullness = fullness;
  const lean = num(raw.lean, 0, 1);
  if (lean !== undefined) out.lean = lean;
  const variety = num(raw.variety, 0, 1);
  if (variety !== undefined) out.variety = variety;
  const bloom = num(raw.bloom, 0, 1);
  if (bloom !== undefined) out.bloom = bloom;
  if (isHex(raw.flower)) out.flower = raw.flower;
  if (typeof raw.seed === 'number' && Number.isFinite(raw.seed)) out.seed = Math.floor(Math.abs(raw.seed)) % 100_000_000;
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeWall(wall: unknown): Partial<WallSpec> | undefined {
  if (!wall || typeof wall !== 'object') return undefined;
  const raw = wall as Partial<WallSpec>;
  const out: Partial<WallSpec> = {};
  const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);
  if (WALL_STYLES.some((s) => s.id === raw.style)) out.style = raw.style;
  const height = num(raw.height, 0.5, 6);
  if (height !== undefined) out.height = height;
  const thickness = num(raw.thickness, 0.06, 1.2);
  if (thickness !== undefined) out.thickness = thickness;
  const gap = num(raw.gap, 0, 0.6);
  if (gap !== undefined) out.gap = gap;
  const postEvery = num(raw.postEvery, 0.5, 6);
  if (postEvery !== undefined) out.postEvery = postEvery;
  for (const key of ['colour', 'capColour', 'postColour'] as const) if (isHex(raw[key])) out[key] = raw[key];
  if (WALL_CAPS.some((c) => c.id === raw.cap)) out.cap = raw.cap;
  if (WALL_POSTS.some((p) => p.id === raw.posts)) out.posts = raw.posts;
  if (WALL_OPENINGS.some((o) => o.id === raw.opening)) out.opening = raw.opening;
  if (typeof raw.lights === 'boolean') out.lights = raw.lights;
  return Object.keys(out).length > 0 ? out : undefined;
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
  if (CORNICE_STYLES.some((c) => c.id === p.cornice)) next.cornice = p.cornice;
  if (CORNER_STYLES.some((c) => c.id === p.corners)) next.corners = p.corners;
  if (typeof p.bands === 'boolean') next.bands = p.bands;
  if (Array.isArray(p.offset) && p.offset.length === 2 && p.offset.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    next.offset = [Math.max(-3, Math.min(3, p.offset[0])), Math.max(-3, Math.min(3, p.offset[1]))];
  }
  const road = sanitizeRoad(p.road);
  if (road) next.road = road;
  const sign = sanitizeSign(p.sign);
  if (sign) next.sign = sign;
  if (isHex(p.accent)) next.accent = p.accent;
  const tree = sanitizeTree(p.tree);
  if (tree) next.tree = tree;
  const wall = sanitizeWall(p.wall);
  if (wall) next.wall = wall;
  if (typeof p.scale === 'number' && Number.isFinite(p.scale)) next.scale = Math.min(2, Math.max(0.5, p.scale));
  if (WINDOW_STYLES.some((w) => w.id === p.windows)) next.windows = p.windows;
  return next;
}

/** Validates saved data, dropping anything from older formats this version can't understand. */
export function parsePieces(objects: unknown): Piece[] {
  const saved = Array.isArray(objects) ? (objects as unknown[]) : [];
  return saved.filter(isPiece).map(sanitize);
}

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

/** Fetches one saved world's contents (null pieces when the world no longer exists), or an error message. */
export async function fetchWorld(
  _userId: string,
  id: string,
): Promise<{ pieces: Piece[] | null; terrain: Record<string, TerrainCell>; error: string | null }> {
  const { data, error } = await supabase.from('worlds').select('objects, chunks').eq('id', id).maybeSingle();
  if (error) return { pieces: null, terrain: {}, error: error.message };
  return { pieces: data ? parsePieces(data.objects) : null, terrain: data ? parseTerrain(data.chunks) : {}, error: null };
}

export interface WalletRow {
  tokens: number;
  unlocks: string[];
}

/** The player's tokens and unlocks, or null when they could not be read. */
export async function fetchWallet(userId: string): Promise<WalletRow | null> {
  const { data, error } = await supabase.from('player_limits').select('tokens, unlocks').eq('user_id', userId).maybeSingle();
  if (error) return null;
  return {
    tokens: Math.max(0, Math.floor(Number(data?.tokens) || 0)),
    unlocks: Array.isArray(data?.unlocks) ? data.unlocks.filter((u: unknown): u is string => typeof u === 'string') : [],
  };
}

export async function saveWallet(userId: string, wallet: WalletRow): Promise<string | null> {
  const { error } = await supabase.from('player_limits').upsert({ user_id: userId, tokens: wallet.tokens, unlocks: wallet.unlocks }, { onConflict: 'user_id' });
  return error?.message ?? null;
}

// --- Community and co-op ----------------------------------------------------------------------

/** Saves only what changed, so players building in the same world do not overwrite each other. */
export interface WorldPatch {
  pieces: Piece[];
  removedPieces: string[];
  cells: Record<string, TerrainCell>;
  removedCells: string[];
}

export const patchIsEmpty = (p: WorldPatch) =>
  p.pieces.length === 0 && p.removedPieces.length === 0 && p.removedCells.length === 0 && Object.keys(p.cells).length === 0;

export async function pushPatch(worldId: string, patch: WorldPatch): Promise<string | null> {
  const { error } = await supabase.rpc('apply_world_patch', {
    p_world: worldId,
    p_pu: patch.pieces,
    p_pr: patch.removedPieces,
    p_tu: patch.cells,
    p_tr: patch.removedCells,
  });
  return error?.message ?? null;
}

export async function setWorldVisibility(userId: string, id: string, visibility: WorldVisibility): Promise<string | null> {
  const { error } = await supabase.from('worlds').update({ visibility }).eq('id', id).eq('owner_id', userId);
  return error?.message ?? null;
}

/** Public worlds only: whether visitors may build, or only explore. */
export async function setWorldPublicBuild(userId: string, id: string, publicBuild: boolean): Promise<string | null> {
  const { error } = await supabase.from('worlds').update({ public_build: publicBuild }).eq('id', id).eq('owner_id', userId);
  return error?.message ?? null;
}

/** Joins a private world with its invite code. Resolves to the world id, or an error message. */
export async function joinWorldByCode(code: string, name: string): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('join_world_by_code', { p_code: code, p_name: name });
  return error ? { id: null, error: error.message } : { id: String(data), error: null };
}

/** Asks a world's owner for access. Resolves to the world's name, or an error message. */
export async function requestWorldJoin(worldId: string, name: string): Promise<{ worldName: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('request_world_join', { p_world: worldId, p_name: name });
  return error ? { worldName: null, error: error.message } : { worldName: String(data), error: null };
}

export interface PersonRow {
  userId: string;
  name: string;
}

export async function listMembers(worldId: string): Promise<PersonRow[]> {
  const { data } = await supabase.from('world_members').select('user_id, name').eq('world_id', worldId).order('joined_at');
  return (data ?? []).map((r) => ({ userId: String(r.user_id), name: String(r.name) }));
}

export async function listRequests(worldId: string): Promise<PersonRow[]> {
  const { data } = await supabase.from('world_requests').select('user_id, name').eq('world_id', worldId).order('created_at');
  return (data ?? []).map((r) => ({ userId: String(r.user_id), name: String(r.name) }));
}

export async function resolveRequest(worldId: string, userId: string, approve: boolean): Promise<string | null> {
  const { error } = await supabase.rpc('resolve_world_request', { p_world: worldId, p_user: userId, p_approve: approve });
  return error?.message ?? null;
}

/** Owner removes a friend, or a friend leaves (their own id). */
export async function removeMember(worldId: string, userId: string): Promise<string | null> {
  const { error } = await supabase.from('world_members').delete().eq('world_id', worldId).eq('user_id', userId);
  return error?.message ?? null;
}

export async function regenerateJoinCode(worldId: string): Promise<{ code: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('regenerate_join_code', { p_world: worldId });
  return error ? { code: null, error: error.message } : { code: String(data), error: null };
}
