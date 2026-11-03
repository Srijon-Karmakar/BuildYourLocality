import { useState, type ReactNode } from 'react';
import {
  BALCONY_MODES,
  ROOF_EXTRAS,
  CORNER_STYLES,
  isTreeType,
  CORNICE_STYLES,
  type DoorSide,
  MAX_LEDS,
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
import { Icon } from './icons';
import { SidePanel } from './SidePanel';
import { WallEditor } from './WallEditor';
import { SpanEditor } from './SpanEditor';
import { pathLength, resolveSpan } from '../city/spans';
import { resolveWall, wallStyleOf } from '../city/walls';
import { FLOWER_SWATCHES, GRASS_SWATCHES, LEAF_SWATCHES, TREE_SHAPES, TRUNK_SWATCHES, resolveTree, seedFromId, type TreeSpec } from '../city/trees';
import { BillboardStudio } from './BillboardStudio';
import { LedEditor } from './LedEditor';
import { ShapePanel } from './ShapeEditor';
import { LANDMARKS, type Landmark } from '../city/landmarks';
import { useBuilderStore } from '../state/useBuilderStore';
import { connectedRoads, useCityStore, type Piece, type PiecePatch } from '../state/useCityStore';
import { RoadSettings } from './RoadSettings';
import { useGameStore } from '../state/useGameStore';

type Tab = 'walls' | 'layout' | 'shape' | 'door' | 'roof' | 'extras';
const TABS: { id: Tab; label: string }[] = [
  { id: 'walls', label: 'Walls' },
  { id: 'layout', label: 'Layout' },
  { id: 'shape', label: 'Shape' },
  { id: 'door', label: 'Door' },
  { id: 'roof', label: 'Roof' },
  { id: 'extras', label: 'Extras' },
];

const SHEET_CLASS =
  'pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex max-h-[50dvh] flex-col gap-2 overflow-y-auto rounded-t-2xl bg-black/62 pointer-coarse:bg-black/84 p-3 pb-[calc(var(--safe-bottom)+0.75rem)] text-xs sm:gap-3 sm:p-4 sm:text-sm text-white backdrop-blur-[6px] sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:max-h-[calc(100vh-7rem)] sm:rounded-xl sm:bg-black/52 sm:pb-4 sm:text-xs';

const swatch = (active: boolean) =>
  `h-9 w-9 rounded-full border-2 transition sm:h-6 sm:w-6 ${active ? 'scale-110 border-white' : 'border-white/20 hover:border-white/60'}`;
const chip = (active: boolean) =>
  `min-h-9 rounded-lg px-3 py-2 transition disabled:opacity-30 sm:min-h-0 sm:rounded-md sm:px-2 sm:py-1 ${active ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'}`;

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
  bigStep,
  format,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Optional larger step with its own buttons, for long ranges (e.g. 10 floors at a time). */
  bigStep?: number;
  format?: (value: number) => string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-white/70">{label}</span>
      <div className="flex items-center gap-1.5">
        {bigStep && (
          <button className={chip(false) + ' text-center'} disabled={value <= min} onClick={() => onChange(clamp(value - bigStep))}>
            −{bigStep}
          </button>
        )}
        <button className={chip(false) + ' w-10 text-center sm:w-6'} disabled={value - step < min - 1e-6} onClick={() => onChange(value - step)}>
          −
        </button>
        <span className="w-11 text-center tabular-nums">{format ? format(value) : value}</span>
        <button className={chip(false) + ' w-10 text-center sm:w-6'} disabled={value + step > max + 1e-6} onClick={() => onChange(value + step)}>
          +
        </button>
        {bigStep && (
          <button className={chip(false) + ' text-center'} disabled={value >= max} onClick={() => onChange(clamp(value + bigStep))}>
            +{bigStep}
          </button>
        )}
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
function SingleInspector() {
  const mode = useGameStore((s) => s.mode);
  const selectedId = useBuilderStore((s) => s.selectedId);
  const selectedBlock = useBuilderStore((s) => s.selectedBlock);
  const movingId = useBuilderStore((s) => s.movingId);
  const { select, selectBlock, startMove, cancelMove } = useBuilderStore.getState();
  const piece = useCityStore((s) => (selectedId ? s.pieces[selectedId] : undefined));
  const { updatePiece, removeById, setLot, movePiece } = useCityStore.getState();
  const [tab, setTab] = useState<Tab>('walls');
  const [ledSel, setLedSel] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  if (mode !== 'build' || !piece || !PIECES[piece.type].customisable) return null;
  if (piece.type === 'road') return <RoadInspector piece={piece} />;
  if (piece.type === 'wall') return <WallInspector piece={piece} />;
  if (piece.type === 'span') return <SpanInspector piece={piece} />;
  if (!PIECES[piece.type].paintable) return <PropInspector piece={piece} />;

  if (movingId) {
    return (
      <div className="pointer-events-auto absolute inset-x-2 bottom-[calc(var(--safe-bottom)+0.5rem)] rounded-2xl bg-black/58 pointer-coarse:bg-black/82 p-3 text-xs text-white sm:p-4 sm:text-sm backdrop-blur-[6px] sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:w-64 sm:rounded-xl sm:text-xs">
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
  const applyLandmark = (l: Landmark) => {
    if (!setLot(piece.id, l.lot)) {
      setNote('Neighbouring cells are occupied: this landmark needs a free ' + l.lot[0] + ' x ' + l.lot[1] + ' cell lot.');
      return;
    }
    setNote(null);
    patch({ blocks: l.blocks, facade: l.facade, roof: l.roof, windows: l.windows, tint: l.tint, trim: l.trim ?? style.trim, cornice: l.cornice ?? 'none', roofStyle: 'flat', door: { ...style.door, block: 0, offset: 0 } });
    selectBlock(0);
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
  const leds = style.leds;
  const ledIndex = Math.min(ledSel, Math.max(0, leds.length - 1));
  const led: LedSpec | undefined = leds[ledIndex];
  const ledBlock = led ? (style.blocks[led.block] ?? style.blocks[0]) : style.blocks[0];
  const ledBox = blockBox(ledBlock, style.lot);
  const ledWall = led && (led.side === 'front' || led.side === 'back') ? ledBox.w : ledBox.d;
  const saveLeds = (next: LedSpec[]) => patch({ leds: next, led: null });
  const setLed = (change: Partial<LedSpec>) => saveLeds(leds.map((l, i) => (i === ledIndex ? { ...l, ...change } : l)));
  /** A new screen on a side, with the look and size of the selected one (or the default). */
  const screenFor = (side: DoorSide): LedSpec => ({ ...(led ?? defaultLed), side, offset: 0 });
  const toggleSide = (side: DoorSide) => {
    if (leds.some((l) => l.side === side)) {
      const next = leds.filter((l) => l.side !== side);
      saveLeds(next);
      setLedSel(0);
    } else if (leds.length < MAX_LEDS) {
      saveLeds([...leds, screenFor(side)]);
      setLedSel(leds.length);
    }
  };
  /** One tap: a screen on every side, floor to roof, in the look of the one being edited (door storey left clear). */
  const coverBuilding = () => {
    const look = { ...(led ?? defaultLed) };
    // Eight screens at most: all four sides of the two tallest blocks.
    const tallest = style.blocks
      .map((b, index) => ({ b, index }))
      .sort((x, y) => y.b.floors - x.b.floors)
      .slice(0, Math.max(1, Math.floor(MAX_LEDS / DOOR_SIDES.length)));
    const screens: LedSpec[] = [];
    for (const { b, index } of tallest) {
      for (const sd of DOOR_SIDES) {
        const doorHere = style.door.style !== 'none' && style.door.block === index && style.door.side === sd.id;
        const bottom = doorHere && b.floors > 1 ? 1 : 0;
        screens.push({ ...look, block: index, side: sd.id, bottom, height: Math.max(1, b.floors - bottom), width: 0, offset: 0 });
      }
    }
    saveLeds(screens);
    setLedSel(0);
  };
  const allSides = () => {
    const missing = DOOR_SIDES.filter((sd) => !leds.some((l) => l.side === sd.id)).map((sd) => screenFor(sd.id));
    if (missing.length > 0) saveLeds([...leds, ...missing].slice(0, MAX_LEDS));
  };
  const LOOK_KEYS = ['block', 'side', 'bottom', 'height', 'width', 'offset'] as const;
  const matchLook = () => {
    if (!led) return;
    const look = { ...led };
    for (const k of LOOK_KEYS) delete (look as Partial<LedSpec>)[k];
    saveLeds(leds.map((l) => ({ ...look, block: l.block, side: l.side, bottom: l.bottom, height: l.height, width: l.width, offset: l.offset }) as LedSpec));
  };
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
    <SidePanel id="inspector" side="right" title={def.label} onClose={() => select(null)} className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex max-h-[50dvh] flex-col gap-2 overflow-y-auto rounded-t-2xl bg-black/62 pointer-coarse:bg-black/84 p-3 pb-[calc(var(--safe-bottom)+0.75rem)] text-xs sm:gap-3 sm:p-4 sm:text-sm text-white backdrop-blur-[6px] sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:max-h-[calc(100vh-7rem)] sm:rounded-xl sm:bg-black/52 sm:pb-4 sm:text-xs sm:w-80">

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
          <Section title="Cornice">
            <div className="flex flex-wrap gap-1.5">
              {CORNICE_STYLES.map((c) => (
                <button key={c.id} className={chip(style.cornice === c.id)} onClick={() => patch({ cornice: c.id })}>
                  {c.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Corners">
            <div className="flex flex-wrap gap-1.5">
              {CORNER_STYLES.map((c) => (
                <button key={c.id} className={chip(style.corners === c.id)} onClick={() => patch({ corners: c.id })}>
                  {c.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Floor bands">
            <div className="flex gap-1.5">
              <button className={chip(!style.bands)} onClick={() => patch({ bands: false })}>
                Off
              </button>
              <button className={chip(style.bands)} onClick={() => patch({ bands: true })}>
                Trim at every floor
              </button>
            </div>
          </Section>
          <ColorField label="Trim colour" value={style.trim} onChange={(trim) => patch({ trim })} />
        </>
      )}

      {tab === 'layout' && (
        <>
          <Section title="Lot size (grid cells)">
            <div className="flex flex-col gap-1.5">
              <Stepper label="Width" value={style.lot[0]} min={MIN_LOT} max={MAX_LOT} bigStep={5} onChange={(v) => changeLot([v, style.lot[1]])} />
              <Stepper label="Depth" value={style.lot[1]} min={MIN_LOT} max={MAX_LOT} bigStep={5} onChange={(v) => changeLot([style.lot[0], v])} />
            </div>
          </Section>

          <Section title="Landmarks (needs a big free lot)">
            <div className="flex flex-wrap gap-1.5">
              {LANDMARKS.map((l) => (
                <button key={l.id} title={l.blurb} className={chip(false)} onClick={() => applyLandmark(l)}>
                  {l.label}
                </button>
              ))}
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
            <Stepper label="Floors" value={block.floors} min={MIN_FLOORS} max={MAX_FLOORS} bigStep={10} onChange={(floors) => editBlock({ floors })} />
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

      {tab === 'shape' && (
        <ShapePanel blocks={style.blocks} blockIndex={blockIndex} selectBlock={selectBlock} editBlock={editBlock} editAll={(change) => setBlocks(style.blocks.map((b) => ({ ...b, ...change })))} />
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

          <div className="flex flex-col gap-2 rounded-lg bg-white/5 p-2.5">
            <div className="flex items-center justify-between">
              <span className="font-medium">LED screens</span>
              <span className="text-white/50">{leds.length} / {MAX_LEDS}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {DOOR_SIDES.map((sd) => {
                const count = leds.filter((l) => l.side === sd.id).length;
                return (
                  <button key={sd.id} className={chip(count > 0) + ' text-center'} onClick={() => toggleSide(sd.id)}>
                    {sd.label}
                    {count > 1 ? ` ×${count}` : ''}
                  </button>
                );
              })}
            </div>
            <button className="min-h-10 rounded-lg bg-white px-3 py-2 text-sm font-medium text-black transition active:bg-white/80 sm:min-h-0 sm:py-1.5" onClick={coverBuilding}>
              Cover the whole building
            </button>
            <div className="flex flex-wrap gap-1.5">
              <button className={chip(false)} disabled={DOOR_SIDES.every((sd) => leds.some((l) => l.side === sd.id))} onClick={allSides}>
                All four sides
              </button>
              <button
                className={chip(false)}
                disabled={leds.length >= MAX_LEDS}
                onClick={() => {
                  saveLeds([...leds, { ...(led ?? defaultLed), bottom: Math.min(ledBlock.floors - 1, (led?.bottom ?? 0) + (led?.height ?? 1) + 1), offset: 0 }]);
                  setLedSel(leds.length);
                }}
              >
                + Another here
              </button>
              {leds.length > 1 && (
                <button className={chip(false)} onClick={matchLook}>
                  Same look everywhere
                </button>
              )}
              {leds.length > 0 && (
                <button className={chip(false)} onClick={() => saveLeds([])}>
                  Remove all
                </button>
              )}
            </div>
            {leds.length > 1 && (
              <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
                {leds.map((l, i) => (
                  <button key={i} className={chip(i === ledIndex) + ' shrink-0 whitespace-nowrap'} onClick={() => setLedSel(i)}>
                    {i + 1} · {DOOR_SIDES.find((sd) => sd.id === l.side)?.label}
                  </button>
                ))}
              </div>
            )}
            {led && (
              <>
                <div className="border-t border-white/10 pt-2 text-white/55">
                  Editing screen {ledIndex + 1} ({DOOR_SIDES.find((sd) => sd.id === led.side)?.label.toLowerCase()})
                </div>
                <LedEditor spec={led} onChange={setLed} />
                <div className="mt-1 border-t border-white/10 pt-2 text-white/55">Where it goes</div>
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
                <button
                  className={chip(false) + ' text-red-300'}
                  onClick={() => {
                    saveLeds(leds.filter((_, i) => i !== ledIndex));
                    setLedSel(0);
                  }}
                >
                  Remove this screen
                </button>
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
                  className="min-h-9 rounded-md bg-white/10 px-2 py-1 text-base outline-none sm:min-h-0 sm:text-sm"
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
          {(
            <Section title={style.roofStyle === 'flat' ? 'Rooftop features' : 'Roof features'}>
              <div className="flex flex-wrap gap-1.5">
                {ROOF_EXTRAS.filter((e) => style.roofStyle === 'flat' || e.id === 'chimney').map((e) => (
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
        className="min-h-10 rounded-xl bg-red-600/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-500 active:bg-red-500 sm:min-h-0 sm:rounded-lg"
        onClick={() => {
          removeById(piece.id);
          select(null);
        }}
      >
        Delete building <span className="ml-1 text-xs opacity-70">Del</span>
      </button>
    </SidePanel>
  );
}

/** Everything about how one tree grows: kind of crown, colours, proportions and the pattern number. */
function TreeEditor({ piece }: { piece: Piece }) {
  const { updatePiece } = useCityStore.getState();
  const spec = resolveTree(piece.type, piece.accent, piece.tree, seedFromId(piece.id));
  const set = (change: Partial<TreeSpec>) => updatePiece(piece.id, { tree: { ...piece.tree, ...change } });
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const shuffle = () => set({ seed: Math.floor(Math.random() * 1_000_000) });
  const grass = spec.shape === 'grass';
  const hasTrunk = spec.shape !== 'bush' && !grass;

  return (
    <>
      <Section title="Kind of crown">
        <div className="flex flex-wrap gap-1.5">
          {TREE_SHAPES.map((s) => (
            <button key={s.id} className={chip(spec.shape === s.id)} onClick={() => set({ shape: s.id })}>
              {s.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Pattern">
        <div className="flex items-center gap-1.5">
          <button className={chip(false) + ' w-10 text-center sm:w-7'} onClick={() => set({ seed: Math.max(0, spec.seed - 1) })} aria-label="Previous pattern">
            −
          </button>
          <input
            type="number"
            min={0}
            max={99999999}
            value={spec.seed}
            onChange={(e) => set({ seed: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            className="min-h-9 w-full min-w-0 bg-white/10 px-2 py-1 text-center text-base tabular-nums outline-none sm:min-h-0 sm:text-sm"
            aria-label="Pattern number"
          />
          <button className={chip(false) + ' w-10 text-center sm:w-7'} onClick={() => set({ seed: spec.seed + 1 })} aria-label="Next pattern">
            +
          </button>
          <button className={chip(false) + ' flex shrink-0 items-center gap-1'} onClick={shuffle}>
            <Icon name="shuffle" /> Random
          </button>
        </div>
        <p className="mt-1 text-white/45">Every number grows a different tree. Keep one you like by noting its number.</p>
      </Section>

      <Section title={grass ? 'Blade colour' : 'Leaf colour'}>
        <div className="flex flex-wrap gap-1.5">
          {(grass ? GRASS_SWATCHES : LEAF_SWATCHES).map((s) => (
            <button
              key={s.color}
              title={s.label}
              className={swatch(spec.leaf.toLowerCase() === s.color)}
              style={{ backgroundColor: s.color }}
              onClick={() => updatePiece(piece.id, { accent: s.color })}
            />
          ))}
        </div>
      </Section>

      {grass && (
        <Section title="Flowers">
          <div className="flex flex-wrap items-center gap-1.5">
            {FLOWER_SWATCHES.map((s) => (
              <button key={s.color} title={s.label} className={swatch(spec.flower.toLowerCase() === s.color)} style={{ backgroundColor: s.color }} onClick={() => set({ flower: s.color, bloom: Math.max(spec.bloom, 0.5) })} />
            ))}
          </div>
        </Section>
      )}

      {hasTrunk && (
        <Section title="Trunk colour">
          <div className="flex flex-wrap items-center gap-1.5">
            {TRUNK_SWATCHES.map((s) => (
              <button key={s.color} title={s.label} className={swatch(spec.trunk.toLowerCase() === s.color)} style={{ backgroundColor: s.color }} onClick={() => set({ trunk: s.color })} />
            ))}
          </div>
        </Section>
      )}

      <div className="flex flex-col gap-1.5">
        <Stepper label="Height" value={Math.round(spec.height * 10) / 10} min={0.4} max={2.5} step={0.1} format={pct} onChange={(height) => set({ height })} />
        <Stepper label={grass ? 'Clump width' : 'Crown width'} value={Math.round(spec.canopy * 10) / 10} min={0.4} max={2.5} step={0.1} format={pct} onChange={(canopy) => set({ canopy })} />
        <Stepper label={grass ? 'Blades' : 'Fullness'} value={Math.round(spec.fullness * 10) / 10} min={0} max={1} step={0.1} format={pct} onChange={(fullness) => set({ fullness })} />
        {grass && <Stepper label="Flowers" value={Math.round(spec.bloom * 10) / 10} min={0} max={1} step={0.1} format={pct} onChange={(bloom) => set({ bloom })} />}
        {(hasTrunk || grass) && <Stepper label={grass ? 'Windswept' : 'Lean'} value={Math.round(spec.lean * 10) / 10} min={0} max={1} step={0.1} format={pct} onChange={(lean) => set({ lean })} />}
        <Stepper label="Shade variety" value={Math.round(spec.variety * 10) / 10} min={0} max={1} step={0.1} format={pct} onChange={(variety) => set({ variety })} />
      </div>
      <button className={chip(false)} disabled={!piece.tree && !piece.accent} onClick={() => updatePiece(piece.id, { tree: undefined, accent: undefined })}>
        Reset to the usual {PIECES[piece.type].label.toLowerCase()}
      </button>
    </>
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
    <SidePanel id="inspector" side="right" title={def.label} onClose={() => select(null)} className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex max-h-[50dvh] flex-col gap-2 overflow-y-auto rounded-t-2xl bg-black/62 pointer-coarse:bg-black/84 p-3 pb-[calc(var(--safe-bottom)+0.75rem)] text-xs sm:gap-3 sm:p-4 sm:text-sm text-white backdrop-blur-[6px] sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:max-h-[calc(100vh-7rem)] sm:rounded-xl sm:bg-black/52 sm:pb-4 sm:text-xs sm:w-72">
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

      {isTreeType(piece.type) && <TreeEditor piece={piece} />}

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ColorField label={isTreeType(piece.type) ? 'Custom leaf colour' : 'Colour'} value={piece.accent ?? resolveTree(piece.type, undefined, piece.tree, 0).leaf} onChange={(accent) => updatePiece(piece.id, { accent })} />
        </div>
        <button className={chip(false)} disabled={!piece.accent} onClick={() => updatePiece(piece.id, { accent: undefined })}>
          Reset
        </button>
      </div>
      <Stepper
        label="Size"
        value={Math.round((piece.scale ?? 1) * 10) / 10}
        min={0.5}
        max={3}
        step={0.1}
        onChange={(scale) => updatePiece(piece.id, { scale })}
        format={(v) => `${Math.round(v * 100)}%`}
      />

      {hasLed && (
        <Section title="LED screen">
          <LedEditor spec={led} onChange={(change) => updatePiece(piece.id, { led: { ...led, ...change } })} />
        </Section>
      )}

      {piece.type === 'billboard' && (
        <Section title="Billboard studio">
          <BillboardStudio spec={led} onChange={(change) => updatePiece(piece.id, { led: { ...led, ...change } })} />
        </Section>
      )}

      <button
        className="min-h-10 rounded-xl bg-red-600/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-500 active:bg-red-500 sm:min-h-0 sm:rounded-lg"
        onClick={() => {
          removeById(piece.id);
          select(null);
        }}
      >
        Delete <span className="ml-1 text-xs opacity-70">Del</span>
      </button>
    </SidePanel>
  );
}

type RoadScope = 'cell' | 'stretch' | 'network';

/** Inspector for a road cell: its settings can be applied to just this cell or to the road it belongs to. */
function RoadInspector({ piece }: { piece: Piece }) {
  const { select } = useBuilderStore.getState();
  const [scope, setScope] = useState<RoadScope>('stretch');
  const [note, setNote] = useState<string | null>(null);

  /** Places a pair of lights per road in the free cells around this junction. */
  const addLights = () => {
    const { pieces, occupancy, place, canPlace } = useCityStore.getState();
    const isRoad = (x: number, z: number) => pieces[occupancy[`${x},${z}`]]?.type === 'road';
    const arms = [isRoad(piece.gx, piece.gz - 1), isRoad(piece.gx + 1, piece.gz), isRoad(piece.gx, piece.gz + 1), isRoad(piece.gx - 1, piece.gz)];
    if (arms.filter(Boolean).length < 3) {
      setNote('This cell is not a junction yet: it needs roads on at least three sides.');
      return;
    }
    // Diagonal cells: opposite corners serve the same road, so rotate them in pairs.
    const spots: [number, number, number][] = [
      [1, -1, 0],
      [-1, 1, 0],
      [-1, -1, 1],
      [1, 1, 1],
    ];
    let placed = 0;
    for (const [dx, dz, rot] of spots) {
      const gx = piece.gx + dx;
      const gz = piece.gz + dz;
      if (!canPlace('trafficlight', gx, gz, rot)) continue;
      if (place({ type: 'trafficlight', gx, gz, rot, facade: 'brick', roof: 'gravel' })) placed++;
    }
    setNote(placed > 0 ? `Added ${placed} traffic light${placed > 1 ? 's' : ''}.` : 'No free cells beside this junction for a traffic light.');
  };

  const change = (patch: Partial<NonNullable<Piece['road']>>) => {
    const { pieces, occupancy, updateRoads } = useCityStore.getState();
    const ids =
      scope === 'cell' ? [piece.id] : connectedRoads(pieces, occupancy, piece.id, scope === 'stretch');
    const changed = updateRoads(ids, patch);
    setNote(changed < ids.length ? `${ids.length - changed} cell(s) kept their style: a building is too close for a wide road.` : null);
  };

  return (
    <SidePanel id="inspector" side="right" title="Road" onClose={() => select(null)} className={`${SHEET_CLASS} sm:w-72`}>

      <div>
        <div className="mb-1.5 text-white/55">Apply changes to</div>
        <div className="flex flex-wrap gap-1.5">
          {([
            ['cell', 'This cell'],
            ['stretch', 'Whole stretch'],
            ['network', 'All connected roads'],
          ] as const).map(([id, label]) => (
            <button key={id} className={chip(scope === id)} onClick={() => setScope(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {note && <div className="rounded-md bg-amber-500/20 px-2 py-1 text-amber-200">{note}</div>}

      <RoadSettings spec={piece.road ?? {}} onChange={change} />

      <div className="flex flex-col gap-1.5 rounded-lg bg-white/5 p-2.5">
        <button className={chip(false)} onClick={addLights}>
          <Icon name="trafficlight" className="mr-1 inline" />Add smart traffic lights at this junction
        </button>
        <p className="text-white/50">
          Needs a junction (3+ roads). Lights read traffic with a radar, extend green while cars keep coming,
          rest on green when it's quiet, and stop all traffic for people waiting to cross.
        </p>
      </div>

      <button
        className="min-h-10 rounded-xl bg-red-600/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-500 active:bg-red-500 sm:min-h-0 sm:rounded-lg"
        onClick={() => {
          useCityStore.getState().removeById(piece.id);
          select(null);
        }}
      >
        Delete road cell <span className="ml-1 text-xs opacity-70">Del</span>
      </button>
    </SidePanel>
  );
}

/** The one place the inspector is mounted: a single piece, or a group when several are picked. */
export function BuildingInspector() {
  const mode = useGameStore((s) => s.mode);
  const count = useBuilderStore((s) => s.selectedIds.length);
  if (mode !== 'build') return null;
  return count > 1 ? <MultiInspector /> : <SingleInspector />;
}

/** A placed bridge: every setting except its path, plus doing the same to every bridge at once. */
function SpanInspector({ piece }: { piece: Piece }) {
  const { select } = useBuilderStore.getState();
  const { updatePiece, updateMany, removeById, pieces } = useCityStore.getState();
  const spec = resolveSpan(piece.span);
  const spans = Object.values(pieces).filter((p) => p.type === 'span');
  return (
    <SidePanel id="inspector" side="right" title="Bridge" onClose={() => select(null)} className={GROUP_CLASS}>
      <p className="text-white/60">
        {Math.round(pathLength(spec.pts))} m long, {spec.pts.length} points.
      </p>
      <SpanEditor spec={spec} onChange={(change) => updatePiece(piece.id, { span: { ...piece.span, ...change } })} />
      <div className="flex flex-wrap gap-1.5">
        <button className={chip(false)} disabled={spans.length < 2} onClick={() => updateMany(spans.map((p) => p.id), (p) => ({ span: { ...piece.span, pts: resolveSpan(p.span).pts } }))}>
          Copy this look to all {spans.length} bridges
        </button>
      </div>
      <button
        className="min-h-10 rounded-xl bg-red-600/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-500 active:bg-red-500 sm:min-h-0 sm:rounded-lg"
        onClick={() => {
          removeById(piece.id);
          select(null);
        }}
      >
        Remove this bridge <span className="ml-1 text-xs opacity-70">Del</span>
      </button>
    </SidePanel>
  );
}

/** A placed wall: all its settings, plus doing the same to every wall at once. */
function WallInspector({ piece }: { piece: Piece }) {
  const { select } = useBuilderStore.getState();
  const { updatePiece, updateMany, removeById, pieces } = useCityStore.getState();
  const spec = resolveWall(piece.wall);
  const walls = Object.values(pieces).filter((p) => p.type === 'wall');
  return (
    <SidePanel id="inspector" side="right" title={wallStyleOf(spec.style).label} onClose={() => select(null)} className={GROUP_CLASS}>
      <WallEditor
        spec={spec}
        onChange={(change) => updatePiece(piece.id, { wall: { ...piece.wall, ...change } })}
        onStyle={(id) => updatePiece(piece.id, { wall: { ...wallStyleOf(id).defaults } })}
      />
      <div className="flex flex-wrap gap-1.5">
        <button className={chip(false)} disabled={walls.length < 2} onClick={() => updateMany(walls.map((p) => p.id), () => ({ wall: { ...piece.wall } }))}>
          Copy this look to all {walls.length} walls
        </button>
        <button className={chip(false)} disabled={walls.length < 2} onClick={() => useBuilderStore.getState().selectMany(walls.map((p) => p.id))}>
          Select all walls
        </button>
      </div>
      <button
        className="min-h-10 rounded-xl bg-red-600/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-500 active:bg-red-500 sm:min-h-0 sm:rounded-lg"
        onClick={() => {
          removeById(piece.id);
          select(null);
        }}
      >
        Remove this wall <span className="ml-1 text-xs opacity-70">Del</span>
      </button>
    </SidePanel>
  );
}

const GROUP_CLASS =
  'pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex max-h-[50dvh] flex-col gap-2 overflow-y-auto rounded-t-2xl bg-black/62 pointer-coarse:bg-black/84 p-3 pb-[calc(var(--safe-bottom)+0.75rem)] text-xs sm:gap-3 sm:p-4 sm:text-sm text-white backdrop-blur-[6px] sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:max-h-[calc(100vh-7rem)] sm:rounded-xl sm:bg-black/52 sm:pb-4 sm:text-xs sm:w-80';

/** Edits every picked building and plant at once; each change is one undo step. */
function MultiInspector() {
  const ids = useBuilderStore((s) => s.selectedIds);
  const multiSelect = useBuilderStore((s) => s.multiSelect);
  const pieces = useCityStore((s) => s.pieces);
  const { select, selectMany, setMultiSelect } = useBuilderStore.getState();
  const { updateMany, removeMany } = useCityStore.getState();
  const [confirm, setConfirm] = useState(false);

  const chosen = ids.map((id) => pieces[id]).filter((p): p is Piece => !!p);
  const buildings = chosen.filter((p) => PIECES[p.type].paintable);
  const plants = chosen.filter((p) => isTreeType(p.type));
  const props = chosen.length - buildings.length - plants.length;
  const styles = buildings.map((p) => resolveStyle(p.type, p));
  /** The value every building shares, or undefined when they differ. */
  const shared = <T,>(pick: (p: Piece, s: ReturnType<typeof resolveStyle>) => T): T | undefined => {
    if (buildings.length === 0) return undefined;
    const first = pick(buildings[0], styles[0]);
    return buildings.every((p, i) => JSON.stringify(pick(p, styles[i])) === JSON.stringify(first)) ? first : undefined;
  };

  const editBuildings = (patch: PiecePatch) => updateMany(buildings.map((p) => p.id), () => patch);
  const editPlants = (change: (p: Piece) => PiecePatch) => updateMany(plants.map((p) => p.id), change);
  const floors = (delta: number) =>
    updateMany(
      buildings.map((p) => p.id),
      (p) => ({ blocks: resolveStyle(p.type, p).blocks.map((b) => ({ ...b, floors: Math.max(1, b.floors + delta) })) }),
    );
  const similar = () => {
    const kinds = new Set(chosen.map((p) => p.type));
    selectMany(Object.values(pieces).filter((p) => kinds.has(p.type)).map((p) => p.id));
  };
  const summary = [
    buildings.length > 0 && `${buildings.length} building${buildings.length === 1 ? '' : 's'}`,
    plants.length > 0 && `${plants.length} plant${plants.length === 1 ? '' : 's'}`,
    props > 0 && `${props} other`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <SidePanel id="inspector" side="right" title={`${chosen.length} selected`} onClose={() => select(null)} className={GROUP_CLASS}>
      <div className="text-white/60">{summary}</div>
      <div className="flex flex-wrap gap-1.5">
        <button className={chip(multiSelect)} onClick={() => setMultiSelect(!multiSelect)} title="Tap pieces to add or remove them">
          Add more: {multiSelect ? 'on' : 'off'}
        </button>
        <button className={chip(false)} onClick={similar}>
          Select all alike
        </button>
        <button className={chip(false)} onClick={() => select(null)}>
          Clear
        </button>
      </div>
      <p className="text-white/45">Shift or Ctrl + click adds or removes one piece. Drag a box with the select tool to pick everything inside it.</p>

      {buildings.length > 0 && (
        <>
          <div className="mt-1 font-medium text-white/80">Buildings ({buildings.length})</div>
          <Section title="Walls">
            <div className="flex flex-wrap gap-1.5">
              {FACADES.map((f) => (
                <button key={f.id} title={f.label} className={swatch(shared((p) => p.facade) === f.id)} style={{ backgroundColor: f.swatch }} onClick={() => updateMany(buildings.map((p) => p.id), () => ({ facade: f.id }))} />
              ))}
            </div>
          </Section>
          <Section title="Wall tint">
            <div className="flex flex-wrap gap-1.5">
              {TINTS.map((c) => (
                <button key={c.id} title={c.label} className={swatch(shared((_, s) => s.tint) === c.id)} style={{ backgroundColor: c.id }} onClick={() => editBuildings({ tint: c.id })} />
              ))}
            </div>
            <ColorField label="Custom colour" value={shared((_, s) => s.tint) ?? '#ffffff'} onChange={(tint) => editBuildings({ tint })} />
          </Section>
          <Section title="Roof material">
            <div className="flex flex-wrap gap-1.5">
              {ROOFS.map((r) => (
                <button key={r.id} title={r.label} className={swatch(shared((p) => p.roof) === r.id)} style={{ backgroundColor: r.swatch }} onClick={() => editBuildings({ roof: r.id })} />
              ))}
            </div>
          </Section>
          <Section title="Roof shape">
            <div className="flex gap-1.5">
              {(['flat', 'gable'] as const).map((r) => (
                <button key={r} className={chip(shared((_, s) => s.roofStyle) === r)} onClick={() => editBuildings({ roofStyle: r })}>
                  {r === 'flat' ? 'Flat' : 'Pitched'}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Window style">
            <div className="flex flex-wrap gap-1.5">
              {WINDOW_STYLES.map((w) => (
                <button key={w.id} className={chip(shared((_, s) => s.windows) === w.id)} onClick={() => editBuildings({ windows: w.id })}>
                  {w.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Cornice">
            <div className="flex flex-wrap gap-1.5">
              {CORNICE_STYLES.map((c) => (
                <button key={c.id} className={chip(shared((_, s) => s.cornice) === c.id)} onClick={() => editBuildings({ cornice: c.id })}>
                  {c.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Corners">
            <div className="flex flex-wrap gap-1.5">
              {CORNER_STYLES.map((c) => (
                <button key={c.id} className={chip(shared((_, s) => s.corners) === c.id)} onClick={() => editBuildings({ corners: c.id })}>
                  {c.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Floor bands">
            <div className="flex gap-1.5">
              <button className={chip(shared((_, s) => s.bands) === false)} onClick={() => editBuildings({ bands: false })}>
                Off
              </button>
              <button className={chip(shared((_, s) => s.bands) === true)} onClick={() => editBuildings({ bands: true })}>
                On
              </button>
            </div>
          </Section>
          <Section title="Balconies">
            <div className="flex flex-wrap gap-1.5">
              {BALCONY_MODES.map((m) => (
                <button key={m.id} className={chip(shared((_, s) => s.balconies) === m.id)} onClick={() => editBuildings({ balconies: m.id })}>
                  {m.label}
                </button>
              ))}
            </div>
          </Section>
          <ColorField label="Trim colour" value={shared((_, s) => s.trim) ?? '#d9dcdc'} onChange={(trim) => editBuildings({ trim })} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-white/70">Floors (all blocks)</span>
            <div className="flex gap-1.5">
              <button className={chip(false) + ' w-12 text-center sm:w-9'} onClick={() => floors(-5)}>
                −5
              </button>
              <button className={chip(false) + ' w-12 text-center sm:w-9'} onClick={() => floors(-1)}>
                −1
              </button>
              <button className={chip(false) + ' w-12 text-center sm:w-9'} onClick={() => floors(1)}>
                +1
              </button>
              <button className={chip(false) + ' w-12 text-center sm:w-9'} onClick={() => floors(5)}>
                +5
              </button>
            </div>
          </div>
        </>
      )}

      {plants.length > 0 && (
        <>
          <div className="mt-1 font-medium text-white/80">Plants ({plants.length})</div>
          <Section title="Kind of crown">
            <div className="flex flex-wrap gap-1.5">
              {TREE_SHAPES.map((s) => (
                <button key={s.id} className={chip(false)} onClick={() => editPlants((p) => ({ tree: { ...p.tree, shape: s.id } }))}>
                  {s.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Leaf colour">
            <div className="flex flex-wrap gap-1.5">
              {[...LEAF_SWATCHES, ...GRASS_SWATCHES.slice(0, 4)].map((s) => (
                <button key={s.color} title={s.label} className={swatch(false)} style={{ backgroundColor: s.color }} onClick={() => editPlants(() => ({ accent: s.color }))} />
              ))}
            </div>
          </Section>
          <div className="flex flex-wrap gap-1.5">
            <button className={chip(false)} onClick={() => editPlants((p) => ({ tree: { ...p.tree, seed: Math.floor(Math.random() * 1_000_000) } }))}>
              <Icon name="shuffle" className="mr-1 inline" />
              New pattern for each
            </button>
            <button className={chip(false)} onClick={() => editPlants((p) => ({ scale: Math.min(3, (p.scale ?? 1) + 0.1) }))}>
              Bigger
            </button>
            <button className={chip(false)} onClick={() => editPlants((p) => ({ scale: Math.max(0.5, (p.scale ?? 1) - 0.1) }))}>
              Smaller
            </button>
            <button className={chip(false)} onClick={() => editPlants(() => ({ tree: undefined, accent: undefined, scale: undefined }))}>
              Reset
            </button>
          </div>
        </>
      )}

      <button
        className="min-h-10 rounded-xl bg-red-600/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-500 active:bg-red-500 sm:min-h-0 sm:rounded-lg"
        onBlur={() => setConfirm(false)}
        onClick={() => {
          if (!confirm) return setConfirm(true);
          removeMany(ids);
          select(null);
        }}
      >
        {confirm ? `Tap again to delete ${chosen.length}` : `Delete ${chosen.length} pieces`} <span className="ml-1 text-xs opacity-70">Del</span>
      </button>
    </SidePanel>
  );
}
