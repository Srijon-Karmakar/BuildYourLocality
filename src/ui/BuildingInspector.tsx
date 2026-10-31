import { useState, type ReactNode } from 'react';
import {
  BALCONY_MODES,
  LED_MODES,
  ROOF_EXTRAS,
  type LedSpec,
  type RoofExtra,
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
import { useCityStore, type Piece } from '../state/useCityStore';
import { useGameStore } from '../state/useGameStore';

type Tab = 'walls' | 'layout' | 'door' | 'roof' | 'extras';
const TABS: { id: Tab; label: string }[] = [
  { id: 'walls', label: 'Walls' },
  { id: 'layout', label: 'Layout' },
  { id: 'door', label: 'Door' },
  { id: 'roof', label: 'Roof' },
  { id: 'extras', label: 'Extras' },
];

const swatch = (active: boolean) =>
  `h-9 w-9 rounded-full border-2 transition sm:h-6 sm:w-6 ${active ? 'scale-110 border-white' : 'border-white/20 hover:border-white/60'}`;
const chip = (active: boolean) =>
  `min-h-10 rounded-lg px-3 py-2 transition disabled:opacity-30 sm:min-h-0 sm:rounded-md sm:px-2 sm:py-1 ${active ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'}`;

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
        <button className={chip(false) + ' w-10 text-center sm:w-6'} disabled={value - step < min - 1e-6} onClick={() => onChange(value - step)}>
          −
        </button>
        <span className="w-14 text-center tabular-nums">{format ? format(value) : value}</span>
        <button className={chip(false) + ' w-10 text-center sm:w-6'} disabled={value + step > max + 1e-6} onClick={() => onChange(value + step)}>
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
        className="h-10 w-16 cursor-pointer rounded border border-white/20 bg-transparent sm:h-7 sm:w-12"
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

  if (mode !== 'build' || !piece || !PIECES[piece.type].customisable) return null;
  if (!PIECES[piece.type].paintable) return <PropInspector piece={piece} />;

  if (movingId) {
    return (
      <div className="pointer-events-auto absolute inset-x-2 bottom-[calc(var(--safe-bottom)+0.5rem)] rounded-2xl bg-black/75 p-4 text-sm text-white backdrop-blur-lg sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:w-64 sm:rounded-xl sm:text-xs">
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

  const defaultLed: LedSpec = {
    mode: 'wave',
    color: '#35e0ff',
    block: 0,
    side: 'front',
    bottom: Math.min(1, style.blocks[0].floors - 1),
    height: 1,
    width: 0,
    offset: 0,
  };
  const led = style.led;
  const ledBlock = led ? (style.blocks[led.block] ?? style.blocks[0]) : style.blocks[0];
  const ledBox = blockBox(ledBlock, style.lot);
  const ledWall = led && (led.side === 'front' || led.side === 'back') ? ledBox.w : ledBox.d;
  const setLed = (change: Partial<LedSpec>) => patch({ led: { ...(led ?? defaultLed), ...change } });
  const toggleExtra = (extra: RoofExtra) =>
    patch({
      roofExtras: style.roofExtras.includes(extra)
        ? style.roofExtras.filter((e) => e !== extra)
        : [...style.roofExtras, extra],
    });

  const doorBox = blockBox(style.blocks[style.door.block] ?? style.blocks[0], style.lot);
  const doorWall = style.door.side === 'front' || style.door.side === 'back' ? doorBox.w : doorBox.d;
  const doorMax = maxDoorOffset(doorWall);

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex max-h-[58dvh] flex-col gap-3 overflow-y-auto rounded-t-2xl bg-black/80 p-4 pb-[calc(var(--safe-bottom)+1rem)] text-sm text-white backdrop-blur-lg sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:max-h-[calc(100vh-7rem)] sm:rounded-xl sm:bg-black/70 sm:pb-4 sm:text-xs sm:w-80">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{def.label}</span>
        <button className="flex h-10 w-10 items-center justify-center text-lg text-white/60 hover:text-white sm:h-auto sm:w-auto sm:text-base" onClick={() => select(null)} title="Close (Esc)">
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
                <button key={i} className={chip(i === blockIndex) + ' w-10 text-center sm:w-7'} onClick={() => selectBlock(i)}>
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
                      <button key={i} className={chip(style.door.block === i) + ' w-10 text-center sm:w-7'} onClick={() => setDoor({ block: i, offset: 0 })}>
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

      {tab === 'extras' && (
        <>
          <Section title="Balconies">
            <div className="flex flex-wrap gap-1.5">
              {BALCONY_MODES.map((m) => (
                <button key={m.id} className={chip(style.balconies === m.id)} onClick={() => patch({ balconies: m.id })}>
                  {m.label}
                </button>
              ))}
            </div>
          </Section>

          <div className="flex flex-col gap-1.5 rounded-lg bg-white/5 p-2.5">
            <label className="flex items-center justify-between">
              <span className="font-medium">LED screen</span>
              <input type="checkbox" checked={!!led} onChange={(e) => patch({ led: e.target.checked ? defaultLed : null })} />
            </label>
            {led && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {LED_MODES.map((m) => (
                    <button key={m.id} className={chip(led.mode === m.id)} onClick={() => setLed({ mode: m.id })}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <ColorField label="Screen colour" value={led.color} onChange={(color) => setLed({ color })} />
                {style.blocks.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-white/70">On block</span>
                    {style.blocks.map((_, i) => (
                      <button key={i} className={chip(led.block === i) + ' w-10 text-center sm:w-7'} onClick={() => setLed({ block: i, offset: 0 })}>
                        {i + 1}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {DOOR_SIDES.map((sd) => (
                    <button key={sd.id} className={chip(led.side === sd.id)} onClick={() => setLed({ side: sd.id, offset: 0 })}>
                      {sd.label}
                    </button>
                  ))}
                </div>
                <Stepper label="Bottom floor" value={led.bottom} min={0} max={Math.max(0, ledBlock.floors - 1)} onChange={(bottom) => setLed({ bottom })} />
                <Stepper label="Height (floors)" value={led.height} min={1} max={Math.max(1, ledBlock.floors - led.bottom)} onChange={(height) => setLed({ height })} />
                <Stepper
                  label="Width"
                  value={led.width}
                  min={0}
                  max={Math.max(3, ledWall - 1.2)}
                  step={1.5}
                  onChange={(width) => setLed({ width })}
                  format={(v) => (v === 0 ? 'Full' : `${v.toFixed(1)} m`)}
                />
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5 rounded-lg bg-white/5 p-2.5">
            <label className="flex items-center justify-between">
              <span className="font-medium">Name sign</span>
              <input
                type="checkbox"
                checked={!!style.sign}
                onChange={(e) => patch({ sign: e.target.checked ? { text: def.label.toUpperCase().slice(0, 14), color: '#ffffff' } : null })}
              />
            </label>
            {style.sign && (
              <>
                <input
                  type="text"
                  maxLength={14}
                  value={style.sign.text}
                  onChange={(e) => patch({ sign: { ...style.sign!, text: e.target.value } })}
                  className="min-h-10 rounded-md bg-white/10 px-2 py-1 text-base outline-none sm:min-h-0 sm:text-sm"
                />
                <ColorField label="Sign colour" value={style.sign.color} onChange={(color) => patch({ sign: { ...style.sign!, color } })} />
              </>
            )}
          </div>
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
          {style.roofStyle === 'flat' && (
            <Section title="Rooftop features">
              <div className="flex flex-wrap gap-1.5">
                {ROOF_EXTRAS.map((e) => (
                  <button key={e.id} className={chip(style.roofExtras.includes(e.id))} onClick={() => toggleExtra(e.id)}>
                    {e.label}
                  </button>
                ))}
              </div>
            </Section>
          )}
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
        className="min-h-12 rounded-xl bg-red-600/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-500 active:bg-red-500 sm:min-h-0 sm:rounded-lg"
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

/** Inspector for props (trees, benches, billboards ...): colour, size, and LED content. */
function PropInspector({ piece }: { piece: Piece }) {
  const { select, startMove } = useBuilderStore.getState();
  const { updatePiece, removeById, movePiece } = useCityStore.getState();
  const [note, setNote] = useState<string | null>(null);
  const def = PIECES[piece.type];
  const style = resolveStyle(piece.type, piece);
  const hasLed = piece.type === 'billboard' || piece.type === 'busstop';
  const led: LedSpec = style.led ?? {
    mode: piece.type === 'billboard' ? 'ticker' : 'checker',
    color: piece.type === 'billboard' ? '#ff9d2e' : '#3ad6ff',
    block: 0,
    side: 'front',
    bottom: 0,
    height: 1,
    width: 0,
    offset: 0,
  };

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex max-h-[58dvh] flex-col gap-3 overflow-y-auto rounded-t-2xl bg-black/80 p-4 pb-[calc(var(--safe-bottom)+1rem)] text-sm text-white backdrop-blur-lg sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:max-h-[calc(100vh-7rem)] sm:rounded-xl sm:bg-black/70 sm:pb-4 sm:text-xs sm:w-72">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{def.label}</span>
        <button className="flex h-10 w-10 items-center justify-center text-lg text-white/60 hover:text-white sm:h-auto sm:w-auto sm:text-base" onClick={() => select(null)} title="Close (Esc)">
          ✕
        </button>
      </div>
      <div className="flex gap-1.5">
        <button className={chip(false) + ' flex-1'} onClick={() => startMove(piece.id, piece.rot)}>
          Move
        </button>
        <button
          className={chip(false) + ' flex-1'}
          onClick={() => setNote(movePiece(piece.id, piece.gx, piece.gz, (piece.rot + 1) % 4) ? null : 'No room to rotate here.')}
        >
          Rotate
        </button>
      </div>
      {note && <div className="rounded-md bg-amber-500/20 px-2 py-1 text-amber-200">{note}</div>}

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ColorField label="Colour" value={piece.accent ?? '#4c9a40'} onChange={(accent) => updatePiece(piece.id, { accent })} />
        </div>
        <button className={chip(false)} disabled={!piece.accent} onClick={() => updatePiece(piece.id, { accent: undefined })}>
          Reset
        </button>
      </div>
      <Stepper
        label="Size"
        value={Math.round((piece.scale ?? 1) * 10) / 10}
        min={0.5}
        max={2}
        step={0.1}
        onChange={(scale) => updatePiece(piece.id, { scale })}
        format={(v) => `${Math.round(v * 100)}%`}
      />

      {hasLed && (
        <Section title="LED screen">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {LED_MODES.map((m) => (
              <button key={m.id} className={chip(led.mode === m.id)} onClick={() => updatePiece(piece.id, { led: { ...led, mode: m.id } })}>
                {m.label}
              </button>
            ))}
          </div>
          <ColorField label="Screen colour" value={led.color} onChange={(color) => updatePiece(piece.id, { led: { ...led, color } })} />
        </Section>
      )}

      <button
        className="min-h-12 rounded-xl bg-red-600/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-500 active:bg-red-500 sm:min-h-0 sm:rounded-lg"
        onClick={() => {
          removeById(piece.id);
          select(null);
        }}
      >
        Delete <span className="ml-1 text-xs opacity-70">Del</span>
      </button>
    </div>
  );
}
