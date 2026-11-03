import { useEffect, useState } from 'react';
import { useMoneyFormat } from '../lib/currency';
import { MONEY_PACKS, PAYMENTS_ENABLED, buyMoneyPack } from '../lib/payments';
import { SHOP_CATEGORIES, SHOP_ITEMS, priceOf, type ShopItem } from '../lib/shop';
import { buyReward } from '../lib/wallet';
import { combat } from '../sim/combat';
import { useShopStore } from '../state/useShopStore';
import { useWalletStore } from '../state/useWalletStore';
import { useWorldsStore } from '../state/useWorldsStore';
import { Icon } from './icons';

/** Why a service cannot be bought right now, or null. */
function serviceBlocked(item: ShopItem): string | null {
  if (item.id === 'ammo' && !(combat.active || combat.arms)) return 'Only during a walk';
  if (item.id === 'revive' && !(combat.active && !combat.player.alive)) return 'Only after a knock-out';
  return null;
}

function ItemCard({ item, onMessage }: { item: ShopItem; onMessage: (m: string) => void }) {
  const fmt = useMoneyFormat();
  const money = useWalletStore((s) => s.money);
  const owned = useWalletStore((s) => item.kind === 'unlock' && s.unlocks.includes(item.id));
  const extra = useWorldsStore((s) => s.extraSlots);
  const [busy, setBusy] = useState(false);
  const price = priceOf(item, extra);
  const blocked = item.kind === 'service' ? serviceBlocked(item) : null;
  const short = money < price;

  const buy = async () => {
    setBusy(true);
    onMessage(await buyReward(item.id));
    setBusy(false);
  };

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-white/15 bg-white/[0.07] p-3.5 transition hover:bg-white/[0.11]">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-2xl text-white">
          <Icon name={item.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{item.label}</div>
          <div className="text-xs tabular-nums text-amber-300">{fmt(price)}</div>
        </div>
      </div>
      <p className="flex-1 text-xs leading-snug text-white/60">{item.desc}</p>
      {owned ? (
        <div className="flex items-center justify-center gap-1.5 rounded-full bg-emerald-400/20 py-2 text-xs font-semibold text-emerald-300">
          <Icon name="check" /> Owned
        </div>
      ) : (
        <button
          disabled={busy || short || !!blocked}
          onClick={() => void buy()}
          className="rounded-full bg-white py-2 text-xs font-semibold text-black transition active:bg-white/80 disabled:bg-white/15 disabled:text-white/45"
        >
          {blocked ?? (short ? `Need ${fmt(price - money)} more` : busy ? '…' : 'Buy')}
        </button>
      )}
    </li>
  );
}

function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 px-6 py-12 text-center">
      <Icon name="lock" className="text-3xl text-white/50" />
      <div className="text-sm font-semibold text-white">{title}</div>
      <p className="max-w-xs text-xs leading-snug text-white/55">{text}</p>
    </div>
  );
}

function MoneyPacks({ onMessage }: { onMessage: (m: string) => void }) {
  const fmt = useMoneyFormat();
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MONEY_PACKS.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 rounded-2xl border border-white/15 bg-white/[0.07] p-3.5">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-sm font-semibold text-white">{p.label}</span>
              {p.badge && <span className="shrink-0 rounded-full bg-emerald-400/90 px-1.5 text-[10px] font-semibold text-black">{p.badge}</span>}
            </div>
            <span className="text-lg font-semibold tabular-nums text-amber-300">{fmt(p.money)}</span>
            <button
              disabled={!PAYMENTS_ENABLED}
              onClick={async () => onMessage(await buyMoneyPack(p.id))}
              className="rounded-full bg-white py-2 text-xs font-semibold text-black disabled:bg-white/15 disabled:text-white/45"
            >
              {PAYMENTS_ENABLED ? `$${(p.cents / 100).toFixed(2)}` : 'Coming soon'}
            </button>
          </li>
        ))}
      </ul>
      {!PAYMENTS_ENABLED && <p className="mt-3 text-center text-xs text-white/50">Real-money purchases are not open yet.</p>}
    </>
  );
}

/** The shop: a glass pop-up over the game with the things money buys, sorted into categories. */
export function ShopModal() {
  const open = useShopStore((s) => s.open);
  const category = useShopStore((s) => s.category);
  const setCategory = useShopStore((s) => s.setCategory);
  const hide = useShopStore((s) => s.hide);
  const fmt = useMoneyFormat();
  const money = useWalletStore((s) => s.money);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hide]);

  if (!open) return null;
  const items = SHOP_ITEMS.filter((i) => i.category === category);

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[80] flex items-center justify-center bg-black/35 p-3 sm:p-6"
      onClick={hide}
      role="dialog"
      aria-modal="true"
      aria-label="Shop"
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-white/10 text-white shadow-[0_20px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <h2 className="flex-1 text-lg font-semibold tracking-wide">Shop</h2>
          <span className="flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5 text-sm font-semibold tabular-nums text-amber-300">
            <Icon name="coins" />
            {fmt(money)}
          </span>
          <button onClick={hide} aria-label="Close shop" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg active:bg-white/25 sm:hover:bg-white/20">
            <Icon name="close" />
          </button>
        </div>

        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 py-3">
          {SHOP_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setCategory(c.id);
                setMessage(null);
              }}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition ${
                category === c.id ? 'bg-white text-black' : 'bg-white/10 text-white/80 active:bg-white/20 sm:hover:bg-white/15'
              }`}
            >
              <Icon name={c.icon} />
              {c.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {category === 'buildings' ? (
            <ComingSoon title="Buildings are coming" text="Premium buildings and building packs will be sold here. Everything you can build today stays free." />
          ) : category === 'money' ? (
            <MoneyPacks onMessage={setMessage} />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <ItemCard key={item.id} item={item} onMessage={setMessage} />
              ))}
            </ul>
          )}
        </div>

        {message && <div className="border-t border-white/10 px-5 py-3 text-center text-xs text-amber-300">{message}</div>}
      </div>
    </div>
  );
}
