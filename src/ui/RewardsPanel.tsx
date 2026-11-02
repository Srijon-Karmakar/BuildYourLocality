import { useEffect, useState } from 'react';
import { AD_COOLDOWN_S, MAX_ADS_PER_DAY, REWARDS, TOKENS_PER_AD } from '../lib/rewards';
import { adBlockedReason, buyReward, watchAdForTokens } from '../lib/wallet';
import { combat } from '../sim/combat';
import { useWalletStore } from '../state/useWalletStore';
import { Icon } from './icons';

/** True while a survival run is being played: ads would freeze the screen at a bad moment. */
const inDanger = () => combat.active && combat.run.active && combat.player.alive && combat.run.outcome === 'none';

/** Tokens: watch an ad to earn them, spend them on world slots and loadouts. */
export function RewardsPanel() {
  const tokens = useWalletStore((s) => s.tokens);
  const unlocks = useWalletStore((s) => s.unlocks);
  const adsToday = useWalletStore((s) => s.adsToday);
  const watching = useWalletStore((s) => s.watching);
  const [message, setMessage] = useState<string | null>(null);
  const [, tick] = useState(0);

  // The cooldown and the survival check change with time, not with state.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const danger = inDanger();
  const blocked = danger ? 'Not during a survival run: finish or lose it first.' : adBlockedReason();
  const left = Math.max(0, MAX_ADS_PER_DAY - adsToday.count);

  const earn = async () => setMessage(await watchAdForTokens());
  const buy = async (id: string) => setMessage(await buyReward(id));

  return (
    <div className="flex flex-col gap-3 text-xs text-white sm:text-sm">
      <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
        <span className="flex items-center gap-2 text-white/70">
          <Icon name="coins" className="text-lg text-amber-300" />
          Your tokens
        </span>
        <span className="text-2xl font-semibold tabular-nums text-amber-300">{tokens}</span>
      </div>

      <button
        disabled={watching || !!blocked}
        onClick={() => void earn()}
        className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-amber-400 px-4 text-sm font-medium text-black active:bg-amber-300 disabled:opacity-45 sm:min-h-0 sm:py-2"
      >
        <Icon name="watchad" />
        {watching ? 'Ad playing…' : `Watch an ad: +${TOKENS_PER_AD} tokens`}
      </button>
      <p className="-mt-1 text-center text-[11px] text-white/45">
        {blocked ?? `${left} of ${MAX_ADS_PER_DAY} ads left today, one every ${AD_COOLDOWN_S}s at most.`}
      </p>

      <ul className="flex flex-col gap-1.5">
        {REWARDS.map((r) => {
          const owned = !r.repeatable && unlocks.includes(r.id);
          const afford = tokens >= r.cost;
          return (
            <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-white/5 p-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">
                <Icon name={r.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{r.label}</span>
                <span className="block text-[11px] leading-snug text-white/50">{r.desc}</span>
              </span>
              {owned ? (
                <span className="flex items-center gap-1 text-xs text-emerald-300">
                  <Icon name="check" /> Owned
                </span>
              ) : (
                <button
                  disabled={!afford}
                  onClick={() => void buy(r.id)}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black active:bg-white/80 disabled:bg-white/15 disabled:text-white/40"
                >
                  <Icon name="coins" />
                  {r.cost}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {message && <p className="text-center text-xs text-amber-300">{message}</p>}
    </div>
  );
}
