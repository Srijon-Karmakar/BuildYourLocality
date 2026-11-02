import { CELL, PIECES, PLANT_TYPES, type PieceType } from '../city/catalog';
import { useBuilderStore } from '../state/useBuilderStore';
import { Icon } from './icons';

const chip = (active: boolean) =>
  `flex min-h-9 items-center gap-1 rounded-lg px-2.5 py-2 text-xs transition sm:min-h-0 sm:rounded-md sm:py-1 ${
    active ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'
  }`;

/** The forest brush: plant or clear whole woods in a click or a drag. */
export function ForestSettings() {
  const forest = useBuilderStore((s) => s.forest);
  const setForest = useBuilderStore((s) => s.setForest);
  const planting = forest.mode === 'plant';
  const approx = Math.round(forest.density * Math.PI * forest.radius * forest.radius);

  const toggle = (type: PieceType) => {
    const has = forest.species.includes(type);
    // Keep at least one kind selected, or the brush would plant nothing.
    if (has && forest.species.length === 1) return;
    setForest({ species: has ? forest.species.filter((s) => s !== type) : [...forest.species, type] });
  };

  return (
    <div className="flex flex-col gap-3 text-xs text-white">
      <div className="flex gap-1.5">
        <button className={chip(planting) + ' flex-1 justify-center'} onClick={() => setForest({ mode: 'plant' })}>
          <Icon name="woods" /> Plant
        </button>
        <button className={chip(!planting) + ' flex-1 justify-center'} onClick={() => setForest({ mode: 'clear' })}>
          <Icon name="eraser" /> Clear trees
        </button>
      </div>

      <div>
        <div className="mb-1.5 text-white/55">
          Brush size: {forest.radius.toFixed(1)} cells (~{Math.round(forest.radius * CELL)} m)
        </div>
        <input type="range" min={1} max={14} step={0.5} value={forest.radius} onChange={(e) => setForest({ radius: Number(e.target.value) })} className="w-full" />
      </div>

      {planting && (
        <>
          <div>
            <div className="mb-1.5 text-white/55">
              Density: {forest.density < 0.3 ? 'sparse' : forest.density < 0.8 ? 'woodland' : forest.density < 1.4 ? 'forest' : 'jungle'} (~{approx} trees a click)
            </div>
            <input type="range" min={0.1} max={2} step={0.05} value={forest.density} onChange={(e) => setForest({ density: Number(e.target.value) })} className="w-full" />
          </div>

          <div>
            <div className="mb-1.5 text-white/55">Plants to mix</div>
            <div className="flex flex-wrap gap-1.5">
              {PLANT_TYPES.map((type) => (
                <button key={type} className={chip(forest.species.includes(type))} onClick={() => toggle(type)}>
                  <Icon name={type} /> {PIECES[type].label}
                </button>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <button className={chip(false)} onClick={() => setForest({ species: [...PLANT_TYPES] })}>
                All
              </button>
              <button className={chip(false)} onClick={() => setForest({ species: ['tree', 'pine', 'birch'] })}>
                Temperate
              </button>
              <button className={chip(false)} onClick={() => setForest({ species: ['palm', 'bush', 'tallgrass'] })}>
                Tropical
              </button>
              <button className={chip(false)} onClick={() => setForest({ species: ['grass', 'tallgrass', 'wildflower'] })}>
                Meadow
              </button>
              <button className={chip(false)} onClick={() => setForest({ species: ['tree', 'birch', 'grass', 'wildflower', 'bush'] })}>
                Park
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-white/55">Size variety: {Math.round(forest.sizeVariety * 100)}%</div>
            <input type="range" min={0} max={1} step={0.05} value={forest.sizeVariety} onChange={(e) => setForest({ sizeVariety: Number(e.target.value) })} className="w-full" />
          </div>
        </>
      )}

      <p className="text-white/50">
        {planting
          ? 'Click or drag over open ground. Plants keep off roads and buildings, and each one grows from its own random pattern, so no two match. Ctrl+Z undoes a whole stroke.'
          : 'Click or drag to remove every tree inside the circle. Buildings and roads are left alone.'}
      </p>
    </div>
  );
}
