import { useState } from 'react';
import { Icon } from './icons';
import { BRUSHES, brushOf, useTerrainStore } from '../terrain/terrain';
import { useBuilderStore } from '../state/useBuilderStore';

const chip = (active: boolean) =>
  `min-h-9 rounded-lg px-3 py-2 text-xs transition disabled:opacity-30 sm:min-h-0 sm:rounded-md sm:px-2 sm:py-1 ${
    active ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'
  }`;

/** Brush size and strength for the terrain tool, plus terrain-only undo and reset. */
export function TerrainSettings() {
  const { brush, brushRadius, brushMagnitude, setBrush, setBrushRadius, setBrushMagnitude } = useBuilderStore();
  const def = brushOf(brush);
  const canUndo = useTerrainStore((s) => s.past.length > 0);
  const canRedo = useTerrainStore((s) => s.future.length > 0);
  const hasTerrain = useTerrainStore((s) => Object.keys(s.cells).length > 0);
  const [confirm, setConfirm] = useState(false);
  const shapes = def.kind === 'raise' || def.kind === 'lower';

  return (
    <div className="flex flex-col gap-3 text-xs text-white">
      <div>
        <div className="mb-1.5 text-white/55">Brush</div>
        <div className="flex flex-wrap gap-1.5">
          {BRUSHES.map((b) => (
            <button key={b.id} className={chip(brush === b.id)} onClick={() => setBrush(b.id)}>
              <Icon name={b.icon} className="mr-1 inline" />{b.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-white/55">Brush size: {brushRadius.toFixed(1)} cells (~{Math.round(brushRadius * 6)} m)</div>
        <input type="range" min={1} max={16} step={0.5} value={brushRadius} onChange={(e) => setBrushRadius(Number(e.target.value))} className="w-full" />
      </div>

      {shapes && (
        <div>
          <div className="mb-1.5 text-white/55">
            {def.kind === 'raise' ? `Height: ${brushMagnitude} m` : `Depth: ${Math.abs(brushMagnitude)} m`}
          </div>
          <input
            type="range"
            min={def.kind === 'raise' ? 2 : 1}
            max={def.kind === 'raise' ? 80 : 20}
            step={1}
            value={Math.abs(brushMagnitude)}
            onChange={(e) => setBrushMagnitude(def.kind === 'raise' ? Number(e.target.value) : -Number(e.target.value))}
            className="w-full"
          />
        </div>
      )}

      <p className="text-white/50">
        {def.kind === 'raise' && 'Click or drag to raise land. Buildings and roads keep their ground level.'}
        {def.kind === 'lower' && 'Dig below ground level and the hollow fills with water. Drag to carve a river.'}
        {def.kind === 'flatten' && 'Smooths ground back to level.'}
        {def.kind === 'cover' && 'Paint over the ground. Trees are cleared where you build.'}
        {def.kind === 'clearCover' && 'Removes trees, sand and rock.'}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <button className={chip(false)} disabled={!canUndo} onClick={() => useTerrainStore.getState().undo()}>
          <Icon name="undo" className="mr-1 inline" />Undo terrain
        </button>
        <button className={chip(false)} disabled={!canRedo} onClick={() => useTerrainStore.getState().redo()}>
          <Icon name="redo" className="mr-1 inline" />Redo
        </button>
        <button
          className={chip(confirm) + (confirm ? ' !bg-red-600 !text-white' : ' !text-red-300')}
          disabled={!hasTerrain}
          onBlur={() => setConfirm(false)}
          onClick={() => {
            if (confirm) {
              useTerrainStore.getState().clear();
              setConfirm(false);
            } else setConfirm(true);
          }}
        >
          {confirm ? 'Really reset?' : 'Reset terrain'}
        </button>
      </div>
    </div>
  );
}
