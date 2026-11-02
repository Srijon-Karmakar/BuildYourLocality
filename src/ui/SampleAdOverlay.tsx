import { SAMPLE_AD_SECONDS, useSampleAd } from '../lib/rewardedAd';
import { Icon } from './icons';

/** Stand-in for a rewarded video until an ad network is registered (see lib/rewardedAd.ts). */
export function SampleAdOverlay() {
  const left = useSampleAd((s) => s.left);
  const cancel = useSampleAd((s) => s.cancel);
  if (left === null) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/90 px-6 text-center text-white">
      <div className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wider text-white/60">Sample ad</div>
      <Icon name="watchad" size={56} className="text-white/80" />
      <p className="max-w-xs text-sm text-white/70">
        A real ad plays here once an ad network is connected. Watch to the end to unlock another world.
      </p>
      <div className="h-2 w-56 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-1000 ease-linear" style={{ width: `${((SAMPLE_AD_SECONDS - left) / SAMPLE_AD_SECONDS) * 100}%` }} />
      </div>
      <div className="text-sm tabular-nums text-white/60">Reward in {left}s</div>
      <button className="mt-2 rounded-full bg-white/10 px-5 py-2 text-xs text-white/70 active:bg-white/20 sm:hover:bg-white/15" onClick={cancel}>
        Close (no reward)
      </button>
    </div>
  );
}
