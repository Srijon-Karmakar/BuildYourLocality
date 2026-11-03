import { CurrencyPicker } from './CurrencyPicker';
import { useState } from 'react';
import { SoundSettings } from './SoundSettings';
import { construction, useConstructionStore } from '../sim/construction';
import { useBuildRulesStore, type ConstructionMode } from '../state/useBuildRulesStore';
import { useGameStore, type QualityPreset } from '../state/useGameStore';

const seg = (active: boolean) =>
  `min-h-9 flex-1 rounded-xl px-2 text-xs capitalize transition sm:text-sm sm:min-h-0 sm:py-1.5 ${
    active ? 'bg-white text-black' : 'bg-white/10 text-white/80 active:bg-white/25 sm:hover:bg-white/15'
  }`;

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-9 items-center justify-between gap-3 sm:min-h-0">
      <span>
        <span className="block text-white/85">{label}</span>
        {hint && <span className="block text-xs text-white/45">{hint}</span>}
      </span>
      <input type="checkbox" className="h-5 w-5 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Graphics: one quality preset up front, the individual options tucked under "Fine tune". */
export function SettingsPanel() {
  const graphics = useGameStore((s) => s.graphics);
  const setGraphics = useGameStore((s) => s.setGraphics);
  const setPreset = useGameStore((s) => s.setPreset);
  const [advanced, setAdvanced] = useState(false);
  const mode = useBuildRulesStore((s) => s.construction);
  const setMode = useBuildRulesStore((s) => s.setConstruction);
  const sites = useConstructionStore((s) => Object.keys(s.sites).length);

  return (
    <div className="flex flex-col gap-3 text-xs text-white sm:gap-4 sm:text-sm">
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-white/60">Quality</span>
          {graphics.preset === 'custom' && <span className="text-xs text-amber-200/80">Custom</span>}
        </div>
        <div className="flex gap-1.5">
          {(['low', 'medium', 'high'] as QualityPreset[]).map((q) => (
            <button key={q} onClick={() => setPreset(q)} className={seg(graphics.preset === q)}>
              {q}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-white/45">Low is the lightest on batteries and older phones.</p>
      </div>

      <div>
        <div className="mb-1 text-white/60">New buildings</div>
        <div className="flex gap-1.5">
          {([['instant', 'Instant'], ['fast', 'Crew'], ['realistic', 'Slow crew']] as [ConstructionMode, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setMode(id)} className={seg(mode === id)}>
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-white/45">A crew of locals builds each new building floor by floor. They rest at night and in storms.</p>
        {sites > 0 && (
          <button onClick={() => construction.finishAll()} className="mt-2 min-h-9 w-full rounded-xl bg-amber-400/90 px-3 text-sm font-medium text-black active:bg-amber-300 sm:min-h-0 sm:py-1.5">
            Finish {sites} site{sites === 1 ? '' : 's'} now
          </button>
        )}
      </div>

      <Toggle
        label="Smooth frame rate"
        hint="Lowers sharpness a little when the game starts to stutter"
        checked={graphics.adaptive}
        onChange={(adaptive) => setGraphics({ adaptive })}
      />
      <Toggle label="Night glow" hint="Windows, signs and lamps bloom after dark" checked={graphics.bloom} onChange={(bloom) => setGraphics({ bloom })} />
      <Toggle label="Walking sway" hint="Camera bob while you walk" checked={graphics.headBob} onChange={(headBob) => setGraphics({ headBob })} />
      <div className="border-t border-white/10 pt-3">
        <SoundSettings />
      </div>
      <div className="border-t border-white/10 pt-3">
        <CurrencyPicker />
      </div>
      <Toggle label="Show FPS" checked={graphics.showFps} onChange={(showFps) => setGraphics({ showFps })} />

      <button onClick={() => setAdvanced((v) => !v)} className="flex min-h-9 items-center justify-between text-white/70 sm:min-h-0">
        Fine tune
        <span className={`transition ${advanced ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {advanced && (
        <div className="flex flex-col gap-3 border-t border-white/10 pt-3 sm:gap-4">
          <div>
            <label className="mb-1 block text-white/60">View distance (walk mode): {graphics.drawDistance}</label>
            <input type="range" min={2} max={16} value={graphics.drawDistance} onChange={(e) => setGraphics({ drawDistance: Number(e.target.value) })} className="w-full" />
          </div>

          <div>
            <div className="mb-1 text-white/60">Texture detail</div>
            <div className="flex gap-1.5">
              {(['low', 'medium', 'high'] as const).map((q) => (
                <button key={q} onClick={() => setGraphics({ textureQuality: q })} className={seg(graphics.textureQuality === q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-white/60">Traffic &amp; people</div>
            <div className="grid grid-cols-4 gap-1.5">
              {(['off', 'low', 'normal', 'busy'] as const).map((p) => (
                <button key={p} onClick={() => setGraphics({ population: p })} className={seg(graphics.population === p).replace('flex-1', '')}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <Toggle label="Shadows" checked={graphics.shadows} onChange={(shadows) => setGraphics({ shadows })} />
          <Toggle
            label="Light shadow updates"
            hint="Refreshes shadows every other frame"
            checked={graphics.shadowRate === 2}
            onChange={(on) => setGraphics({ shadowRate: on ? 2 : 1 })}
          />
        </div>
      )}
    </div>
  );
}
