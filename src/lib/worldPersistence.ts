import {
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
import { useCityStore, type Piece } from '../state/useCityStore';
import { supabase } from './supabaseClient';

/**
 * Saves the city to the signed-in user's single world row. Pieces go in the existing
 * `objects` jsonb column; `chunks` (the old voxel format) is left empty.
 */
export async function saveWorld(userId: string): Promise<string | null> {
  const pieces = Object.values(useCityStore.getState().pieces);
  const { error } = await supabase.from('worlds').upsert(
    {
      owner_id: userId,
      chunks: {},
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
  if (WINDOW_STYLES.some((w) => w.id === p.windows)) next.windows = p.windows;
  return next;
}

/** Loads the user's saved city, dropping anything from older formats it can't understand. */
export async function loadWorld(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('worlds')
    .select('objects')
    .eq('owner_id', userId)
    .maybeSingle();
  if (error) return error.message;
  if (!data) return 'No saved city yet — save one first.';

  const saved = Array.isArray(data.objects) ? (data.objects as unknown[]) : [];
  const pieces = saved.filter(isPiece).map(sanitize);
  useCityStore.getState().setPieces(pieces);
  return null;
}
