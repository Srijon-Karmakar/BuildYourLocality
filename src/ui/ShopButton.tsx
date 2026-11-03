import { useShopStore } from '../state/useShopStore';
import { Icon } from './icons';

/** Opens the shop pop-up. */
export function ShopButton() {
  const show = useShopStore((s) => s.show);
  return (
    <button
      onClick={() => show()}
      aria-label="Open the shop"
      title="Shop"
      className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/40 pointer-coarse:bg-black/64 text-lg text-white backdrop-blur-[6px] active:bg-white/20 sm:h-10 sm:w-10 sm:text-xl sm:hover:bg-black/48"
    >
      <Icon name="kiosk" />
    </button>
  );
}
