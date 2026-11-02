import { useSyncStore } from '../state/useSyncStore';

/** Shown once when a guest world and a saved account world both exist, so nothing is lost silently. */
export function SyncConflictDialog() {
  const conflict = useSyncStore((s) => s.conflict);
  const resolve = useSyncStore((s) => s.resolveConflict);
  if (!conflict) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-end justify-center bg-black/45 p-3 backdrop-blur-[4px] sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl bg-neutral-900 p-5 text-white shadow-2xl"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 1.25rem)' }}
      >
        <h2 className="text-lg font-semibold">Welcome back!</h2>
        <p className="mt-2 text-sm text-white/70">
          Your account already has a saved world ({conflict.cloudCount} pieces), and you've also built {conflict.localCount}{' '}
          pieces on this device. What should happen to what you just built?
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            className="min-h-10 rounded-full bg-white px-4 font-medium text-black active:bg-white/80"
            onClick={() => resolve('cloud')}
          >
            Continue my saved world
          </button>
          <button
            className="min-h-10 rounded-full bg-white/10 px-4 text-white/90 active:bg-white/20"
            onClick={() => resolve('local')}
          >
            {conflict.canAdd ? 'Keep both: save what I built as a new world' : 'Keep what I just built (replaces the saved world)'}
          </button>
        </div>
      </div>
    </div>
  );
}
