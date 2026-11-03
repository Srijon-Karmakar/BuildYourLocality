import type { ReactNode } from 'react';
import {
  SPAN_COLOURS,
  SPAN_KINDS,
  SPAN_PRESETS,
  SPAN_RAILINGS,
  SPAN_STRUCTURES,
  SPAN_SUPPORTS,
  spanWidth,
  type SpanKind,
  type SpanRailing,
  type SpanSpec,
  type SpanStructure,
  type SpanSupport,
} from '../city/spans';

const chip = (active: boolean) =>
  `min-h-9 rounded-lg px-2.5 py-2 text-center text-xs transition disabled:opacity-30 sm:min-h-0 sm:rounded-md sm:px-2 sm:py-1 ${
    active ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/20 active:bg-white/25'
  }`;
const swatch = (active: boolean) => `h-8 w-8 rounded-full border-2 transition sm:h-6 sm:w-6 ${active ? 'scale-110 border-white' : 'border-white/20 hover:border-white/60'}`;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-white/55">{title}</div>
      {children}
    </div>
  );
}

function Range({ label, value, min, max, step, unit, format, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; format?: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-white/70">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1" />
      <span className="w-14 text-right tabular-nums text-white/70">{format ? format(value) : `${value.toFixed(step < 1 ? 1 : 0)}${unit ?? ''}`}</span>
    </label>
  );
}

function Colour({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <Group title={label}>
      <div className="flex flex-wrap items-center gap-1.5">
        {SPAN_COLOURS.map((c) => (
          <button key={c} className={swatch(value.toLowerCase() === c)} style={{ backgroundColor: c }} onClick={() => onChange(c)} aria-label={c} />
        ))}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-white/20 bg-transparent sm:h-6 sm:w-8" aria-label={`${label}, custom`} />
      </div>
    </Group>
  );
}

/**
 * Every setting of a bridge except its path: what it carries, how it is held up, its frame, railings,
 * size and colours. Used for the bridge about to be built and for placed ones.
 */
export function SpanEditor({ spec, onChange, onPreset, activePreset }: { spec: SpanSpec; onChange: (change: Partial<SpanSpec>) => void; onPreset?: (id: string) => void; activePreset?: string }) {
  const framed = spec.structure !== 'beam';
  const frameLabel = spec.structure === 'arch' ? 'Arch height' : spec.structure === 'truss' ? 'Truss depth' : 'Tower height';
  return (
    <div className="flex flex-col gap-3 text-xs text-white">
      {onPreset && (
        <Group title="Type">
          <div className="grid grid-cols-2 gap-1.5">
            {SPAN_PRESETS.map((p) => (
              <button key={p.id} className={chip(activePreset === p.id)} onClick={() => onPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-white/45">Each type loads its usual look. Change anything after it.</p>
        </Group>
      )}

      <Group title="Carries">
        <div className="flex flex-wrap gap-1.5">
          {SPAN_KINDS.map((k) => (
            <button key={k.id} className={chip(spec.kind === k.id)} onClick={() => onChange({ kind: k.id as SpanKind, ...(k.id === 'foot' ? { surface: '#a38662', lanes: 1 } : k.id === 'road' ? { surface: '#3c3f44', lanes: 2 } : { lanes: 2 }) })}>
              {k.label}
            </button>
          ))}
        </div>
        {spec.kind === 'foot' ? (
          <Range label="Width" value={spec.width} min={1.5} max={12} step={0.1} unit=" m" onChange={(width) => onChange({ width })} />
        ) : (
          <Range label={spec.kind === 'road' ? 'Lanes' : 'Tracks'} value={spec.lanes} min={1} max={spec.kind === 'road' ? 6 : 3} step={1} format={(v) => `${v} (${spanWidth({ ...spec, lanes: v }).toFixed(1)} m)`} onChange={(lanes) => onChange({ lanes })} />
        )}
      </Group>

      <Group title="Shape">
        <Range label="Height" value={spec.height} min={1} max={60} step={0.5} unit=" m" onChange={(height) => onChange({ height })} />
        <Range label="Ramp" value={spec.ramp} min={0} max={300} step={5} format={(v) => (v ? `${v} m` : 'auto')} onChange={(ramp) => onChange({ ramp })} />
        <Range label="Deck depth" value={spec.thickness} min={0.3} max={4} step={0.1} unit=" m" onChange={(thickness) => onChange({ thickness })} />
        <div className="flex gap-3">
          <label className="flex min-h-9 flex-1 items-center justify-between sm:min-h-0">
            <span className="text-white/80">Ramp up at start</span>
            <input type="checkbox" className="h-5 w-5" checked={spec.rampA} onChange={(e) => onChange({ rampA: e.target.checked })} />
          </label>
          <label className="flex min-h-9 flex-1 items-center justify-between sm:min-h-0">
            <span className="text-white/80">Ramp down at end</span>
            <input type="checkbox" className="h-5 w-5" checked={spec.rampB} onChange={(e) => onChange({ rampB: e.target.checked })} />
          </label>
        </div>
        <label className="flex min-h-9 items-center justify-between sm:min-h-0">
          <span className="text-white/80">Smooth bends</span>
          <input type="checkbox" className="h-5 w-5" checked={spec.smooth} onChange={(e) => onChange({ smooth: e.target.checked })} />
        </label>
        <p className="text-white/45">Untick a ramp to keep that end up at deck height, to join another bridge.</p>
      </Group>

      <Group title="Frame">
        <div className="flex flex-wrap gap-1.5">
          {SPAN_STRUCTURES.map((s) => (
            <button key={s.id} className={chip(spec.structure === s.id)} onClick={() => onChange({ structure: s.id as SpanStructure, ...(s.id === 'suspension' || s.id === 'cable' ? { frameH: Math.max(spec.frameH, 28), support: 'none' as SpanSupport } : s.id === 'arch' ? { frameH: 14 } : s.id === 'truss' ? { frameH: 7 } : {}) })}>
              {s.label}
            </button>
          ))}
        </div>
        {framed && <Range label={frameLabel} value={spec.frameH} min={3} max={90} step={1} unit=" m" onChange={(frameH) => onChange({ frameH })} />}
        {framed && <p className="text-white/45">The frame needs a long level stretch. Lengthen the bridge or shorten the ramps if it does not appear.</p>}
      </Group>

      <Group title="Supports">
        <div className="flex flex-wrap gap-1.5">
          {SPAN_SUPPORTS.map((s) => (
            <button key={s.id} className={chip(spec.support === s.id)} onClick={() => onChange({ support: s.id as SpanSupport })}>
              {s.label}
            </button>
          ))}
        </div>
        {spec.support !== 'none' && (
          <>
            <Range label="Spacing" value={spec.spacing} min={6} max={80} step={1} unit=" m" onChange={(spacing) => onChange({ spacing })} />
            {spec.support !== 'arches' && <Range label="Thickness" value={spec.pillar} min={0.4} max={6} step={0.1} unit=" m" onChange={(pillar) => onChange({ pillar })} />}
          </>
        )}
      </Group>

      <Group title="Railings">
        <div className="flex flex-wrap gap-1.5">
          {SPAN_RAILINGS.map((r) => (
            <button key={r.id} className={chip(spec.railing === r.id)} onClick={() => onChange({ railing: r.id as SpanRailing })}>
              {r.label}
            </button>
          ))}
        </div>
        {spec.kind !== 'rail' && (
          <label className="flex min-h-9 items-center justify-between sm:min-h-0">
            <span className="text-white/80">Lamps (lit at night)</span>
            <input type="checkbox" className="h-5 w-5" checked={spec.lights} onChange={(e) => onChange({ lights: e.target.checked })} />
          </label>
        )}
      </Group>

      <Colour label="Deck and walls" value={spec.deck} onChange={(deck) => onChange({ deck })} />
      {spec.kind !== 'rail' && <Colour label={spec.kind === 'road' ? 'Road surface' : 'Walkway'} value={spec.surface} onChange={(surface) => onChange({ surface })} />}
      {(framed || spec.railing === 'rail' || spec.railing === 'glass') && <Colour label="Frame and railings" value={spec.frame} onChange={(frame) => onChange({ frame })} />}
      {spec.support !== 'none' && <Colour label="Supports" value={spec.support_colour} onChange={(support_colour) => onChange({ support_colour })} />}
    </div>
  );
}
