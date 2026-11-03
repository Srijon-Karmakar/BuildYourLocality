import { useEffect, useRef, useState } from 'react';
import { BLOCK_TOPS, MAX_FLOORS, type Block } from '../city/catalog';

const chip = (active: boolean) =>
  `min-h-9 rounded-lg px-3 py-2 transition disabled:opacity-30 sm:min-h-0 sm:rounded-md sm:px-2 sm:py-1 ${active ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'}`;

/** A slider that holds its value while dragged and commits shortly after, so a drag is one edit. */
function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<number | null>(null);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => setDraft(value), [value]);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const set = (next: number) => {
    setDraft(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => latest.current(next), 160);
  };
  return (
    <label className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-white/70">{label}</span>
      <input type="range" min={min} max={max} step={step} value={draft} onChange={(e) => set(Number(e.target.value))} className="min-w-0 flex-1" />
      <span className="w-12 text-right tabular-nums text-white/70">{format(draft)}</span>
    </label>
  );
}

/** Shape controls for one block: lift, corners, taper, twist, bulge and crown. */
export function ShapeEditor({ block, onChange }: { block: Block; onChange: (change: Partial<Block>) => void }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const top = block.top ?? 'flat';
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-white/5 p-2.5">
      <div className="text-white/55">Shape of this block</div>
      <Slider label="Raise" value={block.base ?? 0} min={0} max={MAX_FLOORS} step={0.5} format={(v) => `${v} fl`} onChange={(base) => onChange({ base: base || undefined })} />
      <Slider label="Corners" value={block.round ?? 0} min={0} max={1} step={0.05} format={pct} onChange={(round) => onChange({ round: round || undefined })} />
      <div className="flex gap-1.5">
        <button className={chip(!block.bevel)} onClick={() => onChange({ bevel: undefined })}>
          Curved corners
        </button>
        <button className={chip(!!block.bevel)} onClick={() => onChange({ bevel: true })}>
          Cut corners
        </button>
      </div>
      <Slider label="Taper" value={block.taper ?? 1} min={0.1} max={1.5} step={0.05} format={pct} onChange={(taper) => onChange({ taper: taper === 1 ? undefined : taper })} />
      <Slider label="Twist" value={block.twist ?? 0} min={-360} max={360} step={5} format={(v) => `${v}°`} onChange={(twist) => onChange({ twist: twist || undefined })} />
      <Slider label="Curvy" value={block.curve ?? 0} min={-1} max={1} step={0.05} format={(v) => (v > 0 ? `+${Math.round(v * 100)}` : `${Math.round(v * 100)}`)} onChange={(curve) => onChange({ curve: curve || undefined })} />
      <div className="mt-1 text-white/55">Crown</div>
      <div className="flex flex-wrap gap-1.5">
        {BLOCK_TOPS.map((t) => (
          <button key={t.id} className={chip(top === t.id)} onClick={() => onChange({ top: t.id === 'flat' ? undefined : t.id, topH: undefined })}>
            {t.label}
          </button>
        ))}
      </div>
      {top !== 'flat' && <Slider label="Crown height" value={block.topH ?? 0} min={0} max={120} step={1} format={(v) => (v ? `${v} m` : 'auto')} onChange={(topH) => onChange({ topH: topH || undefined })} />}
    </div>
  );
}
