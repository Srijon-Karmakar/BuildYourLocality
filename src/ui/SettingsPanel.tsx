import { useState } from 'react';
import { useGameStore } from '../state/useGameStore';

/** Graphics options. `inline` shows the controls directly (used inside the phone menu sheet). */
export function SettingsPanel({ inline = false }: { inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const graphics = useGameStore((s) => s.graphics);
  const setGraphics = useGameStore((s) => s.setGraphics);

  const controls = (
    <div className="flex flex-col gap-4 text-sm text-white">
      <div>
        <label className="mb-1 block text-white/70">Draw distance (walk mode): {graphics.drawDistance}</label>
        <input
          type="range"
          min={2}
          max={16}
          value={graphics.drawDistance}
          onChange={(e) => setGraphics({ drawDistance: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      <div>
        <label className="mb-1 block text-white/70">Texture quality</label>
        <div className="flex gap-1">
          {(['low', 'medium', 'high'] as const).map((q) => (
            <button
              key={q}
              onClick={() => setGraphics({ textureQuality: q })}
              className={`min-h-11 flex-1 rounded-lg px-2 capitalize sm:min-h-0 sm:py-1 ${
                graphics.textureQuality === q ? 'bg-white text-black' : 'bg-white/10 text-white/75 hover:bg-white/15'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <label className="flex min-h-11 items-center justify-between sm:min-h-0">
        <span className="text-white/70">Shadows</span>
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={graphics.shadows}
          onChange={(e) => setGraphics({ shadows: e.target.checked })}
        />
      </label>
    </div>
  );

  if (inline) return controls;

  return (
    <div className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-xl bg-black/55 px-3 py-2 text-sm text-white backdrop-blur-md hover:bg-black/65"
      >
        Settings
      </button>
      {open && <div className="absolute right-0 top-12 w-64 rounded-xl bg-black/75 p-4 backdrop-blur-md">{controls}</div>}
    </div>
  );
}
