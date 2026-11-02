import type { ReactNode } from 'react';
import {
  WALL_CAPS,
  WALL_COLOURS,
  WALL_OPENINGS,
  WALL_POSTS,
  WALL_STYLES,
  type WallCap,
  type WallOpening,
  type WallPosts,
  type WallSpec,
  type WallStyleId,
  wallStyleOf,
} from '../city/walls';
import { Icon } from './icons';

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

function Range({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-white/70">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1" />
      <span className="w-12 text-right tabular-nums text-white/70">
        {value.toFixed(step < 0.1 ? 2 : 1)}
        {unit}
      </span>
    </label>
  );
}

function ColourRow({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {WALL_COLOURS.map((c) => (
        <button key={c} className={swatch(value.toLowerCase() === c)} style={{ backgroundColor: c }} onClick={() => onChange(c)} aria-label={c} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-white/20 bg-transparent sm:h-6 sm:w-8" aria-label="Custom colour" />
    </div>
  );
}

/** Every setting of a wall: material, size, colours, top, posts, openings and lamps. Used for the brush and for placed walls. */
export function WallEditor({ spec, onChange, onStyle }: { spec: WallSpec; onChange: (change: Partial<WallSpec>) => void; onStyle: (id: WallStyleId) => void }) {
  const textured = ['modern', 'stone', 'brick', 'block'].includes(spec.style);
  const hasCap = textured;
  const hasGap = spec.style === 'wood' || spec.style === 'iron';
  const colourLabel = textured ? 'Tint' : spec.style === 'glass' ? 'Glass tint' : spec.style === 'hedge' ? 'Leaf colour' : 'Colour';

  return (
    <div className="flex flex-col gap-3 text-xs text-white">
      <Group title="Material">
        <div className="grid grid-cols-2 gap-1.5">
          {WALL_STYLES.map((s) => (
            <button key={s.id} className={chip(spec.style === s.id) + ' flex items-center justify-center gap-1.5'} onClick={() => onStyle(s.id)}>
              <Icon name={s.icon} /> {s.label}
            </button>
          ))}
        </div>
        <p className="text-white/45">Switching material loads that material's usual look; change anything after it.</p>
      </Group>

      <Group title="Size">
        <Range label="Height" value={spec.height} min={0.5} max={6} step={0.1} unit=" m" onChange={(height) => onChange({ height })} />
        <Range label="Thickness" value={spec.thickness} min={0.06} max={1.2} step={0.02} unit=" m" onChange={(thickness) => onChange({ thickness })} />
        {hasGap && <Range label="Spacing" value={spec.gap} min={0} max={0.6} step={0.01} unit=" m" onChange={(gap) => onChange({ gap })} />}
      </Group>

      <Group title={colourLabel}>
        <ColourRow value={spec.colour} onChange={(colour) => onChange({ colour })} />
      </Group>

      {hasCap && (
        <Group title="Top">
          <div className="flex flex-wrap gap-1.5">
            {WALL_CAPS.map((c) => (
              <button key={c.id} className={chip(spec.cap === c.id)} onClick={() => onChange({ cap: c.id as WallCap })}>
                {c.label}
              </button>
            ))}
          </div>
          {spec.cap !== 'none' && <ColourRow value={spec.capColour} onChange={(capColour) => onChange({ capColour })} />}
        </Group>
      )}

      {spec.style !== 'hedge' && (
        <Group title="Posts">
          <div className="flex flex-wrap gap-1.5">
            {WALL_POSTS.map((p) => (
              <button key={p.id} className={chip(spec.posts === p.id)} onClick={() => onChange({ posts: p.id as WallPosts })}>
                {p.label}
              </button>
            ))}
          </div>
          {spec.posts !== 'none' && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-white/55">Every</span>
                {[1, 1.5, 2, 3, 6].map((m) => (
                  <button key={m} className={chip(spec.postEvery === m)} onClick={() => onChange({ postEvery: m })}>
                    {m} m
                  </button>
                ))}
              </div>
              <ColourRow value={spec.postColour} onChange={(postColour) => onChange({ postColour })} />
            </>
          )}
        </Group>
      )}

      <Group title="Opening">
        <div className="flex flex-wrap gap-1.5">
          {WALL_OPENINGS.map((o) => (
            <button key={o.id} className={chip(spec.opening === o.id)} onClick={() => onChange({ opening: o.id as WallOpening })}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-white/45">A 2.4 m opening in the middle of each piece: a gap to walk through, a gate, or an arch over it.</p>
      </Group>

      {spec.posts !== 'none' && spec.style !== 'hedge' && (
        <label className="flex min-h-9 items-center justify-between sm:min-h-0">
          <span className="text-white/80">Lamps on the posts (lit at night)</span>
          <input type="checkbox" className="h-5 w-5" checked={spec.lights} onChange={(e) => onChange({ lights: e.target.checked })} />
        </label>
      )}

      <button className={chip(false)} onClick={() => onStyle(spec.style)}>
        Reset to the usual {wallStyleOf(spec.style).label.toLowerCase()}
      </button>
    </div>
  );
}
