import { useEffect, useRef, type ReactNode } from 'react';
import { BLOCK_PLANS, BLOCK_TOPS, MAX_FLOORS, UNIT, type Block } from '../city/catalog';
import { useCityStore } from '../state/useCityStore';

const chip = (active: boolean) =>
  `min-h-9 rounded-lg px-3 py-2 transition disabled:opacity-30 sm:min-h-0 sm:rounded-md sm:px-2 sm:py-1 ${active ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'}`;

/**
 * A slider that edits live: the building follows the thumb (at most once a frame), and the whole
 * drag counts as one undo step.
 */
function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const latest = useRef(onChange);
  const frame = useRef<number | null>(null);
  const pendingValue = useRef<number | null>(null);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const flush = () => {
    frame.current = null;
    if (pendingValue.current !== null) latest.current(pendingValue.current);
    pendingValue.current = null;
  };
  const end = () => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      flush();
    }
    useCityStore.getState().endStroke();
  };
  return (
    <label className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-white/70">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => useCityStore.getState().beginStroke()}
        onPointerUp={end}
        onPointerCancel={end}
        onChange={(e) => {
          pendingValue.current = Number(e.target.value);
          if (frame.current === null) frame.current = requestAnimationFrame(flush);
        }}
        className="min-w-0 flex-1"
      />
      <span className="w-12 text-right tabular-nums text-white/70">{format(pendingValue.current ?? value)}</span>
    </label>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-white/5 p-2.5">
      <div className="text-white/55">{title}</div>
      {children}
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Quick looks for one block. Each one resets every shape field it does not mention. */
const CLEAR: Partial<Block> = { plan: undefined, sides: undefined, inner: undefined, round: undefined, bevel: undefined, taper: undefined, twist: undefined, curve: undefined, flare: undefined };
const QUICK: { label: string; set: Partial<Block> }[] = [
  { label: 'Box', set: {} },
  { label: 'Soft corners', set: { round: 0.3 } },
  { label: 'Cylinder / oval', set: { round: 1 } },
  { label: 'Hexagon', set: { plan: 'poly', sides: 6 } },
  { label: 'Octagon', set: { plan: 'poly', sides: 8 } },
  { label: 'Star', set: { plan: 'star', sides: 5, inner: 0.45 } },
  { label: 'Cross', set: { plan: 'cross', inner: 0.4 } },
  { label: 'Y shape', set: { plan: 'y', inner: 0.4 } },
  { label: 'Tapered', set: { taper: 0.6 } },
  { label: 'Twisted', set: { taper: 0.85, twist: 90 } },
  { label: 'Curvy', set: { round: 0.6, curve: 0.7 } },
  { label: 'Flared base', set: { round: 0.4, flare: 0.7, taper: 0.7 } },
];

/** The Shape tab: whole-building shortcuts, then every shape control for the selected block. */
export function ShapePanel({
  blocks,
  blockIndex,
  selectBlock,
  editBlock,
  editAll,
}: {
  blocks: Block[];
  blockIndex: number;
  selectBlock: (i: number) => void;
  editBlock: (change: Partial<Block>) => void;
  editAll: (change: Partial<Block>) => void;
}) {
  const block = blocks[blockIndex];
  const top = block.top ?? 'flat';
  const plan = block.plan ?? 'rect';
  const mean = (pick: (b: Block) => number | undefined, fallback: number) => blocks.reduce((s, b) => s + (pick(b) ?? fallback), 0) / blocks.length;

  return (
    <>
      <Group title="Whole building (every block)">
        <Slider label="Round all" value={mean((b) => b.round, 0)} min={0} max={1} step={0.05} format={pct} onChange={(round) => editAll({ round: round || undefined })} />
        <Slider label="Taper all" value={mean((b) => b.taper, 1)} min={0.2} max={1.5} step={0.05} format={pct} onChange={(taper) => editAll({ taper: taper === 1 ? undefined : taper })} />
        <Slider label="Twist all" value={mean((b) => b.twist, 0)} min={-360} max={360} step={5} format={(v) => `${Math.round(v)}°`} onChange={(twist) => editAll({ twist: twist || undefined })} />
        <Slider label="Curvy all" value={mean((b) => b.curve, 0)} min={-1} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}`} onChange={(curve) => editAll({ curve: curve || undefined })} />
        <button className={chip(false) + ' self-start'} onClick={() => editAll(CLEAR)}>
          Straighten everything
        </button>
      </Group>

      {blocks.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-white/55">Block</span>
          {blocks.map((_, i) => (
            <button key={i} className={chip(i === blockIndex) + ' w-10 text-center sm:w-7'} onClick={() => selectBlock(i)}>
              {i + 1}
            </button>
          ))}
        </div>
      )}

      <Group title={`Block ${blockIndex + 1}: quick looks`}>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button key={q.label} className={chip(false)} onClick={() => editBlock({ ...CLEAR, ...q.set })}>
              {q.label}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Footprint">
        <div className="flex flex-wrap gap-1.5">
          {BLOCK_PLANS.map((p) => (
            <button key={p.id} className={chip(plan === p.id)} onClick={() => editBlock({ plan: p.id === 'rect' ? undefined : p.id })}>
              {p.label}
            </button>
          ))}
        </div>
        {plan === 'rect' && (
          <>
            <Slider label="Corners" value={block.round ?? 0} min={0} max={1} step={0.05} format={pct} onChange={(round) => editBlock({ round: round || undefined })} />
            <div className="flex gap-1.5">
              <button className={chip(!block.bevel)} onClick={() => editBlock({ bevel: undefined })}>
                Curved corners
              </button>
              <button className={chip(!!block.bevel)} onClick={() => editBlock({ bevel: true })}>
                Cut corners
              </button>
            </div>
          </>
        )}
        {(plan === 'poly' || plan === 'star') && (
          <Slider label={plan === 'star' ? 'Points' : 'Sides'} value={block.sides ?? (plan === 'star' ? 5 : 6)} min={plan === 'star' ? 3 : 3} max={16} step={1} format={(v) => String(v)} onChange={(sides) => editBlock({ sides })} />
        )}
        {plan === 'star' && <Slider label="Depth" value={block.inner ?? 0.45} min={0.1} max={0.9} step={0.05} format={pct} onChange={(inner) => editBlock({ inner })} />}
        {(plan === 'cross' || plan === 'y') && <Slider label="Arm width" value={block.inner ?? 0.4} min={0.1} max={0.9} step={0.05} format={pct} onChange={(inner) => editBlock({ inner })} />}
      </Group>

      <Group title="Profile (up the walls)">
        <Slider label="Taper" value={block.taper ?? 1} min={0.1} max={1.5} step={0.05} format={pct} onChange={(taper) => editBlock({ taper: taper === 1 ? undefined : taper })} />
        <Slider label="Twist" value={block.twist ?? 0} min={-360} max={360} step={5} format={(v) => `${v}°`} onChange={(twist) => editBlock({ twist: twist || undefined })} />
        <Slider label="Curvy" value={block.curve ?? 0} min={-1} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}`} onChange={(curve) => editBlock({ curve: curve || undefined })} />
        <Slider label="Flare" value={block.flare ?? 0} min={-1} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}`} onChange={(flare) => editBlock({ flare: flare || undefined })} />
      </Group>

      <Group title="Size and position">
        <Slider label="Raise" value={block.base ?? 0} min={0} max={MAX_FLOORS} step={0.5} format={(v) => `${v} fl`} onChange={(base) => editBlock({ base: base || undefined })} />
        <Slider label="Width" value={block.fw ?? 1} min={0.2} max={1} step={0.05} format={pct} onChange={(fw) => editBlock({ fw: fw === 1 ? undefined : fw })} />
        <Slider label="Depth" value={block.fd ?? 1} min={0.2} max={1} step={0.05} format={pct} onChange={(fd) => editBlock({ fd: fd === 1 ? undefined : fd })} />
        <Slider label="Nudge X" value={block.ox ?? 0} min={-block.w * UNIT} max={block.w * UNIT} step={0.25} format={(v) => `${v} m`} onChange={(ox) => editBlock({ ox: ox || undefined })} />
        <Slider label="Nudge Z" value={block.oz ?? 0} min={-block.d * UNIT} max={block.d * UNIT} step={0.25} format={(v) => `${v} m`} onChange={(oz) => editBlock({ oz: oz || undefined })} />
        <div className="text-white/45">Width, depth and nudge move the block inside its grid space; use the Layout tab for the grid itself.</div>
      </Group>

      <Group title="Crown">
        <div className="flex flex-wrap gap-1.5">
          {BLOCK_TOPS.map((t) => (
            <button key={t.id} className={chip(top === t.id)} onClick={() => editBlock({ top: t.id === 'flat' ? undefined : t.id, topH: undefined })}>
              {t.label}
            </button>
          ))}
        </div>
        {top !== 'flat' && <Slider label="Height" value={block.topH ?? 0} min={0} max={120} step={1} format={(v) => (v ? `${v} m` : 'auto')} onChange={(topH) => editBlock({ topH: topH || undefined })} />}
      </Group>
    </>
  );
}
