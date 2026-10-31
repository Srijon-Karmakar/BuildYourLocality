import { useState, type ReactNode } from 'react';
import {
  DOOR_SIDES,
  DOOR_STYLES,
  FACADES,
  LAYOUT_PRESETS,
  MAX_BLOCKS,
  MAX_FLOORS,
  MAX_LOT,
  MIN_FLOORS,
  MIN_LOT,
  PIECES,
  ROOFS,
  TINTS,
  UNIT,
  WINDOW_STYLES,
  blockBox,
  layoutPreset,
  lotUnits,
  resolveStyle,
  type Block,
  type DoorSpec,
  type LayoutPreset,
} from '../city/catalog';
import { maxDoorOffset } from '../city/models';
import { useBuilderStore } from '../state/useBuilderStore';
import { useCityStore } from '../state/useCityStore';
import { useGameStore } from '../state/useGameStore';

type Tab = 'walls' | 'layout' | 'door' | 'roof';
const TABS: { id: Tab; label: string }[] = [
  { id: 'walls', label: 'Walls' },
  { id: 'layout', label: 'Layout' },
  { id: 'door', label: 'Door' },
  { id: 'roof', label: 'Roof' },
];

const swatch = (active: boolean) =>
  `h-6 w-6 rounded-full border-2 transition ${active ? 'scale-110 border-white' : 'border-white/20 hover:border-white/60'}`;
const chip = (active: boolean) =>
  `rounded-md px-2 py-1 transition disabled:opacity-30 ${active ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'}`;

/** Snaps each colour channel to a multiple of 8, so dragging a picker can't create unbounded materials. */
function quantize(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const snap = (v: number) => Math.min(255, Math.round(v / 8) * 8);
  const out = (snap((n >> 16) & 255) << 16) | (snap((n >> 8) & 255) << 8) | snap(n & 255);
  return '#' + out.toString(16).padStart(6, '0');
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-white/55">{title}</div>
      {children}
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-white/70">{label}</span>
      <div className="flex items-center gap-1.5">
        <button className={chip(false) + ' w-6 text-center'} disabled={value - step < min - 1e-6} onClick={() => onChange(value - step)}>
          −
        </button>
        <span className="w-14 text-center tabular-nums">{format ? format(value) : value}</span>
        <button className={chip(false) + ' w-6 text-center'} disabled={value + step > max + 1e-6} onClick={() => onChange(value + step)}>
          +
        </button>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-white/70">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(quantize(e.target.value))}
        className="h-7 w-12 cursor-pointer rounded border border-white/20 bg-transparent"
      />
    </label>
  );
}

/** Full building editor: walls, layout (lot, blocks, floors), doors and roof, plus move/rotate/delete. */
export function BuildingInspector() {
  const mode = useGameStore((s) => s.mode);
  const selectedId = useBuilderStore((s) => s.selectedId);
  const selectedBlock = useBuilderStore((s) => s.selectedBlock);
  const movingId = useBuilderStore((s) => s.movingId);
  const { select, selectBlock, startMove, cancelMove } = useBuilderStore.getState();
  const piece = useCityStore((s) => (selectedId ? s.pieces[selectedId] : undefined));
  const { updatePiece, removeById, setLot, movePiece } = useCityStore.getState();
  const [tab, setTab] = useState<Tab>('walls');
  const [note, setNote] = useState<string | null>(null);

  if (mode !== 'build' || !piece || !PIECES[piece.type].paintable) return null;

  if (movingId) {
    return (
      <div className="pointer-events-auto absolute right-4 top-20 w-64 rounded-xl bg-black/65 p-4 text-xs text-white backdrop-blur-sm">
        Click a free spot to place the building. <span className="text-white/60">R rotates, Esc cancels.</span>
        <button className={chip(false) + ' mt-3 w-full'} onClick={cancelMove}>
          Cancel move
        </button>
      </div>
    );
  }

  const def = PIECES[piece.type];
  const style = resolveStyle(piece.type, piece);
  const blockIndex = Math.min(selectedBlock, style.blocks.length - 1);
  const block = style.blocks[blockIndex];
  const [lw, ld] = lotUnits(style.lot);
  const patch = (p: Parameters<typeof updatePiece>[1]) => updatePiece(piece.id, p);
  const setBlocks = (blocks: Block[]) => patch({ blocks });
  const editBlock = (change: Partial<Block>) =>
    setBlocks(style.blocks.map((b, i) => (i === blockIndex ? { ...b, ...change } : b)));
  const setDoor = (change: Partial<DoorSpec>) => patch({ door: { ...style.door, ...change } });

  const changeLot = (lot: [number, number]) => {
    setNote(setLot(piece.id, lot) ? null : 'Neighbouring cells are occupied.');
  };
  const applyPreset = (preset: LayoutPreset) => {
    setBlocks(layoutPreset(preset, style.lot, Math.max(...style.blocks.map((b) => b.floors))));
    selectBlock(0);
  };
  const addBlock = () => {
    if (style.blocks.length >= MAX_BLOCKS) return;
    const fresh: Block = { u: lw - 1, v: ld - 1, w: 1, d: 1, floors: Math.max(MIN_FLOORS, block.floors - 1) };
    setBlocks([...style.blocks, fresh]);
    selectBlock(style.blocks.length);
  };
  const removeBlock = () => {
    if (style.blocks.length <= 1) return;
    setBlocks(style.blocks.filter((_, i) => i !== blockIndex));
    // The door follows block indices; keep it on a block that still exists.
    if (style.door.block >= blockIndex && style.door.block > 0) setDoor({ block: style.door.block - 1 });
    selectBlock(Math.max(0, blockIndex - 1));
  };
  const rotate = () => {
    const ok = movePiece(piece.id, piece.gx, piece.gz, (piece.rot + 1) % 4);
    setNote(ok ? null : 'No room to rotate here.');
  };

  const doorBox = blockBox(style.blocks[style.door.block] ?? style.blocks[0], style.lot);
  const doorWall = style.door.side === 'front' || style.door.side === 'back' ? doorBox.w : doorBox.d;
  const doorMax = maxDoorOffset(doorWall);

  return (
    <div className="pointer-events-auto absolute right-4 top-20 flex max-h-[calc(100vh-7rem)] w-72 flex-col gap-3 overflow-y-auto rounded-xl bg-black/70 p-4 text-xs text-white backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{def.label}</span>
        <button className="text-white/50 hover:text-white" onClick={() => select(null)} title="Close (Esc)">
          ✕
        </button>
      </div>

      <div className="flex gap-1.5">
        <button className={chip(false) + ' flex-1'} onClick={() => startMove(piece.id, piece.rot)}>
          Move
        </button>
        <button className={chip(false) + ' flex-1'} onClick={rotate}>
          Rotate
        </button>
      </div>

      <div className="flex gap-1 rounded-lg bg-white/5 p-1">
        {TABS.map((t) => (
          <button key={t.id} className={chip(tab === t.id) + ' flex-1'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {note && <div className="rounded-md bg-amber-500/20 px-2 py-1 text-amber-200">{note}</div>}

      {tab === 'walls' && (
        <>
          <Section title="Wall texture">
            <div className="flex flex-wrap gap-1.5">
              {FACADES.map((f) => (
                <button
                  key={f.id}
                  title={f.label}
                  className={swatch(piece.facade === f.id)}
                  style={{ backgroundColor: f.swatch }}
                  onClick={() => patch({ facade: f.id })}
                />
              ))}
            </div>
          </Section>
          <Section title="Wall colour">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {TINTS.map((t) => (
                <button
                  key={t.id}
                  title={t.label}
                  className={swatch(style.tint === t.id)}
                  style={{ backgroundColor: t.id }}
                  onClick={() => patch({ tint: t.id })}
                />
              ))}
            </div>
            <ColorField label="Custom colour" value={style.tint} onChange={(tint) => patch({ tint })} />
          </Section>
          <Section title="Window style">
            <div className="flex flex-wrap gap-1.5">
              {WINDOW_STYLES.map((w) => (
                <button key={w.id} className={chip(style.windows === w.id)} onClick={() => patch({ windows: w.id })}>
                  {w.label}
                </button>
              ))}
            </div>
          </Section>
          <ColorField label="Trim colour" value={style.trim} onChange={(trim) => patch({ trim })} />
        </>
      )}

      {tab === 'layout' && (
        <>
          <Section title="Lot size (grid cells)">
            <div className="flex flex-col gap-1.5">
              <Stepper label="Width" value={style.lot[0]} min={MIN_LOT} max={MAX_LOT} onChange={(v) => changeLot([v, style.lot[1]])} />
              <Stepper label="Depth" value={style.lot[1]} min={MIN_LOT} max={MAX_LOT} onChange={(v) => changeLot([style.lot[0], v])} />
            </div>
          </Section>

          <Section title="Layout">
            <div className="flex flex-wrap gap-1.5">
              {LAYOUT_PRESETS.map((p) => (
                <button key={p.id} className={chip(false)} disabled={Math.min(lw, ld) < p.minUnits} onClick={() => applyPreset(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title={`Blocks (${style.blocks.length}/${MAX_BLOCKS})`}>
            <div className="flex flex-wrap items-center gap-1.5">
              {style.blocks.map((_, i) => (
                <button key={i} className={chip(i === blockIndex) + ' w-7 text-center'} onClick={() => selectBlock(i)}>
                  {i + 1}
                </button>
              ))}
              <button className={chip(false)} disabled={style.blocks.length >= MAX_BLOCKS} onClick={addBlock}>
                + Add
              </button>
              <button className={chip(false)} disabled={style.blocks.length <= 1} onClick={removeBlock}>
                Remove
              </button>
            </div>
          </Section>

          <div className="flex flex-col gap-1.5 rounded-lg bg-white/5 p-2.5">
            <div className="text-white/55">Block {blockIndex + 1} (highlighted in yellow)</div>
            <Stepper label="Floors" value={block.floors} min={MIN_FLOORS} max={MAX_FLOORS} onChange={(floors) => editBlock({ floors })} />
            <Stepper label="Position X" value={block.u} min={0} max={lw - block.w} onChange={(u) => editBlock({ u })} format={(v) => `${v * UNIT} m`} />
            <Stepper label="Position Z" value={block.v} min={0} max={ld - block.d} onChange={(v) => editBlock({ v })} format={(v) => `${v * UNIT} m`} />
            <Stepper label="Width" value={block.w} min={1} max={lw - block.u} onChange={(w) => editBlock({ w })} format={(v) => `${v * UNIT} m`} />
            <Stepper label="Depth" value={block.d} min={1} max={ld - block.v} onChange={(d) => editBlock({ d })} format={(v) => `${v * UNIT} m`} />
            <div className="mt-1 text-white/55">Wall texture for this block</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button className={chip(!block.facade)} onClick={() => editBlock({ facade: undefined })}>
                Same
              </button>
              {FACADES.map((f) => (
                <button
                  key={f.id}
                  title={f.label}
                  className={swatch(block.facade === f.id)}
                  style={{ backgroundColor: f.swatch }}
                  onClick={() => editBlock({ facade: f.id })}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {tab === 'door' && (
        <>
          <Section title="Door style">
            <div className="flex flex-wrap gap-1.5">
              {DOOR_STYLES.map((d) => (
                <button key={d.id} className={chip(style.door.style === d.id)} onClick={() => setDoor({ style: d.id })}>
                  {d.label}
                </button>
              ))}
            </div>
          </Section>
          {style.door.style !== 'none' && (
            <>
              <ColorField label="Door colour" value={style.door.color} onChange={(color) => setDoor({ color })} />
              {style.blocks.length > 1 && (
                <Section title="On block">
                  <div className="flex flex-wrap gap-1.5">
                    {style.blocks.map((_, i) => (
                      <button key={i} className={chip(style.door.block === i) + ' w-7 text-center'} onClick={() => setDoor({ block: i, offset: 0 })}>
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </Section>
              )}
              <Section title="Wall">
                <div className="flex flex-wrap gap-1.5">
                  {DOOR_SIDES.map((s) => (
                    <button key={s.id} className={chip(style.door.side === s.id)} onClick={() => setDoor({ side: s.id, offset: 0 })}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </Section>
              <Stepper
                label="Position"
                value={Math.max(-doorMax, Math.min(doorMax, style.door.offset))}
                min={-doorMax}
                max={doorMax}
                step={1.5}
                onChange={(offset) => setDoor({ offset })}
                format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} m`}
              />
              <label className="flex items-center justify-between">
                <span className="text-white/70">Canopy / awning</span>
                <input type="checkbox" checked={style.door.canopy} onChange={(e) => setDoor({ canopy: e.target.checked })} />
              </label>
            </>
          )}
        </>
      )}

      {tab === 'roof' && (
        <>
          <Section title="Roof shape">
            <div className="flex gap-1.5">
              {(['flat', 'gable'] as const).map((r) => (
                <button key={r} className={chip(style.roofStyle === r)} onClick={() => patch({ roofStyle: r })}>
                  {r === 'flat' ? 'Flat' : 'Pitched'}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Roof material">
            <div className="flex flex-wrap gap-1.5">
              {ROOFS.map((r) => (
                <button
                  key={r.id}
                  title={r.label}
                  className={swatch(piece.roof === r.id)}
                  style={{ backgroundColor: r.swatch }}
                  onClick={() => patch({ roof: r.id })}
                />
              ))}
            </div>
          </Section>
        </>
      )}

      <button
        className="rounded-lg bg-red-600/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-500"
        onClick={() => {
          removeById(piece.id);
          select(null);
        }}
      >
        Delete building <span className="ml-1 text-xs opacity-70">Del</span>
      </button>
    </div>
  );
}
