import { useMoneyFormat } from '../lib/currency';
import { useMenuStore } from '../state/useMenuStore';
import { useWalletStore } from '../state/useWalletStore';
import { Icon } from './icons';

/** The balance, always in view at the top. Tap it for the money page. */
export function MoneyChip() {
  const fmt = useMoneyFormat();
  const money = useWalletStore((s) => s.money);
  const open = useMenuStore((s) => s.open && s.tab === 'money');
  const toggle = useMenuStore((s) => s.toggle);
  return (
    <button
      onClick={() => toggle('money')}
      aria-label={`Money: ${fmt(money)}. Open the money page`}
      className={`pointer-events-auto flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs tabular-nums text-white backdrop-blur-[6px] transition sm:h-10 sm:px-3.5 sm:text-sm ${
        open ? 'bg-white/25' : 'bg-black/40 pointer-coarse:bg-black/64 active:bg-white/20 sm:hover:bg-black/48'
      }`}
    >
      <Icon name="coins" className="text-base text-amber-300" />
      <span>{fmt(money)}</span>
    </button>
  );
}
