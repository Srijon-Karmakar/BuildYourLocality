import { useSyncStore } from '../state/useSyncStore';

/** Shown once when a guest city and a saved account city both exist, so nothing is lost silently. */
export function SyncConflictDialog() {
  const conflict = useSyncStore((s) => s.conflict);
  const resolve = useSyncStore((s) => s.resolveConflict);
  if (!conflict) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl bg-neutral-900 p-5 text-white shadow-2xl"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 1.25rem)' }}
      >
        <h2 className="text-lg font-semibold">Welcome back!</h2>
        <p className="mt-2 text-sm text-white/70">
          Your account already has a saved city ({conflict.cloudCount} pieces), and you've also built {conflict.localCount}{' '}
          pieces on this device. Which one do you want to continue with?
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            className="min-h-12 rounded-xl bg-white px-4 font-medium text-black active:bg-white/80"
            onClick={() => resolve('cloud')}
          >
            Continue my saved city
          </button>
          <button
            className="min-h-12 rounded-xl bg-white/10 px-4 text-white/90 active:bg-white/20"
            onClick={() => resolve('local')}
          >
            Keep what I just built (replaces the saved one)
          </button>
        </div>
      </div>
    </div>
  );
}
