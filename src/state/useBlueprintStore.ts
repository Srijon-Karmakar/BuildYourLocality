import { create } from 'zustand';
import { PIECES, pieceFootprint } from '../city/catalog';
import { useCityStore, type Piece } from './useCityStore';

/** A saved piece of city: pieces placed relative to its top-left corner, ready to stamp anywhere. */
export type BlueprintPiece = Omit<Piece, 'id'>;

export interface Blueprint {
  id: string;
  name: string;
  /** Size in cells. */
  w: number;
  d: number;
  pieces: BlueprintPiece[];
}

const KEY = 'yatc.blueprints.v1';
const MAX_PIECES = 400;
const MAX_BLUEPRINTS = 30;
/** Longest share code accepted, in characters. */
const MAX_CODE = 600_000;
const PREFIX = 'YATC1:';

interface BlueprintState {
  items: Blueprint[];
  /** The blueprint the Blueprints tool is about to stamp. */
  activeId: string | null;
  message: string | null;
  /** Saves the pieces with these ids (the current selection). Returns an error message, or null when saved. */
  saveFrom: (ids: string[], name: string) => string | null;
  remove: (id: string) => void;
  activate: (id: string | null) => void;
  exportCode: (id: string) => string | null;
  importCode: (code: string) => string | null;
}

function load(): Blueprint[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Blueprint[];
    return Array.isArray(raw) ? raw.filter((b) => b && Array.isArray(b.pieces)) : [];
  } catch {
    return [];
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** Moves pieces so the top-left of their bounding box is (0, 0) and measures its size. */
function normalise(list: BlueprintPiece[]): { pieces: BlueprintPiece[]; w: number; d: number } {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of list) {
    const [fw, fd] = pieceFootprint(p);
    minX = Math.min(minX, p.gx);
    minZ = Math.min(minZ, p.gz);
    maxX = Math.max(maxX, p.gx + fw);
    maxZ = Math.max(maxZ, p.gz + fd);
  }
  return { pieces: list.map((p) => ({ ...p, gx: p.gx - minX, gz: p.gz - minZ })), w: maxX - minX, d: maxZ - minZ };
}

/** Checks pieces that came from outside (a share code): only known kinds, whole-number cells, a sane size. */
function clean(list: unknown): BlueprintPiece[] | null {
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_PIECES) return null;
  const out: BlueprintPiece[] = [];
  for (const raw of list) {
    const p = raw as BlueprintPiece;
    if (!p || typeof p !== 'object' || !(p.type in PIECES) || p.type === 'span') return null;
    if (!Number.isInteger(p.gx) || !Number.isInteger(p.gz) || Math.abs(p.gx) > 200 || Math.abs(p.gz) > 200) return null;
    if (!Number.isInteger(p.rot) || p.rot < 0 || p.rot > 3) return null;
    if (typeof p.facade !== 'string' || typeof p.roof !== 'string') return null;
    const { id: _id, ...rest } = p as BlueprintPiece & { id?: string };
    void _id;
    out.push(rest as BlueprintPiece);
  }
  return out;
}

export const useBlueprintStore = create<BlueprintState>((set, get) => ({
  items: load(),
  activeId: null,
  message: null,
  saveFrom: (ids, name) => {
    const pieces = useCityStore.getState().pieces;
    const chosen = ids.map((id) => pieces[id]).filter((p): p is Piece => !!p && p.type !== 'span');
    if (chosen.length === 0) return 'Select some pieces first (Edit tool, then click or drag over them).';
    if (chosen.length > MAX_PIECES) return `Too big: a blueprint holds up to ${MAX_PIECES} pieces.`;
    if (get().items.length >= MAX_BLUEPRINTS) return `You can keep ${MAX_BLUEPRINTS} blueprints. Delete one first.`;
    const { pieces: rel, w, d } = normalise(chosen.map(({ id: _id, ...rest }) => (void _id, rest)));
    const bp: Blueprint = { id: uid(), name: name.trim().slice(0, 40) || `Blueprint ${get().items.length + 1}`, w, d, pieces: rel };
    set((s) => ({ items: [...s.items, bp], activeId: bp.id }));
    return null;
  },
  remove: (id) => set((s) => ({ items: s.items.filter((b) => b.id !== id), activeId: s.activeId === id ? null : s.activeId })),
  activate: (activeId) => set({ activeId }),
  exportCode: (id) => {
    const bp = get().items.find((b) => b.id === id);
    if (!bp) return null;
    try {
      return PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify({ n: bp.name, p: bp.pieces }))));
    } catch {
      return null;
    }
  },
  importCode: (code) => {
    const text = code.trim();
    if (!text.startsWith(PREFIX)) return 'That is not a blueprint code (it should start with YATC1:).';
    if (text.length > MAX_CODE) return 'That code is too large.';
    if (get().items.length >= MAX_BLUEPRINTS) return `You can keep ${MAX_BLUEPRINTS} blueprints. Delete one first.`;
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(text.slice(PREFIX.length))))) as { n?: unknown; p?: unknown };
      const pieces = clean(data.p);
      if (!pieces) return 'The code is damaged, or uses pieces this version does not have.';
      const { pieces: rel, w, d } = normalise(pieces);
      const bp: Blueprint = { id: uid(), name: (typeof data.n === 'string' ? data.n : 'Imported').slice(0, 40), w, d, pieces: rel };
      set((s) => ({ items: [...s.items, bp], activeId: bp.id }));
      return null;
    } catch {
      return 'The code could not be read.';
    }
  },
}));

useBlueprintStore.subscribe((s, prev) => {
  if (s.items === prev.items) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s.items));
  } catch {
    /* storage full or blocked */
  }
});
