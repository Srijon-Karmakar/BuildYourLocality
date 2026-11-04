import { useEffect, useMemo, useRef } from 'react';
import { BLOCK_MAX, BLOCK_MIN, BLOCK_STYLES, blockStats, generateBlock, type BlockConfig } from '../lib/blockGen';
import { PIECES } from '../city/catalog';
import { useBlockGenStore } from '../state/useBlockGenStore';

const chip = (on: boolean) =>
  `rounded-md px-2 py-1.5 text-xs transition sm:py-1 ${on ? 'bg-white text-black' : 'bg-white/10 text-white/80 active:bg-white/20 sm:hover:bg-white/20'}`;

function Slide({ label, value, min, max, step = 1, format, onChange }: { label: string; value: number; min: number; max: number; step?: number; format?: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-white">
      <span className="w-16 shrink-0 text-white/70">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1" />
      <span className="w-12 text-right tabular-nums text-white/70">{format ? format(value) : value}</span>
    </label>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** A flat top-down picture of the block, redrawn live as the settings change. */
function MiniPreview({ config }: { config: BlockConfig }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pieces = useMemo(() => generateBlock(config, 0, 0), [config]);
  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const size = 232;
    const cell = Math.max(4, Math.floor(size / Math.max(config.w, config.d)));
    c.width = config.w * cell;
    c.height = config.d * cell;
    g.fillStyle = '#35502f';
    g.fillRect(0, 0, c.width, c.height);
    const at = (p: { gx: number; gz: number; offset?: [number, number] }) => [p.gx * cell + cell / 2 + ((p.offset?.[0] ?? 0) / 6) * cell, p.gz * cell + cell / 2 + ((p.offset?.[1] ?? 0) / 6) * cell];
    for (const p of pieces) {
      const def = PIECES[p.type];
      const swap = p.rot % 2 === 1;
      const fw = swap ? def.footprint[1] : def.footprint[0];
      const fd = swap ? def.footprint[0] : def.footprint[1];
      const x = p.gx * cell;
      const z = p.gz * cell;
      const [cx, cz] = at(p);
      if (p.type === 'road') {
        g.fillStyle = '#4a4d52';
        g.fillRect(x, z, cell, cell);
      } else if (p.type === 'park') {
        g.fillStyle = '#4f8a45';
        g.fillRect(x, z, cell, cell);
      } else if (def.paintable) {
        const lightness = 78 - Math.min(48, (p.floors ?? def.floors) * 2.4);
        g.fillStyle = `hsl(${p.type === 'warehouse' ? 215 : 28}, 25%, ${lightness}%)`;
        g.fillRect(x + 1, z + 1, fw * cell - 2, fd * cell - 2);
      } else if (def.category === 'nature' && p.type !== 'fountain') {
        g.fillStyle = '#1f4a22';
        g.beginPath();
        g.arc(cx, cz, cell * 0.2, 0, Math.PI * 2);
        g.fill();
      } else if (p.type === 'lamp') {
        g.fillStyle = '#ffd23f';
        g.fillRect(cx - 1, cz - 1, 2, 2);
      } else {
        g.fillStyle = p.type === 'fountain' ? '#5fb2e6' : '#d9c27a';
        g.fillRect(x + cell * 0.25, z + cell * 0.25, cell * 0.5, cell * 0.5);
      }
    }
  }, [pieces, config.w, config.d]);
  return <canvas ref={canvas} className="mx-auto block max-w-full rounded-lg border border-white/15" />;
}

/** The block generator's settings and live preview. Click the map to stamp the block where it hovers. */
export function BlockGenPanel() {
  const config = useBlockGenStore((s) => s.config);
  const last = useBlockGenStore((s) => s.last);
  const set = useBlockGenStore((s) => s.set);
  const shuffle = useBlockGenStore((s) => s.shuffle);
  const stats = useMemo(() => blockStats(generateBlock(config, 0, 0)), [config]);

  return (
    <div className="flex flex-col gap-2.5 text-xs text-white">
      <MiniPreview config={config} />
      <div className="text-center text-[11px] text-white/55">
        {stats.buildings} buildings · {stats.trees} trees · {stats.roads} road cells · {stats.parks} parks
      </div>

      <div className="flex flex-wrap gap-1">
        {BLOCK_STYLES.map((s) => (
          <button key={s.id} className={chip(config.style === s.id)} onClick={() => set({ style: s.id })}>
            {s.label}
          </button>
        ))}
      </div>

      <Slide label="Width" value={config.w} min={BLOCK_MIN} max={BLOCK_MAX} onChange={(w) => set({ w })} />
      <Slide label="Depth" value={config.d} min={BLOCK_MIN} max={BLOCK_MAX} onChange={(d) => set({ d })} />
      <Slide label="Density" value={config.density} min={0.1} max={1} step={0.05} format={pct} onChange={(density) => set({ density })} />
      <Slide label="Height" value={config.height} min={0} max={1} step={0.05} format={pct} onChange={(height) => set({ height })} />
      <Slide label="Trees" value={config.trees} min={0} max={1} step={0.05} format={pct} onChange={(trees) => set({ trees })} />
      <Slide label="Parks" value={config.parks} min={0} max={1} step={0.05} format={pct} onChange={(parks) => set({ parks })} />
      <Slide label="Street life" value={config.props} min={0} max={1} step={0.05} format={pct} onChange={(props) => set({ props })} />

      <div className="flex flex-wrap items-center gap-1">
        <button className={chip(config.ring)} onClick={() => set({ ring: !config.ring })}>
          Road round edge
        </button>
        <button className={chip(config.road === 'lane')} onClick={() => set({ road: config.road === 'lane' ? 'street' : 'lane' })}>
          {config.road === 'lane' ? 'Narrow lanes' : 'Streets'}
        </button>
        <button className={chip(config.variety)} onClick={() => set({ variety: !config.variety })}>
          Mixed colours
        </button>
      </div>
      <Slide label="Streets" value={config.streets} min={0} max={12} format={(v) => (v < 3 ? 'none' : `every ${v}`)} onChange={(streets) => set({ streets: streets < 3 ? 0 : streets })} />

      <div className="flex items-center gap-2">
        <span className="text-white/70">Seed {config.seed}</span>
        <button className="ml-auto rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black active:bg-white/80" onClick={shuffle}>
          Shuffle
        </button>
        <button className={chip(config.reroll)} onClick={() => set({ reroll: !config.reroll })} title="Pick a new layout after every stamp">
          Auto-shuffle
        </button>
      </div>
      <p className="text-[11px] leading-snug text-white/50">
        Move over the map to see the block as a ghost, then click (or tap twice on a phone) to build it. Spots that are blocked are skipped. One undo removes the whole block.
      </p>
      {last && <p className="text-[11px] text-amber-300">{last}</p>}
    </div>
  );
}
