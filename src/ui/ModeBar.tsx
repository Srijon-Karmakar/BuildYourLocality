import { useGameStore, type RoamSubMode } from '../state/useGameStore';

const ROAM_SUBMODES: RoamSubMode[] = ['peaceful', 'normal', 'survival'];

export function ModeBar() {
  const mode = useGameStore((s) => s.mode);
  const roamSubMode = useGameStore((s) => s.roamSubMode);
  const setMode = useGameStore((s) => s.setMode);
  const setRoamSubMode = useGameStore((s) => s.setRoamSubMode);
  const flying = useGameStore((s) => s.flying);
  const toggleFlying = useGameStore((s) => s.toggleFlying);

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-black/50 px-3 py-2 text-sm text-white backdrop-blur-sm">
      <div className="flex gap-1">
        {(['build', 'roam'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-lg px-3 py-1.5 capitalize transition ${
              mode === m ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10'
            }`}
          >
            {m === 'build' ? 'Build' : 'Walk'}
          </button>
        ))}
      </div>

      {mode === 'roam' && (
        <div className="flex gap-1 border-l border-white/20 pl-3">
          {ROAM_SUBMODES.map((sub) => (
            <button
              key={sub}
              onClick={() => setRoamSubMode(sub)}
              className={`rounded-lg px-3 py-1.5 capitalize transition ${
                roamSubMode === sub ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      )}

      {mode === 'roam' && (
      <button
        onClick={toggleFlying}
        className={`rounded-lg border-l border-white/20 px-3 py-1.5 transition ${
          flying ? 'bg-sky-400 text-black' : 'text-white/70 hover:bg-white/10'
        }`}
        title='Toggle fly mode (F). Space up, Shift down.'
      >
        Fly <span className='text-xs opacity-60'>F</span>
      </button>
      )}
    </div>
  );
}
