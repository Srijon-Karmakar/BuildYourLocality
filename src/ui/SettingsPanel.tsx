import { useState } from 'react';
import { useGameStore } from '../state/useGameStore';

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const graphics = useGameStore((s) => s.graphics);
  const setGraphics = useGameStore((s) => s.setGraphics);

  return (
    <div className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-xl bg-black/50 px-3 py-2 text-sm text-white backdrop-blur-sm hover:bg-black/60"
      >
        Settings
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-64 rounded-xl bg-black/70 p-4 text-sm text-white backdrop-blur-sm">
          <div className="mb-3">
            <label className="mb-1 block text-white/70">Draw distance (chunks): {graphics.drawDistance}</label>
            <input
              type="range"
              min={2}
              max={16}
              value={graphics.drawDistance}
              onChange={(e) => setGraphics({ drawDistance: Number(e.target.value) })}
              className="w-full"
            />
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-white/70">Texture quality</label>
            <div className="flex gap-1">
              {(['low', 'medium', 'high'] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => setGraphics({ textureQuality: q })}
                  className={`flex-1 rounded-lg px-2 py-1 capitalize ${
                    graphics.textureQuality === q ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between">
            <span className="text-white/70">Shadows</span>
            <input
              type="checkbox"
              checked={graphics.shadows}
              onChange={(e) => setGraphics({ shadows: e.target.checked })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
