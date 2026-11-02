import {
  MAX_LANES,
  MIN_LANES,
  PAVEMENTS,
  ROAD_PRESETS,
  ROAD_SURFACES,
  resolveRoad,
  roadLayout,
  type RoadSpec,
} from '../city/catalog';
import { Icon } from './icons';

const chip = (active: boolean) =>
  `min-h-9 rounded-lg px-3 py-2 text-xs transition disabled:opacity-30 sm:min-h-0 sm:rounded-md sm:px-2 sm:py-1 ${
    active ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'
  }`;

const ARROWS = ['North', 'East', 'South', 'West'];
const ARROW_ICONS = ['up', 'right', 'down', 'left'];

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-white/55">{title}</div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex min-h-9 items-center justify-between sm:min-h-0 ${disabled ? 'opacity-40' : ''}`}>
      <span className="text-white/80">{label}</span>
      <input type="checkbox" className="h-5 w-5" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/**
 * Controls for a road's type and rules: lanes, surface, pavements, markings, one-way,
 * roundabout and speed. Used both for the roads about to be placed and for a selected road.
 */
export function RoadSettings({
  spec,
  onChange,
  onPreset,
  activePreset,
}: {
  spec: Partial<RoadSpec>;
  onChange: (patch: Partial<RoadSpec>) => void;
  onPreset?: (id: string) => void;
  activePreset?: string;
}) {
  const road = resolveRoad(spec);
  const layout = roadLayout(road);
  const oneWay = road.oneWay !== null;
  const wide = layout.cellsWide === 3;
  const set = (patch: Partial<RoadSpec>) => onChange(patch);

  return (
    <div className="flex flex-col gap-3 text-xs text-white">
      {onPreset && (
        <Row title="Road type">
          <div className="flex flex-wrap gap-1.5">
            {ROAD_PRESETS.map((p) => (
              <button key={p.id} className={chip(activePreset === p.id)} onClick={() => onPreset(p.id)}>
                <Icon name={p.icon} className="mr-1 inline" />{p.label}
              </button>
            ))}
          </div>
        </Row>
      )}

      <Row title={`Lanes: ${road.lanes}${wide ? ' · wide road (uses 3 cells)' : ''}`}>
        <div className="flex gap-1.5">
          {Array.from({ length: MAX_LANES - MIN_LANES + 1 }, (_, i) => MIN_LANES + i).map((n) => (
            <button key={n} className={chip(road.lanes === n) + ' flex-1 text-center'} onClick={() => set({ lanes: n, median: n >= 3 ? road.median : false })}>
              {n}
            </button>
          ))}
        </div>
      </Row>

      <Row title="Surface">
        <div className="flex flex-wrap gap-1.5">
          {ROAD_SURFACES.map((s) => (
            <button key={s.id} className={chip(road.surface === s.id)} onClick={() => set({ surface: s.id })}>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: s.swatch }} />
              {s.label}
            </button>
          ))}
        </div>
      </Row>

      <Row title="Pavement">
        <div className="flex gap-1.5">
          {PAVEMENTS.map((p) => (
            <button key={p.id} className={chip(road.pavement === p.id) + ' flex-1'} onClick={() => set({ pavement: p.id })}>
              {p.label}
            </button>
          ))}
        </div>
      </Row>

      <Row title="Direction">
        <div className="flex flex-wrap gap-1.5">
          <button className={chip(!oneWay)} onClick={() => set({ oneWay: null })}>
            Two-way
          </button>
          {ARROWS.map((label, i) => (
            <button key={label} className={chip(road.oneWay === i)} onClick={() => set({ oneWay: i, median: false })}>
              <Icon name={ARROW_ICONS[i]} className="mr-1 inline" />{label}
            </button>
          ))}
        </div>
      </Row>

      <div className="flex flex-col gap-0.5 rounded-lg bg-white/5 px-2.5 py-1.5">
        <Toggle label="Central median" checked={road.median} disabled={!wide || oneWay} onChange={(median) => set({ median })} />
        <Toggle label="Bike lanes" checked={road.bikeLanes} onChange={(bikeLanes) => set({ bikeLanes })} />
        <Toggle label="Bus lanes" checked={road.busLanes} onChange={(busLanes) => set({ busLanes })} />
        <Toggle label="Zebra crossing on this cell" checked={road.zebra} onChange={(zebra) => set({ zebra })} />
        <Toggle label="Crosswalks at junctions" checked={road.crosswalk} onChange={(crosswalk) => set({ crosswalk })} />
        <Toggle label="Street trees" checked={road.trees} onChange={(trees) => set({ trees })} />
        <Toggle label="Roundabout (at junctions)" checked={road.roundabout} onChange={(roundabout) => set({ roundabout })} />
      </div>

      <Row title={`Speed limit: ${road.speed} km/h`}>
        <input
          type="range"
          min={10}
          max={120}
          step={10}
          value={road.speed}
          onChange={(e) => set({ speed: Number(e.target.value) })}
          className="w-full"
        />
      </Row>
    </div>
  );
}
