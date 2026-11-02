import { isSoundOn, setSoundOn, useAudioStore, type AudioLevels } from '../audio/engine';
import { playSfx } from '../audio/sounds';

const ROWS: { id: keyof AudioLevels; label: string; hint: string; test: () => void }[] = [
  { id: 'master', label: 'Master', hint: 'Everything', test: () => playSfx('pickup') },
  { id: 'effects', label: 'Effects', hint: 'Footsteps, fights, building', test: () => playSfx('place') },
  { id: 'ambience', label: 'Ambience', hint: 'Wind, rain, birds, the city', test: () => playSfx('thunder', 0.5) },
  { id: 'vehicles', label: 'Vehicles', hint: 'Engines, tyres, horns', test: () => playSfx('car_horn') },
];

/** Volume for each kind of sound, remembered on this device. */
export function SoundSettings() {
  const levels = useAudioStore();
  const muted = levels.muted;
  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-h-9 items-center justify-between sm:min-h-0">
        <span>
          <span className="block text-white/85">Sound</span>
          <span className="block text-xs text-white/45">Every sound is made live in your browser</span>
        </span>
        <input type="checkbox" className="h-5 w-5 shrink-0" checked={!muted} onChange={(e) => setSoundOn(e.target.checked)} />
      </label>
      {ROWS.map((row) => (
        <label key={row.id} className={`flex items-center gap-2 ${muted ? 'opacity-40' : ''}`} title={row.hint}>
          <span className="w-20 shrink-0 text-white/70">{row.label}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={levels[row.id]}
            disabled={!isSoundOn()}
            onChange={(e) => levels.set({ [row.id]: Number(e.target.value) })}
            onPointerUp={row.test}
            className="min-w-0 flex-1"
          />
          <span className="w-9 text-right tabular-nums text-white/60">{Math.round(levels[row.id] * 100)}</span>
        </label>
      ))}
    </div>
  );
}
