import { useEffect, useState } from 'react';
import { MONEY_PACKS, PAYMENTS_ENABLED, buyMoneyPack } from '../lib/payments';
import { AD_COOLDOWN_S, MAX_ADS_PER_DAY, MONEY_PER_AD } from '../lib/rewards';
import { useMoneyFormat } from '../lib/currency';
import { adBlockedReason, redeemCode, watchAdForMoney } from '../lib/wallet';
import { combat } from '../sim/combat';
import { useAuthStore } from '../state/useAuthStore';
import { useShopStore } from '../state/useShopStore';
import { useWalletStore } from '../state/useWalletStore';
import { CurrencyPicker } from './CurrencyPicker';
import { Icon } from './icons';

/** True while a survival run is being played: ads would freeze the screen at a bad moment. */
const inDanger = () => combat.active && combat.run.active && combat.player.alive && combat.run.outcome === 'none';

const heading = 'text-[11px] uppercase tracking-wider text-white/45';

/** The money page: balance, ways to earn and buy it, what it buys, a code box and the currency. */
export function MoneyPanel() {
  const fmt = useMoneyFormat();
  const money = useWalletStore((s) => s.money);
  const adsToday = useWalletStore((s) => s.adsToday);
  const watching = useWalletStore((s) => s.watching);
  const signedIn = useAuthStore((s) => !!s.session);
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [, tick] = useState(0);

  // The cooldown and the survival check change with time, not with state.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const blocked = inDanger() ? 'Not during a survival run: finish or lose it first.' : adBlockedReason();
  const left = Math.max(0, MAX_ADS_PER_DAY - adsToday.count);

  const redeem = async () => {
    setRedeeming(true);
    setMessage(await redeemCode(code));
    setRedeeming(false);
    setCode('');
  };

  return (
    <div className="flex flex-col gap-3 text-xs text-white sm:text-sm">
      <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
        <span className="flex items-center gap-2 text-white/70">
          <Icon name="coins" className="text-lg text-amber-300" />
          Your money
        </span>
        <span className="text-2xl font-semibold tabular-nums text-amber-300">{fmt(money)}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={heading}>Earn</span>
        <p className="text-[11px] leading-snug text-white/50">Money you find on the streets while walking goes straight into your balance.</p>
        <button
          disabled={watching || !!blocked}
          onClick={async () => setMessage(await watchAdForMoney())}
          className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-amber-400 px-4 text-sm font-medium text-black active:bg-amber-300 disabled:opacity-45 sm:min-h-0 sm:py-2"
        >
          <Icon name="watchad" />
          {watching ? 'Ad playing…' : `Watch an ad: +${fmt(MONEY_PER_AD)}`}
        </button>
        <p className="text-center text-[11px] text-white/45">
          {blocked ?? `${left} of ${MAX_ADS_PER_DAY} ads left today, one every ${AD_COOLDOWN_S}s at most.`}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={heading}>Buy money</span>
        <ul className="grid grid-cols-2 gap-1.5">
          {MONEY_PACKS.map((p) => (
            <li key={p.id} className="flex flex-col gap-1 rounded-2xl bg-white/5 p-2.5">
              <span className="flex items-center justify-between gap-1">
                <span className="truncate text-sm font-medium">{p.label}</span>
                {p.badge && <span className="shrink-0 rounded-full bg-emerald-400/90 px-1.5 text-[10px] font-semibold text-black">{p.badge}</span>}
              </span>
              <span className="text-base font-semibold tabular-nums text-amber-300">{fmt(p.money)}</span>
              <button
                disabled={!PAYMENTS_ENABLED}
                onClick={async () => setMessage(await buyMoneyPack(p.id))}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black active:bg-white/80 disabled:bg-white/15 disabled:text-white/45"
              >
                {PAYMENTS_ENABLED ? `$${(p.cents / 100).toFixed(2)}` : 'Coming soon'}
              </button>
            </li>
          ))}
        </ul>
        {!PAYMENTS_ENABLED && <p className="text-[11px] text-white/45">Real-money purchases are not open yet.</p>}
      </div>

      <button
        onClick={() => useShopStore.getState().show()}
        className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black active:bg-white/80 sm:min-h-0 sm:py-2"
      >
        <Icon name="kiosk" />
        Open the shop
      </button>

      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void redeem();
        }}
      >
        <span className={heading}>Redeem a code</span>
        <div className="flex gap-1.5">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter code"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-full bg-white/10 px-3.5 py-2 text-base outline-none placeholder:text-white/35 sm:text-sm"
          />
          <button
            type="submit"
            disabled={!code.trim() || redeeming || !signedIn}
            className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black active:bg-white/80 disabled:bg-white/15 disabled:text-white/45"
          >
            {redeeming ? '…' : 'Redeem'}
          </button>
        </div>
        {!signedIn && <span className="text-[11px] text-white/45">Sign in to redeem a code.</span>}
      </form>

      <div className="border-t border-white/10 pt-3">
        <CurrencyPicker />
      </div>

      {message && <p className="text-center text-xs text-amber-300">{message}</p>}
    </div>
  );
}
