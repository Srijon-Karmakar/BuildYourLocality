import { useGameStore, type RoamSubMode } from '../state/useGameStore';

const ROAM_SUBMODES: RoamSubMode[] = ['peaceful', 'normal', 'survival'];

const seg = (active: boolean) =>
  `min-h-11 rounded-xl px-4 capitalize transition sm:min-h-0 sm:rounded-lg sm:px-3 sm:py-1.5 ${
    active ? 'bg-white text-black' : 'text-white/75 active:bg-white/20 sm:hover:bg-white/10'
  }`;

/** Build / Walk switch. Large enough to hit with a thumb. */
export function ModeToggle() {
  const mode = useGameStore((s) => s.mode);
  const setMode = useGameStore((s) => s.setMode);
  return (
    <div className="pointer-events-auto flex gap-1 rounded-2xl bg-black/55 p-1 text-sm text-white backdrop-blur-md sm:rounded-xl">
      {(['build', 'roam'] as const).map((m) => (
        <button key={m} onClick={() => setMode(m)} className={seg(mode === m)} title={m === 'build' ? 'Build (Tab)' : 'Walk (Tab)'}>
          {m === 'build' ? '🏗️ Build' : '🚶 Walk'}
        </button>
      ))}
    </div>
  );
}

/** Walk-mode extras: difficulty sub-mode and fly toggle. */
export function RoamOptions({ stacked = false }: { stacked?: boolean }) {
  const roamSubMode = useGameStore((s) => s.roamSubMode);
  const setRoamSubMode = useGameStore((s) => s.setRoamSubMode);
  const flying = useGameStore((s) => s.flying);
  const toggleFlying = useGameStore((s) => s.toggleFlying);

  return (
    <div className={`pointer-events-auto flex items-center gap-1 text-sm text-white ${stacked ? 'flex-wrap' : 'rounded-xl bg-black/55 p-1 backdrop-blur-md'}`}>
      {ROAM_SUBMODES.map((sub) => (
        <button key={sub} onClick={() => setRoamSubMode(sub)} className={seg(roamSubMode === sub)}>
          {sub}
        </button>
      ))}
      <button
        onClick={toggleFlying}
        className={`min-h-11 rounded-xl px-4 transition sm:min-h-0 sm:rounded-lg sm:px-3 sm:py-1.5 ${
          flying ? 'bg-sky-400 text-black' : 'text-white/75 active:bg-white/20 sm:hover:bg-white/10'
        }`}
        title="Toggle fly mode (F). Space up, Shift down."
      >
        Fly <span className="hidden text-xs opacity-60 sm:inline">F</span>
      </button>
    </div>
  );
}

/** Desktop top-left cluster: mode switch plus walk options. */
export function ModeBar() {
  const mode = useGameStore((s) => s.mode);
  return (
    <div className="flex items-center gap-2">
      <ModeToggle />
      {mode === 'roam' && <RoamOptions />}
    </div>
  );
}
